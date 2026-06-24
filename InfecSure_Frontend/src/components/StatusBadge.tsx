import { CheckCircle2, Clock, XCircle } from "lucide-react";

export function StatusBadge({ status }: { status?: string }) {
  const normalized = (status || "pending").toLowerCase();
  const approved = ["approved", "validated", "committed", "dispatched"].includes(normalized);
  const rejected = ["rejected", "failed", "error"].includes(normalized);
  const style = approved
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : rejected
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-indigo-50 text-indigo-700 border-indigo-200";
  const Icon = approved ? CheckCircle2 : rejected ? XCircle : Clock;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>
      <Icon size={14} />
      {normalized.replace("_", " ")}
    </span>
  );
}
