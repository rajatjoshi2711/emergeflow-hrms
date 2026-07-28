"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LeaveRequestModel } from "@/generated/prisma/models/LeaveRequest";
import type { LeaveRequestDayModel } from "@/generated/prisma/models/LeaveRequestDay";
import type { LeaveTypeModel } from "@/generated/prisma/models/LeaveType";

type LeaveRequestWithDetails = LeaveRequestModel & {
  days: LeaveRequestDayModel[];
  leaveType: LeaveTypeModel;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "ef-badge-warning",
  approved: "ef-badge-success",
  rejected: "ef-badge-danger",
  cancelled: "ef-badge-neutral",
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

export function LeaveRequestList({ requests }: { requests: LeaveRequestWithDetails[] }) {
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      await fetch(`/api/leave-requests/${id}/cancel`, { method: "POST" });
      router.refresh();
    } finally {
      setCancellingId(null);
    }
  }

  if (requests.length === 0) {
    return <p className="ef-small">No leave requests yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((request) => (
        <div key={request.id} className="ef-card flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="ef-subhead capitalize">{request.leaveType.code}</span>
              <span className={`ef-badge ${STATUS_BADGE[request.status]}`}>{request.status}</span>
              {request.isRetroactive && <span className="ef-badge ef-badge-info">retroactive</span>}
            </div>
            <p className="ef-caption">{formatDateRange(request.days)}</p>
            {request.reason && <p className="ef-small mt-1">{request.reason}</p>}
          </div>
          {request.status === "pending" && (
            <button
              onClick={() => handleCancel(request.id)}
              disabled={cancellingId === request.id}
              className="ef-btn ef-btn-secondary"
            >
              {cancellingId === request.id ? "Cancelling..." : "Cancel"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
