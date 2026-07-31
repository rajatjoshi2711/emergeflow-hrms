import { prisma } from "@/lib/db";
import {
  FULL_TIME_QUARTERLY_LEAVE_PER_TYPE,
  INTERN_MONTHLY_LEAVE_PER_TYPE,
  MONTHLY_WFH_CREDIT,
  type Cadence,
  accrualPeriodStarts,
  creditForPeriod,
  toUtcDateOnly,
} from "@/lib/leave-rules";
import { LEAVE_TYPE_ID } from "@/lib/leave";
import type { EmploymentType } from "@/generated/prisma/enums";

/** The one place the full-time vs intern difference lives. */
export const LEAVE_ACCRUAL: Record<EmploymentType, { cadence: Cadence; amountPerType: number }> = {
  full_time: { cadence: "quarterly", amountPerType: FULL_TIME_QUARTERLY_LEAVE_PER_TYPE },
  intern: { cadence: "monthly", amountPerType: INTERN_MONTHLY_LEAVE_PER_TYPE },
};

export type AccrualSummary = { employeesProcessed: number; creditsWritten: number };

async function creditLeave(
  employeeId: string,
  leaveTypeId: number,
  amount: number,
  periodStart: Date,
  reason: string
) {
  await prisma.$transaction([
    prisma.leaveLedgerEntry.create({
      data: { employeeId, leaveTypeId, entryType: "credit", amount, effectiveDate: periodStart, reason },
    }),
    prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: periodStart.getUTCFullYear() },
      },
      update: { creditedTotal: { increment: amount } },
      create: {
        employeeId,
        leaveTypeId,
        year: periodStart.getUTCFullYear(),
        creditedTotal: amount,
      },
    }),
  ]);
}

async function creditWfh(employeeId: string, amount: number, periodStart: Date, reason: string) {
  await prisma.$transaction([
    prisma.wfhLedgerEntry.create({
      data: { employeeId, entryType: "credit", amount, effectiveDate: periodStart, reason },
    }),
    prisma.wfhBalance.upsert({
      where: { employeeId_year: { employeeId, year: periodStart.getUTCFullYear() } },
      update: { credited: { increment: amount } },
      create: { employeeId, year: periodStart.getUTCFullYear(), credited: amount },
    }),
  ]);
}

/**
 * Credits every leave period the employee is owed for the current year and has
 * not already been credited for. The ledger's (employee, type, effectiveDate)
 * row is the idempotency key, so re-running is a no-op and a missed cron run
 * is picked up by the next one.
 */
export async function runLeaveAccrual(today: Date): Promise<AccrualSummary> {
  const day = toUtcDateOnly(today);
  const employees = await prisma.employee.findMany({ where: { status: "active" } });

  let creditsWritten = 0;
  for (const employee of employees) {
    const { cadence, amountPerType } = LEAVE_ACCRUAL[employee.employmentType];
    const joinDate = toUtcDateOnly(employee.joinDate);
    const periods = accrualPeriodStarts(joinDate, day, cadence);

    for (const leaveTypeId of [LEAVE_TYPE_ID.planned, LEAVE_TYPE_ID.unplanned]) {
      for (const periodStart of periods) {
        const existing = await prisma.leaveLedgerEntry.findFirst({
          where: { employeeId: employee.id, leaveTypeId, entryType: "credit", effectiveDate: periodStart },
        });
        if (existing) continue;

        const amount = creditForPeriod(amountPerType, periodStart, cadence, joinDate);
        if (amount <= 0) continue;

        const prorated = amount !== amountPerType;
        await creditLeave(
          employee.id,
          leaveTypeId,
          amount,
          periodStart,
          prorated ? "Prorated accrual (joined mid-period)" : `${cadence === "quarterly" ? "Quarterly" : "Monthly"} accrual`
        );
        creditsWritten++;
      }
    }
  }

  return { employeesProcessed: employees.length, creditsWritten };
}

/** WFH is 2 days a month for everyone, regardless of employment type. */
export async function runWfhAccrual(today: Date): Promise<AccrualSummary> {
  const day = toUtcDateOnly(today);
  const employees = await prisma.employee.findMany({ where: { status: "active" } });

  let creditsWritten = 0;
  for (const employee of employees) {
    const joinDate = toUtcDateOnly(employee.joinDate);
    const periods = accrualPeriodStarts(joinDate, day, "monthly");

    for (const periodStart of periods) {
      const existing = await prisma.wfhLedgerEntry.findFirst({
        where: { employeeId: employee.id, entryType: "credit", effectiveDate: periodStart },
      });
      if (existing) continue;

      const amount = creditForPeriod(MONTHLY_WFH_CREDIT, periodStart, "monthly", joinDate);
      if (amount <= 0) continue;

      await creditWfh(
        employee.id,
        amount,
        periodStart,
        amount !== MONTHLY_WFH_CREDIT ? "Prorated accrual (joined mid-month)" : "Monthly accrual"
      );
      creditsWritten++;
    }
  }

  return { employeesProcessed: employees.length, creditsWritten };
}

export async function runYearEndLapse(today: Date) {
  const day = toUtcDateOnly(today);
  const year = day.getUTCFullYear();
  const employees = await prisma.employee.findMany({ where: { status: "active" } });

  let lapsed = 0;
  for (const employee of employees) {
    for (const leaveTypeId of [LEAVE_TYPE_ID.planned, LEAVE_TYPE_ID.unplanned]) {
      const balance = await prisma.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId, year } },
      });
      const remaining = balance
        ? Number(balance.creditedTotal) - Number(balance.used) - Number(balance.lapsed)
        : 0;
      if (remaining > 0) {
        await prisma.$transaction([
          prisma.leaveLedgerEntry.create({
            data: {
              employeeId: employee.id,
              leaveTypeId,
              entryType: "lapse",
              amount: remaining,
              effectiveDate: day,
              reason: "Year-end lapse",
            },
          }),
          prisma.leaveBalance.update({
            where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId, year } },
            data: { lapsed: { increment: remaining } },
          }),
        ]);
        lapsed++;
      }
    }

    const wfhBalance = await prisma.wfhBalance.findUnique({
      where: { employeeId_year: { employeeId: employee.id, year } },
    });
    const wfhRemaining = wfhBalance
      ? Number(wfhBalance.credited) - Number(wfhBalance.used) - Number(wfhBalance.lapsed)
      : 0;
    if (wfhRemaining > 0) {
      await prisma.$transaction([
        prisma.wfhLedgerEntry.create({
          data: {
            employeeId: employee.id,
            entryType: "lapse",
            amount: wfhRemaining,
            effectiveDate: day,
            reason: "Year-end lapse",
          },
        }),
        prisma.wfhBalance.update({
          where: { employeeId_year: { employeeId: employee.id, year } },
          data: { lapsed: { increment: wfhRemaining } },
        }),
      ]);
      lapsed++;
    }
  }
  return { employeesProcessed: employees.length, lapseEntriesWritten: lapsed };
}
