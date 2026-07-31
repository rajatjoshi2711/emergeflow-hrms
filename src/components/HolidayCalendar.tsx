"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HolidayModel } from "@/generated/prisma/models/Holiday";

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function HolidayCalendar({
  fixedHolidays,
  floatingHolidays,
  selectedHolidayIds,
  cap,
}: {
  fixedHolidays: HolidayModel[];
  floatingHolidays: HolidayModel[];
  selectedHolidayIds: string[];
  cap: number;
}) {
  const router = useRouter();
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedCount = selectedHolidayIds.length;

  async function toggle(holidayId: string, selected: boolean) {
    setActingId(holidayId);
    setError(null);
    try {
      const response = selected
        ? await fetch(`/api/floating-holidays/${holidayId}`, { method: "DELETE" })
        : await fetch("/api/floating-holidays", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ holidayId }),
          });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="ef-card">
        <h3 className="ef-subhead mb-2">Fixed holidays</h3>
        {fixedHolidays.length === 0 ? (
          <p className="ef-small">No fixed holidays set for this year.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {fixedHolidays.map((holiday) => (
              <div key={holiday.id} className="flex items-center gap-2 ef-small">
                <span className="ef-caption w-16">{formatDate(holiday.holidayDate)}</span>
                <span>{holiday.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ef-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="ef-subhead">Floating holidays</h3>
          <span className="ef-caption">
            {selectedCount} of {cap} selected
          </span>
        </div>
        {error && (
          <p className="ef-small mb-2" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        {floatingHolidays.length === 0 ? (
          <p className="ef-small">No floating holidays available this year.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {floatingHolidays.map((holiday) => {
              const selected = selectedHolidayIds.includes(holiday.id);
              return (
                <div key={holiday.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 ef-small">
                    <span className="ef-caption w-16">{formatDate(holiday.holidayDate)}</span>
                    <span>{holiday.name}</span>
                  </div>
                  <button
                    onClick={() => toggle(holiday.id, selected)}
                    disabled={actingId === holiday.id || (!selected && selectedCount >= cap)}
                    className={selected ? "ef-btn ef-btn-secondary" : "ef-btn ef-btn-primary"}
                  >
                    {actingId === holiday.id ? "Working..." : selected ? "Remove" : "Select"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
