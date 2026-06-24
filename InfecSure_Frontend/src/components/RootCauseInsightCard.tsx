import { AlertTriangle } from "lucide-react";

type RootCauseInsight = {
  antecedents?: unknown;
  consequents?: unknown;
  confidence?: unknown;
  lift?: unknown;
  support?: unknown;
  interpretation?: unknown;
};

function asList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function formatSignal(value: string) {
  const normalized = value.toLowerCase();
  const labels: Record<string, string> = {
    "fail:hand_hygiene": "hand hygiene failure",
    "fail:ppe": "PPE compliance failure",
    "fail:waste_segregation": "waste segregation failure",
    "fail:environmental": "environmental hygiene failure",
    "event:anomaly_detected": "Z-score anomaly",
  };
  if (labels[normalized]) return labels[normalized];
  if (normalized.startsWith("pathogen:")) {
    return `${value.slice("pathogen:".length).replace(/_/g, " ")} detection`;
  }
  return value.replace(/^(FAIL:|EVENT:|PATHOGEN:)/i, "").replace(/_/g, " ").toLowerCase();
}

function formatPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${Math.round(numeric * 100)}%`;
}

function formatNumber(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(1);
}

export function RootCauseInsightCard({ insight }: { insight: RootCauseInsight }) {
  const antecedents = asList(insight.antecedents).map(formatSignal);
  const consequents = asList(insight.consequents).map(formatSignal);
  const confidence = formatPercent(insight.confidence);
  const support = formatPercent(insight.support);
  const lift = formatNumber(insight.lift);
  const summary = antecedents.length && consequents.length
    ? `When ${antecedents.join(" and ")} occurs, ${consequents.join(" and ")} is strongly associated.`
    : String(insight.interpretation ?? "Association detected between surveillance signals.");

  return (
    <article className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="flex gap-3">
        <AlertTriangle className="mt-1 shrink-0 text-amber-700" size={18} />
        <div>
          <p className="font-semibold text-slate-950">{summary}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            {confidence ? <span className="rounded-full bg-white px-2.5 py-1 text-amber-800 ring-1 ring-amber-200">Confidence {confidence}</span> : null}
            {support ? <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 ring-1 ring-slate-200">Seen in {support} of patterns</span> : null}
            {lift ? <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 ring-1 ring-slate-200">Strength {lift}x</span> : null}
          </div>
        </div>
      </div>
    </article>
  );
}
