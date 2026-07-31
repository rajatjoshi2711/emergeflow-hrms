import { prisma } from "@/lib/db";
import {
  FULL_TIME_QUARTERLY_LEAVE_PER_TYPE,
  INTERN_MONTHLY_LEAVE_PER_TYPE,
  MONTHLY_WFH_CREDIT,
  computeProratedAmount,
  previousMonthStart,
  previousQuarterStart,
  toUtcDateOnly,
} from "@/lib/leave-rules";
import { LEAVE_TYPE_ID } from "@/lib/leave";

async function alreadyCreditedToday(employeeId: string, leaveTypeId: number, today: Date) {
  const existing = await prisma.leaveLedgerEntry.findFirst({
    where: { employeeId, leaveTypeId, entryType: "credit", effectiveDate: today },
  });
  return existing !== null;
}

async function alreadyCreditedWfhToday(employeeId: string, today: Date) {
  const existing = await prisma.wfhLedgerEntry.findFirst({
    where: { employeeId, entryType: "credit", effectiveDate: today },
  });
  return existing !== null;
}

async function creditLeave(
  employeeId: string,
  leaveTypeId: number,
  amount: number,
  year: number,
  effectiveDate: Date,
  reason: string
) {
  if (amount <= 0) return;
  await prisma.$transaction([
    prisma.leaveLedgerEntry.create({
      data: { employeeId, leaveTypeId, entryType: "credit", amount, effectiveDate, reason },
    }),
    prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
      update: { creditedTotal: { increment: amount } },
      create: { employeeId, leaveTypeId, year, creditedTotal: amount },
    }),
  ]);
}

async function creditWfh(employeeId: string, amount: number, year: number, effectiveDate: Date, reason: string) {
  if (amount <= 0) return;
  await prisma.$transaction([
    prisma.wfhLedgerEntry.create({ data: { employeeId, entryType: "credit", amount, effectiveDate, reason } }),
    prisma.wfhBalance.upsert({
      where: { employeeId_year: { employeeId, year } },
      update: { credited: { increment: amount } },
      create: { employeeId, year, credited: amount },
    }),
  ]);
}

export async function runFullTimeQuarterlyAccrual(today: Date) {
  const day = toUtcDateOnly(today);
  const periodStart = previousQuarterStart(day);
  const year = day.getUTCFullYear();
  const employees = await prisma.employee.findMany({ where: { status: "active", employmentType: "full_time" } });

  let credited = 0;
  for (const employee of employees) {
    for (const leaveTypeId of [LEAVE_TYPE_ID.planned, LEAVE_TYPE_ID.unplanned]) {
      if (await alreadyCreditedToday(employee.id, leaveTypeId, day)) continue;

      const isFirst = !(await prisma.leaveLedgerEntry.findFirst({
        where: { employeeId: employee.id, leaveTypeId, entryType: "credit" },
      }));
      const amount = isFirst
        ? computeProratedAmount(FULL_TIME_QUARTERLY_LEAVE_PER_TYPE, periodStart, day, toUtcDateOnly(employee.joinDate))
        : FULL_TIME_QUARTERLY_LEAVE_PER_TYPE;

      await creditLeave(employee.id, leaveTypeId, amount, year, day, isFirst ? "First-period prorated accrual" : "Quarterly accrual");
      if (amount > 0) credited++;
    }
  }
  return { employeesProcessed: employees.length, creditsWritten: credited };
}

export async function runInternMonthlyAccrual(today: Date) {
  const day = toUtcDateOnly(today);
  const periodStart = previousMonthStart(day);
  const year = day.getUTCFullYear();
  const employees = await prisma.employee.findMany({ where: { status: "active", employmentType: "intern" } });

  let credited = 0;
  for (const employee of employees) {
    for (const leaveTypeId of [LEAVE_TYPE_ID.planned, LEAVE_TYPE_ID.unplanned]) {
      if (await alreadyCreditedToday(employee.id, leaveTypeId, day)) continue;

      const isFirst = !(await prisma.leaveLedgerEntry.findFirst({
        where: { employeeId: employee.id, leaveTypeId, entryType: "credit" },
      }));
      const amount = isFirst
        ? computeProratedAmount(INTERN_MONTHLY_LEAVE_PER_TYPE, periodStart, day, toUtcDateOnly(employee.joinDate))
        : INTERN_MONTHLY_LEAVE_PER_TYPE;

      await creditLeave(employee.id, leaveTypeId, amount, year, day, isFirst ? "First-period prorated accrual" : "Monthly accrual");
      if (amount > 0) credited++;
    }
  }
  return { employeesProcessed: employees.length, creditsWritten: credited };
}

export async function runWfhMonthlyAccrual(today: Date) {
  const day = toUtcDateOnly(today);
  const periodStart = previousMonthStart(day);
  const year = day.getUTCFullYear();
  const employees = await prisma.employee.findMany({ where: { status: "active" } });

  let credited = 0;
  for (const employee of employees) {
    if (await alreadyCreditedWfhToday(employee.id, day)) continue;

    const isFirst = !(await prisma.wfhLedgerEntry.findFirst({
      where: { employeeId: employee.id, entryType: "credit" },
    }));
    const amount = isFirst
      ? computeProratedAmount(MONTHLY_WFH_CREDIT, periodStart, day, toUtcDateOnly(employee.joinDate))
      : MONTHLY_WFH_CREDIT;

    await creditWfh(employee.id, amount, year, day, isFirst ? "First-period prorated accrual" : "Monthly accrual");
    if (amount > 0) credited++;
  }
  return { employeesProcessed: employees.length, creditsWritten: credited };
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
      const remaining = balance ? Number(balance.creditedTotal) - Number(balance.used) - Number(balance.lapsed) : 0;
      if (remaining > 0) {
        await prisma.$transaction([
          prisma.leaveLedgerEntry.create({
            data: { employeeId: employee.id, leaveTypeId, entryType: "lapse", amount: remaining, effectiveDate: day, reason: "Year-end lapse" },
          }),
          prisma.leaveBalance.update({
            where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId, year } },
            data: { lapsed: { increment: remaining } },
          }),
        ]);
        lapsed++;
      }
    }

    const wfhBalance = await prisma.wfhBalance.findUnique({ where: { employeeId_year: { employeeId: employee.id, year } } });
    const wfhRemaining = wfhBalance ? Number(wfhBalance.credited) - Number(wfhBalance.used) - Number(wfhBalance.lapsed) : 0;
    if (wfhRemaining > 0) {
      await prisma.$transaction([
        prisma.wfhLedgerEntry.create({
          data: { employeeId: employee.id, entryType: "lapse", amount: wfhRemaining, effectiveDate: day, reason: "Year-end lapse" },
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
