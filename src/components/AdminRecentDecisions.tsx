import type { LeaveRequestModel } from "@/generated/prisma/models/LeaveRequest";
import type { LeaveRequestDayModel } from "@/generated/prisma/models/LeaveRequestDay";
import type { LeaveTypeModel } from "@/generated/prisma/models/LeaveType";
import type { EmployeeModel } from "@/generated/prisma/models/Employee";

type DecidedRequest = LeaveRequestModel & {
  employee: EmployeeModel;
  leaveType: LeaveTypeModel;
  days: LeaveRequestDayModel[];
};

const STATUS_BADGE: Record<string, string> = {
  approved: "ef-badge-success",
  rejected: "ef-badge-danger",
};

function formatDateRange(days: LeaveRequestDayModel[]): string {
  const dates = days.map((d) => new Date(d.leaveDate)).sort((a, b) => a.getTime() - b.getTime());
  const format = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return dates.length === 1 ? format(dates[0]) : `${format(dates[0])} - ${format(dates[dates.length - 1])}`;
}

export function AdminRecentDecisions({ decisions }: { decisions: DecidedRequest[] }) {
  if (decisions.length === 0) {
    return <p className="ef-small">No decisions yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {decisions.map((request) => (
        <div key={request.id} className="ef-card flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <span className="ef-small font-medium">{request.employee.name}</span>
            <span className="ef-caption capitalize">{request.leaveType.code}</span>
            <span className="ef-caption">{formatDateRange(request.days)}</span>
          </div>
          <span className={`ef-badge ${STATUS_BADGE[request.status]}`}>{request.status}</span>
        </div>
      ))}
    </div>
  );
}
