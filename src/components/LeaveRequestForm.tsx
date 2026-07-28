"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DAY_PART_LABEL: Record<string, string> = {
  full: "Full day",
  first_half: "First half",
  second_half: "Second half",
};

export function LeaveRequestForm() {
  const router = useRouter();
  const [leaveCode, setLeaveCode] = useState<"planned" | "unplanned">("planned");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dayPart, setDayPart] = useState<"full" | "first_half" | "second_half">("full");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSingleDay = startDate !== "" && startDate === endDate;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveCode,
          startDate,
          endDate,
          dayPart: isSingleDay ? dayPart : "full",
          reason: reason || undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not submit the request.");
        return;
      }

      setStartDate("");
      setEndDate("");
      setDayPart("full");
      setReason("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ef-card flex flex-col gap-4">
      <h2 className="ef-h3">New leave request</h2>

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1">
          <span className="ef-small font-medium">Type</span>
          <select
            value={leaveCode}
            onChange={(e) => setLeaveCode(e.target.value as "planned" | "unplanned")}
            className="rounded-[var(--radius-button)] border px-3 py-2 ef-small"
            style={{ borderColor: "var(--border)" }}
          >
            <option value="planned">Planned</option>
            <option value="unplanned">Unplanned</option>
          </select>
        </label>
      </div>

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1">
          <span className="ef-small font-medium">Start date</span>
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-[var(--radius-button)] border px-3 py-2 ef-small"
            style={{ borderColor: "var(--border)" }}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="ef-small font-medium">End date</span>
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-[var(--radius-button)] border px-3 py-2 ef-small"
            style={{ borderColor: "var(--border)" }}
          />
        </label>
      </div>

      {isSingleDay && (
        <label className="flex flex-col gap-1">
          <span className="ef-small font-medium">Day part</span>
          <select
            value={dayPart}
            onChange={(e) => setDayPart(e.target.value as typeof dayPart)}
            className="rounded-[var(--radius-button)] border px-3 py-2 ef-small"
            style={{ borderColor: "var(--border)" }}
          >
            {Object.entries(DAY_PART_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="ef-small font-medium">Reason (optional)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="rounded-[var(--radius-button)] border px-3 py-2 ef-small"
          style={{ borderColor: "var(--border)" }}
        />
      </label>

      {error && (
        <p className="ef-small" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting} className="ef-btn ef-btn-primary self-start">
        {submitting ? "Submitting..." : "Submit request"}
      </button>
    </form>
  );
}
