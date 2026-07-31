// Pure accrual math - no Prisma/IO here, so this stays easy to unit test.

export const FULL_TIME_QUARTERLY_LEAVE_PER_TYPE = 2; // planned, and separately unplanned
export const INTERN_MONTHLY_LEAVE_PER_TYPE = 1; // planned, and separately unplanned
export const MONTHLY_WFH_CREDIT = 2; // every employee, regardless of employment type

const QUARTER_START_MONTHS = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct

export function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isMonthStart(date: Date): boolean {
  return date.getUTCDate() === 1;
}

export function isQuarterStart(date: Date): boolean {
  return isMonthStart(date) && QUARTER_START_MONTHS.includes(date.getUTCMonth());
}

export function previousMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

export function previousQuarterStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 3, 1));
}

function daysBetween(start: Date, end: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

export function roundToHalf(amount: number): number {
  return Math.round(amount * 2) / 2;
}

/**
 * Amount to credit for the period [periodStart, periodEnd), given the employee
 * joined on joinDate. Full standard amount if they were already employed for
 * the whole period; prorated by elapsed fraction if they joined partway through.
 */
export function computeProratedAmount(
  standardAmount: number,
  periodStart: Date,
  periodEnd: Date,
  joinDate: Date
): number {
  const clampedStart = joinDate.getTime() > periodStart.getTime() ? joinDate : periodStart;
  if (clampedStart.getTime() >= periodEnd.getTime()) return 0;

  const totalDays = daysBetween(periodStart, periodEnd);
  const employedDays = daysBetween(clampedStart, periodEnd);

  return roundToHalf(standardAmount * (employedDays / totalDays));
}
