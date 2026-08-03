import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getLeaveBalance } from "@/lib/leave";
import { getHolidaysForYear, getHolidayPolicy } from "@/lib/holidays";
import { getTodayRoster } from "@/lib/roster";
import { LogoutButton } from "@/components/LogoutButton";
import { AdminApprovalQueue } from "@/components/AdminApprovalQueue";
import { AdminRecentDecisions } from "@/components/AdminRecentDecisions";
import { AdminWfhApprovalQueue } from "@/components/AdminWfhApprovalQueue";
import { AdminHolidayManager } from "@/components/AdminHolidayManager";
import { AdminEmployeeAssignment } from "@/components/AdminEmployeeAssignment";
import { AdminEmployeeCreate } from "@/components/AdminEmployeeCreate";
import { TodayRoster } from "@/components/TodayRoster";

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session) return null;

  const year = new Date().getFullYear();

  const [pending, recentDecisions, pendingWfh, holidays, policy, roster, employees, admins] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: "pending", employee: { assignedAdminId: session.employeeId } },
      include: { employee: true, leaveType: true, days: true },
      orderBy: { requestedAt: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: { status: { in: ["approved", "rejected"] }, approverId: session.employeeId },
      include: { employee: true, leaveType: true, days: true },
      orderBy: { decidedAt: "desc" },
      take: 10,
    }),
    prisma.wfhRequest.findMany({
      where: { status: "pending", employee: { assignedAdminId: session.employeeId } },
      include: { employee: true },
      orderBy: { requestedAt: "asc" },
    }),
    getHolidaysForYear(year),
    getHolidayPolicy(year),
    getTodayRoster(),
    prisma.employee.findMany({ where: { role: { not: "admin" } }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { role: "admin" }, orderBy: { name: "asc" } }),
  ]);

  const pendingWithBalance = await Promise.all(
    pending.map(async (request) => {
      const requestYear = request.days[0].leaveDate.getUTCFullYear();
      const balance = await getLeaveBalance(request.employeeId, request.leaveTypeId, requestYear);
      return { ...request, availableBalance: balance.available };
    })
  );

  return (
    <div className="ef-container-product flex flex-col gap-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <span className="ef-eyebrow">Admin</span>
          <h1 className="ef-page">{session.name}</h1>
        </div>
        <LogoutButton />
      </div>

      <div>
        <h2 className="ef-h3 mb-3">Pending leave approvals</h2>
        <AdminApprovalQueue pendingRequests={pendingWithBalance} />
      </div>

      <div>
        <h2 className="ef-h3 mb-3">Pending WFH approvals</h2>
        <AdminWfhApprovalQueue pendingRequests={pendingWfh} />
      </div>

      <div>
        <h2 className="ef-h3 mb-3">Recent decisions</h2>
        <AdminRecentDecisions decisions={recentDecisions} />
      </div>

      <div>
        <h2 className="ef-h3 mb-3">Today&apos;s roster</h2>
        <TodayRoster roster={roster} />
      </div>

      <div>
        <h2 className="ef-h3 mb-3">People</h2>
        <AdminEmployeeCreate admins={admins} />
      </div>

      <div>
        <h2 className="ef-h3 mb-3">Employee assignment</h2>
        <AdminEmployeeAssignment employees={employees} admins={admins} />
      </div>

      <div>
        <h2 className="ef-h3 mb-3">Holiday calendar</h2>
        <AdminHolidayManager year={year} holidays={holidays} maxFloatingHolidaysPerEmp={policy?.maxFloatingHolidaysPerEmp ?? 0} />
      </div>
    </div>
  );
}
