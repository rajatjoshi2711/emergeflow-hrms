import { prisma } from "@/lib/db";
import type { DayPart, LeaveCode } from "@/generated/prisma/enums";

export const LEAVE_TYPE_ID: Record<LeaveCode, number> = {
  planned: 1,
  unplanned: 2,
};

export function dayAmount(dayPart: DayPart): number {
  return dayPart === "full" ? 1 : 0.5;
}

function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function enumerateDates(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cursor = toDateOnly(start);
  const last = toDateOnly(end);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export type LeaveBalanceSummary = {
  creditedTotal: number;
  used: number;
  lapsed: number;
  pending: number;
  available: number;
};

async function pendingAmount(employeeId: string, leaveTypeId: number, year: number) {
  const requests = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      leaveTypeId,
      status: "pending",
      days: { some: { leaveDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } },
    },
    include: { days: true },
  });

  return requests
    .flatMap((request) => request.days)
    .filter((day) => day.leaveDate.getUTCFullYear() === year)
    .reduce((sum, day) => sum + dayAmount(day.dayPart), 0);
}

export async function getLeaveBalance(
  employeeId: string,
  leaveTypeId: number,
  year: number
): Promise<LeaveBalanceSummary> {
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
  });

  const creditedTotal = Number(balance?.creditedTotal ?? 0);
  const used = Number(balance?.used ?? 0);
  const lapsed = Number(balance?.lapsed ?? 0);
  const pending = await pendingAmount(employeeId, leaveTypeId, year);

  return { creditedTotal, used, lapsed, pending, available: creditedTotal - used - lapsed - pending };
}

export async function getWfhBalance(employeeId: string, year: number): Promise<LeaveBalanceSummary> {
  const balance = await prisma.wfhBalance.findUnique({
    where: { employeeId_year: { employeeId, year } },
  });

  const requests = await prisma.wfhRequest.findMany({
    where: {
      employeeId,
      status: "pending",
      wfhDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
    },
  });

  const creditedTotal = Number(balance?.credited ?? 0);
  const used = Number(balance?.used ?? 0);
  const lapsed = Number(balance?.lapsed ?? 0);
  const pending = requests.length;

  return { creditedTotal, used, lapsed, pending, available: creditedTotal - used - lapsed - pending };
}
