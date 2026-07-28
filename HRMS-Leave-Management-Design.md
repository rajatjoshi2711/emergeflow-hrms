EMERGEFLOW · INTERNAL DESIGN DOCUMENT

# HRMS Leave Management — Design

Every full-time employee gets 8 planned and 8 unplanned days a year. Every intern gets 1 of each a month. Both roll forward inside the calendar year and lapse once, on December 31st. This document lays out the roles, data model, and rules needed to build that, plus work-from-home tracking and the holiday calendar.

---

## 1. Roles and permissions

Three roles. HR is an employee record with an extra dashboard, not a separate approval path.

| Capability | Employee | HR | Admin |
|---|---|---|---|
| Submit leave / WFH request | Yes | Yes | Yes |
| View own balance and history | Yes | Yes | Yes |
| Approve / reject requests | No | No | Yes, for assigned employees only |
| View today's roster (who's in, on leave, WFH) | No | Yes | Yes |
| Manage employee-to-admin assignment | No | No | Yes |
| Manage holiday calendar and floating-holiday cap | No | No | Yes |
| Configure leave policy constants | No | No | Yes |

Admins are assigned employees directly: each employee has one `assigned_admin_id`. An admin approves only their own assignees. Multiple admins can exist, each with their own set of assignees. There is no manager layer above admin, and no fallback admin for unassigned employees. Reassignment when an admin exits is out of scope for this version.

---

## 2. Data model

Postgres-flavored DDL, annotated. The ledger tables are the source of truth; balance tables are derived and can be rebuilt from the ledger at any time.

```sql
CREATE TYPE role AS ENUM ('admin', 'hr', 'employee');
CREATE TYPE employment_type AS ENUM ('full_time', 'intern');
CREATE TYPE employee_status AS ENUM ('active', 'exited');

CREATE TABLE employees (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code     TEXT UNIQUE NOT NULL,  -- human-readable ID assigned at onboarding, shown on the employee's dashboard
  name              TEXT NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  role              role NOT NULL DEFAULT 'employee',
  employment_type   employment_type NOT NULL,
  assigned_admin_id UUID REFERENCES employees(id),  -- null only for admins themselves
  join_date         DATE NOT NULL,
  status            employee_status NOT NULL DEFAULT 'active'
);
```

```sql
CREATE TYPE leave_code AS ENUM ('planned', 'unplanned');

-- Only two rows ever exist here: planned and unplanned. Accrual cadence
-- (quarterly vs. monthly) and entitlement amounts are derived from the
-- employee's employment_type at accrual time, not stored on this table.
CREATE TABLE leave_types (
  id   SMALLINT PRIMARY KEY,
  code leave_code NOT NULL UNIQUE
);
```

```sql
CREATE TYPE ledger_entry_type AS ENUM ('credit', 'debit', 'lapse', 'adjustment');

CREATE TABLE leave_ledger_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    UUID NOT NULL REFERENCES employees(id),
  leave_type_id  SMALLINT NOT NULL REFERENCES leave_types(id),
  entry_type     ledger_entry_type NOT NULL,
  amount         NUMERIC(4,1) NOT NULL,  -- supports half-day units
  effective_date DATE NOT NULL,
  reason         TEXT,                  -- e.g. 'Q3 accrual', 'request #123 approved', 'year-end lapse'
  created_by     UUID REFERENCES employees(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Append-only. Balances below are a materialized view over this table, refreshable at any time.

CREATE TABLE leave_balances (
  employee_id    UUID NOT NULL REFERENCES employees(id),
  leave_type_id  SMALLINT NOT NULL REFERENCES leave_types(id),
  year           INT NOT NULL,
  credited_total NUMERIC(4,1) NOT NULL DEFAULT 0,
  used           NUMERIC(4,1) NOT NULL DEFAULT 0,
  lapsed         NUMERIC(4,1) NOT NULL DEFAULT 0,
  PRIMARY KEY (employee_id, leave_type_id, year)
);
```

```sql
CREATE TYPE day_part AS ENUM ('full', 'first_half', 'second_half');
CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

CREATE TABLE leave_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    UUID NOT NULL REFERENCES employees(id),
  leave_type_id  SMALLINT NOT NULL REFERENCES leave_types(id),
  reason         TEXT,
  status         request_status NOT NULL DEFAULT 'pending',
  approver_id    UUID REFERENCES employees(id),
  is_retroactive BOOLEAN NOT NULL DEFAULT false,  -- true when filed after the leave date; unplanned only
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ
);

CREATE TABLE leave_request_days (
  leave_request_id UUID NOT NULL REFERENCES leave_requests(id),
  leave_date        DATE NOT NULL,
  day_part          day_part NOT NULL DEFAULT 'full',
  PRIMARY KEY (leave_request_id, leave_date)
);
```

