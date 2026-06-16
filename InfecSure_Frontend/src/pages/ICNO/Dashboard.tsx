import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, ClipboardCheck, ShieldCheck, TrendingUp } from "lucide-react";
import { dashboardSummary, getRootCauseInsights, listPendingAlerts } from "../../api/alerts";
import { getHeatmap, getPublicHeatmap } from "../../api/heatmap";
import { getPriorityList } from "../../api/audits";
import { Button } from "../../components/Button";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { HeatmapGrid } from "../../components/HeatmapGrid";
import { RiskBadge } from "../../components/RiskBadge";
import { RootCauseInsightCard } from "../../components/RootCauseInsightCard";
import { Skeleton } from "../../components/Skeleton";
import type { AlertItem, HeatmapWard } from "../../types";

function priorityWardId(item: Record<string, unknown>) {
  return String(item.ward_id ?? item.wardId ?? item.ward ?? item.target_ward ?? "etu").toLowerCase();
}

export function ICNODashboard() {
  const [wards, setWards] = useState<HeatmapWard[]>([]);
  const [pending, setPending] = useState<AlertItem[]>([]);
  const [priorities, setPriorities] = useState<Record<string, unknown>[]>([]);
  const [insights, setInsights] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [priorityLoading, setPriorityLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadHeatmap() {
      setHeatmapLoading(true);
      try {
        const publicHeatmap = await getPublicHeatmap();
        if (!mounted) return;
        setWards(publicHeatmap.heatmap || []);
        setHeatmapLoading(false);
      } catch {
        if (mounted) setHeatmapLoading(false);
      }

      try {
        const protectedHeatmap = await getHeatmap();
        if (mounted && protectedHeatmap.heatmap?.length) setWards(protectedHeatmap.heatmap);
      } catch {
        // Keep the already-loaded public heatmap.
      }
    }

    async function loadCounters() {
      const [pendingResult, summaryResult] = await Promise.allSettled([listPendingAlerts(), dashboardSummary()]);
      if (!mounted) return;
      if (pendingResult.status === "fulfilled") setPending(pendingResult.value || []);
      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
    }

    async function loadPriorities() {
      setPriorityLoading(true);
      try {
        const value = await getPriorityList();
        if (mounted) setPriorities(value || []);
      } finally {
        if (mounted) setPriorityLoading(false);
      }
    }

    async function loadInsights() {
      setInsightLoading(true);
      try {
        const value = await getRootCauseInsights();
        if (mounted) setInsights(Array.isArray(value) ? value : value?.rules || []);
      } finally {
        if (mounted) setInsightLoading(false);
      }
    }

    loadHeatmap();
    loadCounters();
    loadPriorities();
    loadInsights();

    return () => {
      mounted = false;
    };
  }, []);

  const topWard = wards[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">ICNO Command Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Pending validation stays separated from confirmed clinical status.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/icno/audit"><Button icon={<ClipboardCheck size={18} />}>New Audit</Button></Link>
          <Link to="/icno/scan"><Button variant="secondary" icon={<Camera size={18} />}>Scan Document</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardBody><p className="text-sm text-slate-500">Pending approvals</p><p className="mt-2 text-3xl font-bold text-indigo-700">{pending.length}</p></CardBody></Card>
        <Card><CardBody><p className="text-sm text-slate-500">Top risk ward</p><div className="mt-2">{topWard ? <RiskBadge level={topWard.risk_level} score={topWard.risk_score} /> : <Skeleton className="h-7 w-28" />}</div></CardBody></Card>
        <Card><CardBody><p className="text-sm text-slate-500">Wards monitored</p><p className="mt-2 text-3xl font-bold text-emerald-700">{String(summary?.total_wards ?? wards.length)}</p></CardBody></Card>
        <Card><CardBody><p className="text-sm text-slate-500">Trend breaks</p><p className="mt-2 text-3xl font-bold text-red-700">{String(summary?.recent_anomalies ?? 0)}</p></CardBody></Card>
      </div>

      <Card>
        <CardHeader title="Today's Top Priorities" description="Risk-weighted priority output from P = (w1 x C) + (w2 x V) + (w3 x L)." action={<Link to="/icno/approvals"><Button variant="secondary" icon={<ShieldCheck size={18} />}>Review queue</Button></Link>} />
        <CardBody className="space-y-3">
          {priorityLoading ? <Skeleton className="h-24" /> : null}
          {!priorityLoading && !priorities.length ? <p className="text-sm text-slate-500">No priority items returned by the backend.</p> : null}
          {priorities.slice(0, 5).map((item, index) => (
            <Link key={index} to={`/icno/audit?ward=${encodeURIComponent(priorityWardId(item))}`} className="block rounded-md border border-slate-200 p-4 transition hover:border-clinical-600 hover:bg-clinical-50">
              <div className="flex items-start gap-3">
                <TrendingUp className="mt-1 text-clinical-700" size={20} />
                <div>
                  <p className="font-semibold text-slate-950">{String(item.title ?? item.task ?? item.ward_id ?? `Priority ${index + 1}`)}</p>
                  <p className="mt-1 text-sm text-slate-600">{String(item.description ?? item.reason ?? "Review ward risk, compliance, and lab signals.")}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-clinical-700">Start audit for {priorityWardId(item)}</p>
                </div>
              </div>
            </Link>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Hospital Heatmap" description="Same semantic green, amber, and red risk system used across all roles." />
        <CardBody>{heatmapLoading ? <Skeleton className="h-64" /> : <HeatmapGrid wards={wards} />}</CardBody>
      </Card>

      <Card>
        <CardHeader title="Root Cause Insights" description="Apriori associations are shown in plain language before any details." />
        <CardBody className="grid gap-3 md:grid-cols-2">
          {insightLoading ? <Skeleton className="h-24" /> : null}
          {!insightLoading && !insights.length ? <p className="text-sm text-slate-500">No root-cause associations available.</p> : null}
          {insights.slice(0, 4).map((item, index) => (
            <RootCauseInsightCard key={index} insight={item} />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
