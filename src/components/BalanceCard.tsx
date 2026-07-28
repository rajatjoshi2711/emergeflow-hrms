import type { LeaveBalanceSummary } from "@/lib/leave";

export function BalanceCard({ label, balance }: { label: string; balance: LeaveBalanceSummary }) {
  return (
    <div className="ef-card">
      <p className="ef-eyebrow">{label}</p>
      <p className="ef-page mt-1">{balance.available}</p>
      <p className="ef-caption">
        {balance.creditedTotal} credited · {balance.used} used
        {balance.pending > 0 ? ` · ${balance.pending} pending` : ""}
      </p>
    </div>
  );
}
