"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WfhRequestModel } from "@/generated/prisma/models/WfhRequest";
import type { EmployeeModel } from "@/generated/prisma/models/Employee";

type PendingWfhRequest = WfhRequestModel & { employee: EmployeeModel };

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function AdminWfhApprovalQueue({ pendingRequests }: { pendingRequests: PendingWfhRequest[] }) {
  const router = useRouter();
  const [actingId, setActingId] = useState<string | null>(null);

  async function decide(id: string, action: "approve" | "reject") {
    setActingId(id);
    try {
      await fetch(`/api/wfh-requests/${id}/${action}`, { method: "POST" });
      router.refresh();
    } finally {
      setActingId(null);
    }
  }

  if (pendingRequests.length === 0) {
    return <p className="ef-small">No pending WFH requests.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {pendingRequests.map((request) => (
        <div key={request.id} className="ef-card flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="ef-subhead">{request.employee.name}</span>
            <span className="ef-caption">{request.employee.employeeCode}</span>
            <span className="ef-caption">{formatDate(request.wfhDate)}</span>
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
