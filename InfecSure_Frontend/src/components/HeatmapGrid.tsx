import { MapPin } from "lucide-react";
import type { HeatmapWard } from "../types";
import { formatRiskScore, RiskBadge, riskClasses } from "./RiskBadge";

export function HeatmapGrid({ wards, publicMode = false }: { wards: HeatmapWard[]; publicMode?: boolean }) {
  if (!wards.length) {
    return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">No heatmap data available.</div>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {wards.map((ward) => (
        <article key={ward.ward_id} className={`rounded-lg border p-4 ${riskClasses(ward.risk_level || ward.status)}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <MapPin size={17} />
                <h3 className="font-semibold">{ward.ward_name}</h3>
              </div>
              <p className="mt-1 text-sm opacity-80">{ward.ward_id}</p>
            </div>
            <RiskBadge level={ward.risk_level || ward.status} score={ward.risk_score} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="opacity-70">Risk score</p>
              <p className="text-xl font-bold">{formatRiskScore(ward.risk_score || 0)}</p>
            </div>
            {!publicMode ? (
              <div>
                <p className="opacity-70">Compliance</p>
                <p className="text-xl font-bold">{Math.round(ward.compliance_score ?? 0)}%</p>
              </div>
            ) : (
              <div>
                <p className="opacity-70">Validated alerts</p>
                <p className="text-xl font-bold">{ward.validated_alert_count ?? 0}</p>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
