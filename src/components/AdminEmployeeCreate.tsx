"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EmployeeModel } from "@/generated/prisma/models/Employee";

type Created = { name: string; email: string; employeeCode: string; role: string; password: string };

const FIELD_CLASS = "rounded-[var(--radius-button)] border px-3 py-2 ef-small";
const FIELD_STYLE = { borderColor: "var(--border)" };

export function AdminEmployeeCreate({ admins }: { admins: EmployeeModel[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [role, setRole] = useState<"admin" | "hr" | "employee">("employee");
  const [employmentType, setEmploymentType] = useState<"full_time" | "intern">("full_time");
  const [joinDate, setJoinDate] = useState(new Date().toISOString().slice(0, 10));
  const [assignedAdminId, setAssignedAdminId] = useState(admins[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const needsApprover = role !== "admin";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          employeeCode,
          role,
          employmentType,
          joinDate,
          assignedAdminId: needsApprover ? assignedAdminId : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not create the account.");
        return;
      }

      setCreated({ ...data.employee, password: data.password });
      setName("");
      setEmail("");
      setEmployeeCode("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPassword() {
    if (!created) return;
    await navigator.clipboard.writeText(created.password);
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {created && (
        <div className="ef-card" style={{ borderColor: "var(--green-300)" }}>
          <h3 className="ef-subhead mb-1">
            Created {created.role} {created.employeeCode}
          </h3>
          <p className="ef-small mb-3">
            {created.name} &middot; {created.email}
          </p>
          <p className="ef-caption mb-1">
            Password, shown once. Copy it now and have them change it after signing in.
          </p>
          <div className="flex items-center gap-2">
            <code
              className="rounded-[var(--radius-button)] px-3 py-2 ef-small"
              style={{ background: "var(--neutral-50)", fontFamily: "var(--font-mono-token)" }}
            >
              {created.password}
            </code>
            <button onClick={copyPassword} className="ef-btn ef-btn-secondary">
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={() => {
                setCreated(null);
                setCopied(false);
              }}
              className="ef-btn ef-btn-text"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="ef-card flex flex-col gap-4">
        <h3 className="ef-subhead">Add someone</h3>

        <div className="flex flex-wrap gap-4">
          <label className="flex flex-1 flex-col gap-1" style={{ minWidth: "12rem" }}>
            <span className="ef-small font-medium">Name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLASS} style={FIELD_STYLE} />
          </label>
          <label className="flex flex-1 flex-col gap-1" style={{ minWidth: "12rem" }}>
            <span className="ef-small font-medium">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD_CLASS} style={FIELD_STYLE} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ef-small font-medium">Employee ID</span>
            <input
              required
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              placeholder="EMP-0003"
              className={FIELD_CLASS}
              style={FIELD_STYLE}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="ef-small font-medium">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={FIELD_CLASS} style={FIELD_STYLE}>
              <option value="employee">Employee</option>
              <option value="hr">HR</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ef-small font-medium">Employment type</span>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value as typeof employmentType)}
              className={FIELD_CLASS}
              style={FIELD_STYLE}
            >
              <option value="full_time">Full time</option>
              <option value="intern">Intern</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ef-small font-medium">Join date</span>
            <input type="date" required value={joinDate} onChange={(e) => setJoinDate(e.target.value)} className={FIELD_CLASS} style={FIELD_STYLE} />
          </label>
          {needsApprover && (
            <label className="flex flex-col gap-1">
              <span className="ef-small font-medium">Approving admin</span>
              <select
                required
                value={assignedAdminId}
                onChange={(e) => setAssignedAdminId(e.target.value)}
                className={FIELD_CLASS}
                style={FIELD_STYLE}
              >
                {admins.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <p className="ef-caption">
          {needsApprover
            ? "Their leave and WFH requests go to the admin you pick here."
            : "Admins approve for the people assigned to them and have no approver of their own."}
        </p>

        {error && (
          <p className="ef-small" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="ef-btn ef-btn-primary self-start">
          {submitting ? "Creating..." : "Create account"}
        </button>
      </form>
    </div>
  );
}
