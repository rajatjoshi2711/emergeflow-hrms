"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WfhRequestForm() {
  const router = useRouter();
  const [wfhDate, setWfhDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/wfh-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wfhDate }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not submit the request.");
        return;
      }

      setWfhDate("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ef-card flex flex-col gap-4">
      <h2 className="ef-h3">New WFH request</h2>

      <label className="flex flex-col gap-1 max-w-xs">
        <span className="ef-small font-medium">Date</span>
        <input
          type="date"
          required
          value={wfhDate}
          onChange={(e) => setWfhDate(e.target.value)}
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
