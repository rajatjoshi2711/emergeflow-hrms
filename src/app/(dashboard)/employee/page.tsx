import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LEAVE_TYPE_ID, getLeaveBalance, getWfhBalance } from "@/lib/leave";
import { LogoutButton } from "@/components/LogoutButton";
import { BalanceCard } from "@/components/BalanceCard";
import { LeaveRequestForm } from "@/components/LeaveRequestForm";
import { LeaveRequestList } from "@/components/LeaveRequestList";

export default async function EmployeeDashboard() {
  const session = await getSession();
  if (!session) return null;

  const year = new Date().getFullYear();

  const [plannedBalance, unplannedBalance, wfhBalance, requests] = await Promise.all([
    getLeaveBalance(session.employeeId, LEAVE_TYPE_ID.planned, year),
    getLeaveBalance(session.employeeId, LEAVE_TYPE_ID.unplanned, year),
    getWfhBalance(session.employeeId, year),
    prisma.leaveRequest.findMany({
      where: { employeeId: session.employeeId },
      include: { days: true, leaveType: true },
      orderBy: { requestedAt: "desc" },
    }),
  ]);

  return (
    <div className="ef-container-product flex flex-col gap-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <span className="ef-eyebrow">Employee</span>
          <h1 className="ef-page">{session.name}</h1>
          <p className="ef-caption">{session.employeeCode}</p>
        </div>
        <LogoutButton />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BalanceCard label="Planned leave" balance={plannedBalance} />
        <BalanceCard label="Unplanned leave" balance={unplannedBalance} />
        <BalanceCard label="Work from home" balance={wfhBalance} />
      </div>

      <LeaveRequestForm />

      <div>
        <h2 className="ef-h3 mb-3">Request history</h2>
        <LeaveRequestList requests={requests} />
      </div>
    </div>
  );
}
