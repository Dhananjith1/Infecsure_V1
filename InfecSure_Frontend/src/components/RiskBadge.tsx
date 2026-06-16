import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";

export function riskClasses(level?: string) {
  const normalized = (level || "low").toLowerCase();
  if (["critical", "high", "red"].includes(normalized)) return "bg-red-50 text-red-700 border-red-200";
  if (["medium", "moderate", "amber", "watch"].includes(normalized)) return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

export function formatRiskScore(score?: number) {
  if (typeof score !== "number" || Number.isNaN(score)) return "";
  const normalized = score > 0 && score <= 1 ? score * 100 : score;
  return String(Math.round(normalized));
}

export function RiskBadge({ level, score }: { level?: string; score?: number }) {
  const normalized = (level || "low").toLowerCase();
  const Icon = ["critical", "high", "red"].includes(normalized) ? AlertTriangle : normalized === "medium" ? CircleAlert : CheckCircle2;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${riskClasses(level)}`}>
      <Icon size={14} />
      {normalized}
      {typeof score === "number" ? ` ${formatRiskScore(score)}` : ""}
    </span>
  );
}
