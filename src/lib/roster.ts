import { prisma } from "@/lib/db";
import { toUtcDateOnly } from "@/lib/leave-rules";
import type { EmployeeModel } from "@/generated/prisma/models/Employee";

export type RosterStatus = "present" | "on_leave" | "wfh";

export type RosterEntry = {
  employee: EmployeeModel;
  status: RosterStatus;
};

export async function getTodayRoster(): Promise<RosterEntry[]> {
  const today = toUtcDateOnly(new Date());

  const [employees, onLeaveDays, onWfh] = await Promise.all([
    prisma.employee.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    prisma.leaveRequestDay.findMany({
      where: { leaveDate: today, leaveRequest: { status: "approved" } },
      include: { leaveRequest: true },
    }),
    prisma.wfhRequest.findMany({ where: { wfhDate: today, status: "approved" } }),
  ]);

  const onLeaveEmployeeIds = new Set(onLeaveDays.map((d) => d.leaveRequest.employeeId));
  const wfhEmployeeIds = new Set(onWfh.map((r) => r.employeeId));

  return employees.map((employee) => ({
    employee,
    status: onLeaveEmployeeIds.has(employee.id)
      ? "on_leave"
      : wfhEmployeeIds.has(employee.id)
        ? "wfh"
        : "present",
  }));
}
