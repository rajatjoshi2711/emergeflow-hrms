"use client";

import { useState } from "react";

const MIN_LENGTH = 10;
const FIELD_CLASS = "rounded-[var(--radius-button)] border px-3 py-2 ef-small";
const FIELD_STYLE = { borderColor: "var(--border)" };

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);

    if (newPassword !== confirmPassword) {
      setError("The two new passwords do not match.");
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not change the password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setDone(true);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ef-card flex flex-col gap-4 max-w-sm">
      <h2 className="ef-h3">Change password</h2>

      <label className="flex flex-col gap-1">
        <span className="ef-small font-medium">Current password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={FIELD_CLASS}
          style={FIELD_STYLE}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="ef-small font-medium">New password</span>
        <input
          type="password"
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={FIELD_CLASS}
          style={FIELD_STYLE}
        />
        <span className="ef-caption">At least {MIN_LENGTH} characters.</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="ef-small font-medium">Confirm new password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={FIELD_CLASS}
          style={FIELD_STYLE}
        />
      </label>

      {error && (
        <p className="ef-small" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {done && (
        <p className="ef-small" style={{ color: "var(--green-700)" }}>
          Password changed. You are still signed in on this device.
        </p>
      )}

      <button type="submit" disabled={submitting} className="ef-btn ef-btn-primary self-start">
        {submitting ? "Saving..." : "Change password"}
      </button>
    </form>
  );
}
