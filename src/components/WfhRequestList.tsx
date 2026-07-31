"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WfhRequestModel } from "@/generated/prisma/models/WfhRequest";

const STATUS_BADGE: Record<string, string> = {
  pending: "ef-badge-warning",
  approved: "ef-badge-success",
  rejected: "ef-badge-danger",
  cancelled: "ef-badge-neutral",
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function WfhRequestList({ requests }: { requests: WfhRequestModel[] }) {
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      await fetch(`/api/wfh-requests/${id}/cancel`, { method: "POST" });
      router.refresh();
    } finally {
      setCancellingId(null);
    }
  }

  if (requests.length === 0) {
    return <p className="ef-small">No WFH requests yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((request) => (
        <div key={request.id} className="ef-card flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="ef-subhead">{formatDate(request.wfhDate)}</span>
            <span className={`ef-badge ${STATUS_BADGE[request.status]}`}>{request.status}</span>
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
