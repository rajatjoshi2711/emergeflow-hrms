"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HolidayModel } from "@/generated/prisma/models/Holiday";

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function AdminHolidayManager({
  year,
  holidays,
  maxFloatingHolidaysPerEmp,
}: {
  year: number;
  holidays: HolidayModel[];
  maxFloatingHolidaysPerEmp: number;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<"fixed" | "floating">("fixed");
  const [cap, setCap] = useState(String(maxFloatingHolidaysPerEmp));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAddHoliday(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, holidayDate: date, holidayType: type, applicableYear: year }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not add holiday.");
        return;
      }
      setName("");
      setDate("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/holidays/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function handleSaveCap() {
    setError(null);
    const parsedCap = Number(cap);
    if (!Number.isInteger(parsedCap) || parsedCap < 0) {
      setError("Cap must be a non-negative whole number.");
      return;
    }
    const response = await fetch("/api/admin/holiday-policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicableYear: year, maxFloatingHolidaysPerEmp: parsedCap }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Could not save policy.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="ef-card">
        <h3 className="ef-subhead mb-2">Floating holiday cap ({year})</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            className="rounded-[var(--radius-button)] border px-3 py-2 ef-small w-24"
            style={{ borderColor: "var(--border)" }}
          />
          <button onClick={handleSaveCap} className="ef-btn ef-btn-primary">
            Save
          </button>
        </div>
      </div>

      <form onSubmit={handleAddHoliday} className="ef-card flex flex-col gap-4">
        <h3 className="ef-subhead">Add holiday</h3>
        <div className="flex gap-4">
          <label className="flex flex-1 flex-col gap-1">
            <span className="ef-small font-medium">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-[var(--radius-button)] border px-3 py-2 ef-small"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="ef-small font-medium">Date</span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-[var(--radius-button)] border px-3 py-2 ef-small"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ef-small font-medium">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "fixed" | "floating")}
              className="rounded-[var(--radius-button)] border px-3 py-2 ef-small"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="fixed">Fixed</option>
              <option value="floating">Floating</option>
            </select>
          </label>
        </div>
        {error && (
          <p className="ef-small" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className="ef-btn ef-btn-primary self-start">
          {submitting ? "Adding..." : "Add holiday"}
        </button>
      </form>

      <div className="ef-card">
        <h3 className="ef-subhead mb-2">Holidays ({year})</h3>
        {holidays.length === 0 ? (
          <p className="ef-small">No holidays added yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {holidays.map((holiday) => (
              <div key={holiday.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2 ef-small">
                  <span className="ef-caption w-16">{formatDate(holiday.holidayDate)}</span>
                  <span>{holiday.name}</span>
                  <span className="ef-badge ef-badge-neutral capitalize">{holiday.holidayType}</span>
                </div>
                <button onClick={() => handleDelete(holiday.id)} className="ef-btn ef-btn-secondary">
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