```sql
CREATE TABLE wfh_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id),
  wfh_date     DATE NOT NULL,
  status       request_status NOT NULL DEFAULT 'pending',
  approver_id  UUID REFERENCES employees(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ
);

CREATE TABLE wfh_ledger_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    UUID NOT NULL REFERENCES employees(id),
  entry_type     ledger_entry_type NOT NULL,
  amount         NUMERIC(4,1) NOT NULL,
  effective_date DATE NOT NULL,
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wfh_balances (
  employee_id UUID NOT NULL REFERENCES employees(id),
  year        INT NOT NULL,
  credited    NUMERIC(4,1) NOT NULL DEFAULT 0,
  used        NUMERIC(4,1) NOT NULL DEFAULT 0,
  lapsed      NUMERIC(4,1) NOT NULL DEFAULT 0,
  PRIMARY KEY (employee_id, year)
);
```

```sql
CREATE TYPE holiday_type AS ENUM ('fixed', 'floating');

CREATE TABLE holidays (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  holiday_date     DATE NOT NULL,
  holiday_type     holiday_type NOT NULL,
  applicable_year  INT NOT NULL
);

CREATE TABLE holiday_policy (
  applicable_year               INT PRIMARY KEY,
  max_floating_holidays_per_emp SMALLINT NOT NULL  -- set by admin each year
);

CREATE TABLE floating_holiday_selections (
  employee_id UUID NOT NULL REFERENCES employees(id),
  holiday_id  UUID NOT NULL REFERENCES holidays(id),
  year        INT NOT NULL,
  PRIMARY KEY (employee_id, holiday_id)
);
-- Application layer enforces: count of an employee's rows for `year`
-- must not exceed holiday_policy.max_floating_holidays_per_emp for that year.
```

---

## 3. Accrual rules

| Employment type | Cadence | Trigger | Credited each time |
|---|---|---|---|
| Full-time | Quarterly | 1st of Jan / Apr / Jul / Oct | 2 planned + 2 unplanned |
| Intern | Monthly | 1st of every month | 1 planned + 1 unplanned |
| Everyone | Monthly | 1st of every month | 2 WFH days |

A scheduled job runs on each trigger date and writes `credit` rows to the relevant ledger. Balances are then recalculated (or incrementally updated) from the ledger — never edited directly.

**Proration for new joiners:** an employee who joins mid-quarter (full-time) or mid-month (intern) is credited a prorated amount for that first partial period, calculated as `(days remaining in period / total days in period) × standard credit`, rounded to the nearest half-day. Every subsequent period credits the full standard amount.

---

## 4. Rollover and lapsing

Planned, unplanned, and WFH balances all carry forward within the calendar year — there's no quarterly or monthly forfeiture. Everything lapses exactly once: on December 31st, a year-end job reads each employee's remaining balance across all three ledgers and writes a `lapse` entry that zeroes it out. January 1st starts clean, funded by that year's first accrual.

---

## 5. Approval workflow

Leave requests and WFH requests share one state machine:

```
pending → approved
pending → rejected
pending → cancelled   (employee withdraws before a decision)
```

The approver is always the requester's `assigned_admin_id`. HR has no path into this state machine beyond viewing outcomes on the roster dashboard.

**Retroactive unplanned leave:** unplanned leave can be filed after the leave date itself — `is_retroactive` is set true, and `requested_at` will postdate the `leave_date`. Planned leave and WFH must be requested for present or future dates only; the application layer enforces this per leave type.

---

## 6. Dashboards

- **Employee:** their employee ID (assigned at onboarding, shown alongside their name), own balances (planned, unplanned, WFH), request history, new request form, floating-holiday picker.
- **HR:** everything an employee sees for themselves, plus a read-only roster of who's present, on leave, or WFH today across the whole company. No approve or reject controls.
- **Admin:** everything HR sees, plus a pending-approval queue scoped to their assigned employees, employee-to-admin assignment management, and the holiday calendar and floating-holiday cap for the year.

---

## 7. Out of scope for this version

- Reassigning an admin's employees when that admin exits — no fallback path is provisioned yet.

---

## Verification

Before building against this document, confirm it against the source requirements: entitlement counts (8/8 full-time annually, 1/1 intern monthly), accrual triggers (quarter-start for full-time, month-start for interns and WFH), the single year-end lapse, the three-role permission matrix, and the two holiday types. Each is represented in sections 1, 3, 4, and 6 above.
