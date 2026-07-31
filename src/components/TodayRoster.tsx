import type { RosterEntry } from "@/lib/roster";

const STATUS_LABEL: Record<string, string> = {
  present: "Present",
  on_leave: "On leave",
  wfh: "WFH",
};

const STATUS_BADGE: Record<string, string> = {
  present: "ef-badge-success",
  on_leave: "ef-badge-warning",
  wfh: "ef-badge-info",
};

export function TodayRoster({ roster }: { roster: RosterEntry[] }) {
  return (
    <div className="ef-card">
      <div className="flex flex-col gap-2">
        {roster.map(({ employee, status }) => (
          <div key={employee.id} className="flex items-center justify-between border-b py-2 last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-2 ef-small">
              <span className="font-medium">{employee.name}</span>
              <span className="ef-caption">{employee.employeeCode}</span>
            </div>
            <span className={`ef-badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
