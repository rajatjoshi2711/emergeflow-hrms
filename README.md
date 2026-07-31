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

### Seeded accounts

All seeded accounts use the password `password123`. Do not seed production.

| Email | Role | Notes |
| --- | --- | --- |
| `admin.a@company.com` | admin | approves for HR One and Full Time Employee |
| `admin.b@company.com` | admin | approves for Intern Employee |
| `hr@company.com` | hr | read-only roster access, cannot approve |
| `employee.ft@company.com` | employee | full-time |
| `employee.intern@company.com` | employee | intern |

## Commands

```bash
npm run dev     # dev server
npm run build   # production build
npm test        # unit tests (vitest)
npm run lint    # eslint
```

## How the rules work

**Accrual.** Full-time employees get 2 planned and 2 unplanned days each quarter
(8 a year). Interns get 1 of each per month. Everyone gets 2 WFH days a month.
An employee's first accrual is prorated from their join date; every period after
that credits the full amount.

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

| Path | Schedule | Does |
| --- | --- | --- |
| `/api/cron/accrual` | `0 0 1 * *` (1st of each month) | Monthly intern and WFH accrual; also quarterly full-time accrual when the 1st falls on a quarter boundary |
| `/api/cron/lapse` | `0 0 31 12 *` (31 December) | Year-end lapse |

Both require `Authorization: Bearer $CRON_SECRET`, which Vercel Cron sends
automatically. They fail closed if `CRON_SECRET` is unset. Both are idempotent -
re-running on the same day writes nothing further - so a retry is safe.

To trigger accrual manually outside a period boundary, add `?force=true`:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://<host>/api/cron/accrual?force=true"
```

**Do not run the lapse route against production to test it.** It zeroes real
balances. Use `scripts/verify-lapse.ts` against a throwaway database instead;
it refuses to run unless `DATABASE_URL` contains `hrms_test`.

```bash
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
