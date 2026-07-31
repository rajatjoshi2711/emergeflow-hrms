"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LeaveRequestModel } from "@/generated/prisma/models/LeaveRequest";
import type { LeaveRequestDayModel } from "@/generated/prisma/models/LeaveRequestDay";
import type { LeaveTypeModel } from "@/generated/prisma/models/LeaveType";
import type { EmployeeModel } from "@/generated/prisma/models/Employee";

type PendingRequest = LeaveRequestModel & {
  employee: EmployeeModel;
  leaveType: LeaveTypeModel;
  days: LeaveRequestDayModel[];
  availableBalance: number;
};

function formatDateRange(days: LeaveRequestDayModel[]): string {
  const dates = days.map((d) => new Date(d.leaveDate)).sort((a, b) => a.getTime() - b.getTime());
  const format = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (dates.length === 1) {
    const label = format(dates[0]);
    return days[0].dayPart === "full" ? label : `${label} (${days[0].dayPart.replace("_", " ")})`;
  }
  return `${format(dates[0])} - ${format(dates[dates.length - 1])}`;
}

export function AdminApprovalQueue({ pendingRequests }: { pendingRequests: PendingRequest[] }) {
  const router = useRouter();
  const [actingId, setActingId] = useState<string | null>(null);

  async function decide(id: string, action: "approve" | "reject") {
    setActingId(id);
    try {
      await fetch(`/api/leave-requests/${id}/${action}`, { method: "POST" });
      router.refresh();
    } finally {
      setActingId(null);
    }
  }

  if (pendingRequests.length === 0) {
    return <p className="ef-small">No pending requests.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {pendingRequests.map((request) => (
        <div key={request.id} className="ef-card flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="ef-subhead">{request.employee.name}</span>
              <span className="ef-caption">{request.employee.employeeCode}</span>
              <span className="ef-badge ef-badge-info capitalize">{request.leaveType.code}</span>
              {request.isRetroactive && <span className="ef-badge ef-badge-warning">retroactive</span>}
            </div>
            <p className="ef-caption">
              {formatDateRange(request.days)} · {request.availableBalance} day(s) available
            </p>
            {request.reason && <p className="ef-small mt-1">{request.reason}</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => decide(request.id, "reject")}
              disabled={actingId === request.id}
              className="ef-btn ef-btn-secondary"
            >
              Reject
            </button>
            <button
              onClick={() => decide(request.id, "approve")}
              disabled={actingId === request.id}
              className="ef-btn ef-btn-primary"
            >
              {actingId === request.id ? "Working..." : "Approve"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
