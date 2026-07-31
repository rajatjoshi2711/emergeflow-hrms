"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EmployeeModel } from "@/generated/prisma/models/Employee";

export function AdminEmployeeAssignment({
  employees,
  admins,
}: {
  employees: EmployeeModel[];
  admins: EmployeeModel[];
}) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);

  async function handleChange(employeeId: string, assignedAdminId: string) {
    setSavingId(employeeId);
    try {
      await fetch(`/api/admin/employees/${employeeId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedAdminId }),
      });
      router.refresh();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="ef-card">
      <div className="flex flex-col gap-2">
        {employees.map((employee) => (
          <div key={employee.id} className="flex items-center justify-between border-b py-2 last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-2 ef-small">
              <span className="font-medium">{employee.name}</span>
              <span className="ef-caption">{employee.employeeCode}</span>
              <span className="ef-badge ef-badge-neutral capitalize">{employee.role}</span>
            </div>
            <select
              value={employee.assignedAdminId ?? ""}
              onChange={(e) => handleChange(employee.id, e.target.value)}
              disabled={savingId === employee.id}
              className="rounded-[var(--radius-button)] border px-3 py-2 ef-small"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="" disabled>
                Unassigned
              </option>
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
