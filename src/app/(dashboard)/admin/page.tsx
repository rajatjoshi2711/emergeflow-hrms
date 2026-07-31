import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getLeaveBalance } from "@/lib/leave";
import { LogoutButton } from "@/components/LogoutButton";
import { AdminApprovalQueue } from "@/components/AdminApprovalQueue";
import { AdminRecentDecisions } from "@/components/AdminRecentDecisions";

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session) return null;

  const [pending, recentDecisions] = await Promise.all([
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
  ]);

  const pendingWithBalance = await Promise.all(
    pending.map(async (request) => {
      const year = request.days[0].leaveDate.getUTCFullYear();
      const balance = await getLeaveBalance(request.employeeId, request.leaveTypeId, year);
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
        <h2 className="ef-h3 mb-3">Pending approvals</h2>
        <AdminApprovalQueue pendingRequests={pendingWithBalance} />
      </div>

      <div>
        <h2 className="ef-h3 mb-3">Recent decisions</h2>
        <AdminRecentDecisions decisions={recentDecisions} />
      </div>
    </div>
  );
}
