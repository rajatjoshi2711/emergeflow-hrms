import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LEAVE_TYPE_ID, getLeaveBalance, getWfhBalance } from "@/lib/leave";
import { getHolidaysForYear, getHolidayPolicy, getFloatingSelections } from "@/lib/holidays";
import { HeaderActions } from "@/components/HeaderActions";
import { BalanceCard } from "@/components/BalanceCard";
import { LeaveRequestForm } from "@/components/LeaveRequestForm";
import { LeaveRequestList } from "@/components/LeaveRequestList";
import { WfhRequestForm } from "@/components/WfhRequestForm";
import { WfhRequestList } from "@/components/WfhRequestList";
import { HolidayCalendar } from "@/components/HolidayCalendar";

export default async function EmployeeDashboard() {
  const session = await getSession();
  if (!session) return null;

  const year = new Date().getFullYear();

  const [plannedBalance, unplannedBalance, wfhBalance, requests, wfhRequests, holidays, policy, selections] =
    await Promise.all([
      getLeaveBalance(session.employeeId, LEAVE_TYPE_ID.planned, year),
      getLeaveBalance(session.employeeId, LEAVE_TYPE_ID.unplanned, year),
      getWfhBalance(session.employeeId, year),
      prisma.leaveRequest.findMany({
        where: { employeeId: session.employeeId },
        include: { days: true, leaveType: true },
        orderBy: { requestedAt: "desc" },
      }),
      prisma.wfhRequest.findMany({
        where: { employeeId: session.employeeId },
        orderBy: { requestedAt: "desc" },
      }),
      getHolidaysForYear(year),
      getHolidayPolicy(year),
      getFloatingSelections(session.employeeId, year),
    ]);

  const fixedHolidays = holidays.filter((h) => h.holidayType === "fixed");
  const floatingHolidays = holidays.filter((h) => h.holidayType === "floating");

  return (
    <div className="ef-container-product flex flex-col gap-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <span className="ef-eyebrow">Employee</span>
          <h1 className="ef-page">{session.name}</h1>
          <p className="ef-caption">{session.employeeCode}</p>
        </div>
        <HeaderActions />
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

      <WfhRequestForm />

      <div>
        <h2 className="ef-h3 mb-3">WFH history</h2>
        <WfhRequestList requests={wfhRequests} />
      </div>

      <div>
        <h2 className="ef-h3 mb-3">Holidays</h2>
        <HolidayCalendar
          fixedHolidays={fixedHolidays}
          floatingHolidays={floatingHolidays}
          selectedHolidayIds={selections.map((s) => s.holidayId)}
          cap={policy?.maxFloatingHolidaysPerEmp ?? 0}
        />
      </div>
    </div>
  );
}
