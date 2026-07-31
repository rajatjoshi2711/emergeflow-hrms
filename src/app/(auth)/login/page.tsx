"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_HOME } from "@/lib/roles";
import type { Role } from "@/generated/prisma/enums";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }

      router.push(ROLE_HOME[data.role as Role] ?? "/");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="ef-card w-full max-w-sm">
        <span className="ef-eyebrow">HRMS</span>
        <h1 className="ef-h3 mt-2 mb-6">Sign in</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="ef-small font-medium">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-[var(--radius-button)] border px-3 py-2 ef-small"
              style={{ borderColor: "var(--border)" }}
              autoComplete="email"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ef-small font-medium">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-[var(--radius-button)] border px-3 py-2 ef-small"
              style={{ borderColor: "var(--border)" }}
              autoComplete="current-password"
            />
          </label>

          {error && (
            <p className="ef-small" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className="ef-btn ef-btn-primary mt-2">
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
