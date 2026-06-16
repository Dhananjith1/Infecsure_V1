import { useEffect, useState } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { getRootCauseInsights, listAlerts } from "../../api/alerts";
import { getHeatmap, getPublicHeatmap } from "../../api/heatmap";
import { listLabResults } from "../../api/lab";
import { apiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { HeatmapGrid } from "../../components/HeatmapGrid";
import { RiskBadge } from "../../components/RiskBadge";
import { RootCauseInsightCard } from "../../components/RootCauseInsightCard";
import { Skeleton } from "../../components/Skeleton";
import { StatusBadge } from "../../components/StatusBadge";
import type { AlertItem, HeatmapWard, LabResult } from "../../types";

export function Surveillance() {
  const [wards, setWards] = useState<HeatmapWard[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [insights, setInsights] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  async function loadSurveillance() {
    setLoading(true);
    const nextErrors: string[] = [];

    try {
      const publicHeatmap = await getPublicHeatmap();
      setWards(publicHeatmap.heatmap || []);
    } catch (error) {
      setWards([]);
      nextErrors.push(`Public heatmap request failed: ${apiErrorMessage(error)}`);
    }

    setLoading(false);

    try {
      const protectedHeatmap = await getHeatmap();
      if (protectedHeatmap.heatmap?.length) setWards(protectedHeatmap.heatmap);
    } catch (error) {
      nextErrors.push(`Protected heatmap request failed, showing validated public heatmap: ${apiErrorMessage(error)}`);
    }

    try {
      setAlerts(await listAlerts());
    } catch (error) {
      setAlerts([]);
      nextErrors.push(`Alerts request failed: ${apiErrorMessage(error)}`);
    }

    try {
      setLabResults(await listLabResults());
    } catch (error) {
      setLabResults([]);
      nextErrors.push(`Lab results request failed: ${apiErrorMessage(error)}`);
    }

    try {
      const value = await getRootCauseInsights();
      setInsights(Array.isArray(value) ? value : value?.rules || []);
    } catch (error) {
      setInsights([]);
      nextErrors.push(`Apriori request failed: ${apiErrorMessage(error)}`);
    }

    setErrors(nextErrors);
  }

  useEffect(() => {
    loadSurveillance();
  }, []);

  const trendBreaks = labResults.filter((item) => item.anomaly?.is_anomaly);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Surveillance</h1>
        <p className="mt-1 text-sm text-slate-600">Ward infection monitoring, Z-score anomaly visibility, and Apriori root-cause association rules.</p>
      </div>

      {errors.length ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Some surveillance data did not load.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
          <Button className="mt-3" type="button" variant="secondary" onClick={loadSurveillance}>Retry data load</Button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardBody><p className="text-sm text-slate-500">Wards monitored</p>{loading ? <Skeleton className="mt-2 h-9 w-16" /> : <p className="mt-2 text-3xl font-bold text-clinical-800">{wards.length}</p>}</CardBody></Card>
        <Card><CardBody><p className="text-sm text-slate-500">Z-score trend breaks</p>{loading ? <Skeleton className="mt-2 h-9 w-16" /> : <p className="mt-2 text-3xl font-bold text-red-700">{trendBreaks.length}</p>}</CardBody></Card>
        <Card><CardBody><p className="text-sm text-slate-500">Apriori rules</p>{loading ? <Skeleton className="mt-2 h-9 w-16" /> : <p className="mt-2 text-3xl font-bold text-amber-700">{insights.length}</p>}</CardBody></Card>
      </div>

      <Card>
        <CardHeader title="Ward Infection Risk Monitor" description="Dynamic heatmap for ward-level surveillance." />
        <CardBody>{loading ? <Skeleton className="h-52" /> : <HeatmapGrid wards={wards} />}</CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Apriori Root Cause Insights" description="Association rules linking hygiene failures with pathogen/outbreak patterns." />
          <CardBody className="space-y-3">
            {loading ? <Skeleton className="h-24" /> : null}
            {!loading && !insights.length ? <p className="text-sm text-slate-500">No Apriori rules returned yet.</p> : null}
            {insights.slice(0, 10).map((item, index) => (
              <RootCauseInsightCard key={index} insight={item} />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Z-score and Outbreak Alerts" description="Pending or approved signals generated from lab data and risk prediction." />
          <CardBody className="space-y-3">
            {loading ? <Skeleton className="h-24" /> : null}
            {!loading && !alerts.length ? <p className="text-sm text-slate-500">No alerts returned.</p> : null}
            {alerts.slice(0, 10).map((alert) => (
              <article key={alert.alert_id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap gap-2"><StatusBadge status={alert.status} /><RiskBadge level={alert.severity} /></div>
                <div className="mt-3 flex gap-3">
                  {alert.alert_type === "anomaly" ? <AlertTriangle className="text-red-600" size={20} /> : <TrendingUp className="text-clinical-700" size={20} />}
                  <div>
                    <p className="font-semibold text-slate-950">{alert.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{alert.description}</p>
                  </div>
                </div>
              </article>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
