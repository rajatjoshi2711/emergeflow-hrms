// Pure accrual math - no Prisma/IO here, so this stays easy to unit test.

export const FULL_TIME_QUARTERLY_LEAVE_PER_TYPE = 2; // planned, and separately unplanned
export const INTERN_MONTHLY_LEAVE_PER_TYPE = 1; // planned, and separately unplanned
export const MONTHLY_WFH_CREDIT = 2; // every employee, regardless of employment type

const QUARTER_START_MONTHS = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct

/** Full-time employees accrue leave quarterly; interns monthly. WFH is monthly for everyone. */
export type Cadence = "quarterly" | "monthly";

export function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isMonthStart(date: Date): boolean {
  return date.getUTCDate() === 1;
}

export function isQuarterStart(date: Date): boolean {
  return isMonthStart(date) && QUARTER_START_MONTHS.includes(date.getUTCMonth());
}

/** Start of the accrual period that contains `date`. */
export function periodStartFor(date: Date, cadence: Cadence): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return cadence === "monthly"
    ? new Date(Date.UTC(year, month, 1))
    : new Date(Date.UTC(year, month - (month % 3), 1));
}

export function nextPeriodStart(periodStart: Date, cadence: Cadence): Date {
  const step = cadence === "monthly" ? 1 : 3;
  return new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + step, 1));
}

/**
 * Every period start from the employee's join period through the period
 * containing `today`, bounded to `today`'s calendar year (everything lapses on
 * 31 December, so there is nothing to backfill from an earlier year).
 *
 * Returning the whole list rather than just today's period means a missed cron
 * run self-heals on the next one.
 */
export function accrualPeriodStarts(joinDate: Date, today: Date, cadence: Cadence): Date[] {
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const joinPeriod = periodStartFor(joinDate, cadence);
  const currentPeriod = periodStartFor(today, cadence);

  let cursor = joinPeriod.getTime() > yearStart.getTime() ? joinPeriod : yearStart;
  const periods: Date[] = [];
  while (cursor.getTime() <= currentPeriod.getTime()) {
    periods.push(cursor);
    cursor = nextPeriodStart(cursor, cadence);
  }
  return periods;
}

function daysBetween(start: Date, end: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

export function roundToHalf(amount: number): number {
  return Math.round(amount * 2) / 2;
}

/**
 * Credit for the period starting at `periodStart`.
 *
 * Anyone already employed when the period opens gets the full amount - the
 * credit is for the period ahead, not the one that just closed. Someone who
 * joins partway through gets the fraction of that period they will actually
 * be employed for.
 */
export function creditForPeriod(
  standardAmount: number,
  periodStart: Date,
  cadence: Cadence,
  joinDate: Date
): number {
  const periodEnd = nextPeriodStart(periodStart, cadence);
  if (joinDate.getTime() <= periodStart.getTime()) return standardAmount;
  if (joinDate.getTime() >= periodEnd.getTime()) return 0;

  const totalDays = daysBetween(periodStart, periodEnd);
  const employedDays = daysBetween(joinDate, periodEnd);
  return roundToHalf(standardAmount * (employedDays / totalDays));
}
