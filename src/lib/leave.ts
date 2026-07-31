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

export type LeaveDecisionResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

async function loadPendingRequestForAdmin(requestId: string, adminId: string) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { employee: true, days: true },
  });

  if (!request) {
    return { request: null, error: { status: 404, error: "Request not found" } as const };
  }
  if (request.employee.assignedAdminId !== adminId) {
    return { request: null, error: { status: 403, error: "Not authorized for this employee" } as const };
  }
  if (request.status !== "pending") {
    return { request: null, error: { status: 400, error: "Request is no longer pending" } as const };
  }
  return { request, error: null };
}

export async function approveLeaveRequest(requestId: string, adminId: string): Promise<LeaveDecisionResult> {
  const { request, error } = await loadPendingRequestForAdmin(requestId, adminId);
  if (error) return { ok: false, ...error };
  if (!request) return { ok: false, status: 404, error: "Request not found" };

  const year = request.days[0].leaveDate.getUTCFullYear();
  const amount = request.days.reduce((sum, day) => sum + dayAmount(day.dayPart), 0);

  await prisma.$transaction([
    prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: "approved", approverId: adminId, decidedAt: new Date() },
    }),
    prisma.leaveLedgerEntry.create({
      data: {
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        entryType: "debit",
        amount,
        effectiveDate: new Date(),
        reason: `Approved leave request ${requestId}`,
        createdById: adminId,
      },
    }),
    prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year } },
      update: { used: { increment: amount } },
      create: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year, used: amount },
    }),
  ]);

  return { ok: true };
}

export async function rejectLeaveRequest(requestId: string, adminId: string): Promise<LeaveDecisionResult> {
  const { request, error } = await loadPendingRequestForAdmin(requestId, adminId);
  if (error) return { ok: false, ...error };
  if (!request) return { ok: false, status: 404, error: "Request not found" };

  await prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: "rejected", approverId: adminId, decidedAt: new Date() },
  });

  return { ok: true };
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

async function loadPendingWfhRequestForAdmin(requestId: string, adminId: string) {
  const request = await prisma.wfhRequest.findUnique({
    where: { id: requestId },
    include: { employee: true },
  });

  if (!request) {
    return { request: null, error: { status: 404, error: "Request not found" } as const };
  }
  if (request.employee.assignedAdminId !== adminId) {
    return { request: null, error: { status: 403, error: "Not authorized for this employee" } as const };
  }
  if (request.status !== "pending") {
    return { request: null, error: { status: 400, error: "Request is no longer pending" } as const };
  }
  return { request, error: null };
}

export async function approveWfhRequest(requestId: string, adminId: string): Promise<LeaveDecisionResult> {
  const { request, error } = await loadPendingWfhRequestForAdmin(requestId, adminId);
  if (error) return { ok: false, ...error };
  if (!request) return { ok: false, status: 404, error: "Request not found" };

  const year = request.wfhDate.getUTCFullYear();

  await prisma.$transaction([
    prisma.wfhRequest.update({
      where: { id: requestId },
      data: { status: "approved", approverId: adminId, decidedAt: new Date() },
    }),
    prisma.wfhLedgerEntry.create({
      data: {
        employeeId: request.employeeId,
        entryType: "debit",
        amount: 1,
        effectiveDate: new Date(),
        reason: `Approved WFH request ${requestId}`,
      },
    }),
    prisma.wfhBalance.upsert({
      where: { employeeId_year: { employeeId: request.employeeId, year } },
      update: { used: { increment: 1 } },
      create: { employeeId: request.employeeId, year, used: 1 },
    }),
  ]);

  return { ok: true };
}

export async function rejectWfhRequest(requestId: string, adminId: string): Promise<LeaveDecisionResult> {
  const { request, error } = await loadPendingWfhRequestForAdmin(requestId, adminId);
  if (error) return { ok: false, ...error };
  if (!request) return { ok: false, status: 404, error: "Request not found" };

  await prisma.wfhRequest.update({
    where: { id: requestId },
    data: { status: "rejected", approverId: adminId, decidedAt: new Date() },
  });

  return { ok: true };
}
