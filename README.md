# HRMS - Leave Management

Leave, work-from-home, and holiday management for EmergeFlow. Employees request
time off, their assigned admin approves or rejects it, and balances accrue
automatically on a schedule.

The business rules this implements are specified in
[HRMS-Leave-Management-Design.md](./HRMS-Leave-Management-Design.md). Read that
first if you are changing accrual, lapsing, or approval behaviour.

## Stack

- **Next.js 16** (App Router, TypeScript) - UI and API in one deployable
- **Prisma 7** with the `@prisma/adapter-pg` driver adapter
- **Neon Postgres**, provisioned through Vercel's Storage tab
- **Vercel** for hosting, including Vercel Cron for scheduled accrual
- Auth is email + password: bcrypt hashes, a JWT session in an httpOnly cookie

## Local setup

```bash
npm install
cp .env.example .env   # then fill in the values
npx prisma db push     # create tables
npx prisma db seed     # create dev accounts
npm run dev
```

`npm install` runs `prisma generate` via `postinstall`, so the generated client
in `src/generated/prisma` is rebuilt automatically. It is gitignored on purpose.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon connection string. Use the **pooled** endpoint (hostname contains `-pooler`) since this runs on serverless functions. Omit `channel_binding=require`, which Prisma's connection parser rejects. |
| `JWT_SECRET` | Signs session cookies. `openssl rand -base64 32` |
| `CRON_SECRET` | Shared secret the `/api/cron/*` routes require. `openssl rand -base64 32` |

On Vercel, the Neon integration injects its own prefixed variable (for example
`emergeflow_hrms_DATABASE_URL`). The app reads plain `DATABASE_URL`, so add that
as a separate variable pointing at the same database.

### Seeded accounts (development only)

All seeded accounts use the password `password123`. Never seed production - and
if a database was seeded before going live, delete or re-password those accounts,
because two of them are admins.

| Email | Role | Notes |
| --- | --- | --- |
| `admin.a@company.com` | admin | approves for HR One and Full Time Employee |
| `admin.b@company.com` | admin | approves for Intern Employee |
| `hr@company.com` | hr | read-only roster access, cannot approve |
| `employee.ft@company.com` | employee | full-time |
| `employee.intern@company.com` | employee | intern |

## Creating accounts

There is no public signup. Employee code, role, and admin assignment are
onboarding decisions, so accounts are created with a script:

```bash
# an admin (admins have no approver of their own)
npx tsx scripts/create-employee.ts \
  --email rajat@emergeflow.com --name "Rajat" --code ADM-0003 --role admin

# anyone else must be assigned to an admin who will approve their requests
npx tsx scripts/create-employee.ts \
  --email dev@emergeflow.com --name "Dev" --code EMP-0003 \
  --role employee --type full_time --join-date 2026-08-01 --assign-admin ADM-0003
```

| Flag | Required | Default |
| --- | --- | --- |
| `--email` `--name` `--code` | yes | |
| `--role` | no | `employee` (`admin` \| `hr` \| `employee`) |
| `--type` | no | `full_time` (`full_time` \| `intern`) |
| `--join-date` | no | today (`YYYY-MM-DD`) |
| `--assign-admin` | unless `--role admin` | |
| `--password` | no | generated and printed once |

Omit `--password` so a strong one is generated; it is printed once and only ever
stored hashed. Have the person change it after first sign-in.

Run it against production by pointing `DATABASE_URL` at the production database
for that one command:

```bash
DATABASE_URL="<production url>" npx tsx scripts/create-employee.ts ...
```

Accrual backfills from the join date on the next `/api/cron/accrual` run, so a
new joiner does not need to wait a full period to see a balance.

## Commands

```bash
npm run dev     # dev server
npm run build   # production build
npm test        # unit tests (vitest)
npm run lint    # eslint
```

## How the rules work

**Accrual.** The cadence differs by employment type, and that difference lives in
one place - `LEAVE_ACCRUAL` in `src/lib/accrual.ts`:

| | Cadence | Per leave type | Per year |
| --- | --- | --- | --- |
| Full-time | quarterly | 2 | 8 |
| Intern | monthly | 1 | 12 |
| WFH (everyone) | monthly | 2 | 24 |

A credit covers the period it opens, so anyone already employed on 1 April gets
the full quarter. Only the period an employee *joins partway through* is
prorated, by the fraction of it they will actually work, rounded to a half day.
A full-time joiner starting 15 February therefore gets ~1 day for the remainder
of Q1, then a full 2 on 1 April.

Each run credits every period the employee is still owed for the current year,
not just today's, so a missed cron run is picked up by the next one.

**Lapsing.** Nothing lapses mid-year. Balances carry forward until 31 December,
when a single job zeroes out everything unused.

**Approval.** Every employee has one `assignedAdminId`. Only that admin can
approve or reject their requests. HR has no approval rights at all - it is an
employee record with an extra read-only roster view. Approval writes a ledger
debit and increments `used`; rejection only changes status, since a pending
request never moved anything out of the balance.

**Retroactive requests.** Unplanned leave can be filed for past dates (you were
sick yesterday). Planned leave and WFH cannot.

Balance tables are a cache. The ledger tables are the source of truth and can
rebuild them.

## Scheduled jobs

`vercel.json` registers two cron entries:

| Path | Schedule (UTC) | Does |
| --- | --- | --- |
| `/api/cron/accrual` | `0 0 1 * *` (1st of each month) | Credits whatever leave and WFH periods each employee is owed |
| `/api/cron/lapse` | `0 23 31 12 *` (23:00 on 31 December) | Year-end lapse |

Cron runs in UTC. The lapse job deliberately fires at 23:00 rather than 00:00 so
that 31 December is still usable - at 00:00 UTC people would lose their balance
before the last day had started. 23:00 UTC on the 31st is 04:30 IST on 1 January,
after the year has ended locally, and still inside UTC-year 2026 so the job
targets the right year.

Both require `Authorization: Bearer $CRON_SECRET`, which Vercel Cron sends
automatically. They fail closed if `CRON_SECRET` is unset, and both are
idempotent, so a retry is safe.

This works on Vercel's Hobby plan: the Hobby limit is a *minimum* interval of one
run per day, and monthly and yearly schedules are well under it. Hobby cron
timing is only accurate to within the hour, which does not matter for either job.

Accrual is safe to trigger by hand on any date - it credits only what is missing:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/accrual"
```

**Do not run the lapse route against production to test it.** It zeroes real
balances. Both jobs have verification scripts that run against a throwaway
database and refuse to start unless `DATABASE_URL` contains `hrms_test`:

```bash
DATABASE_URL="...hrms_test..." npx tsx scripts/verify-accrual.ts
DATABASE_URL="...hrms_test..." npx tsx scripts/verify-lapse.ts
```

## Layout

```
prisma/schema.prisma   data model
src/lib/leave-rules.ts pure accrual math (unit tested)
src/lib/accrual.ts     accrual and lapse runners
src/lib/leave.ts       balances, approve/reject
src/lib/holidays.ts    holiday calendar and floating selections
src/lib/roster.ts      today's present/on-leave/WFH view
src/proxy.ts           role guards (Next 16's replacement for middleware.ts)
src/app/(dashboard)/   employee, hr, admin dashboards
src/app/api/           route handlers
```

## Not built yet

Reassigning an admin's employees when that admin leaves. Employees keep pointing
at the departed admin's id and their requests will sit unapproved until someone
reassigns them from the admin dashboard.
