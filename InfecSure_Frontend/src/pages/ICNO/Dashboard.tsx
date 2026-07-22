import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Camera, ClipboardCheck, LayoutDashboard, ShieldCheck, TrendingUp } from "lucide-react";
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
  const dashboardTabs = [
    { label: "Overview", sectionId: "overview", icon: LayoutDashboard },
    { label: "Priorities", sectionId: "priorities", icon: TrendingUp },
    { label: "Heatmap", sectionId: "heatmap", icon: ShieldCheck },
    { label: "Root Cause", sectionId: "analytics", icon: BarChart3 },
  ];

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      {/* Header section with sleek backdrop and action buttons */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-900/90 via-slate-900 to-teal-900 p-6 text-white shadow-xl backdrop-blur-md sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-wide text-white drop-shadow-sm">ICNO Command Dashboard</h1>
          <p className="mt-1 text-sm font-medium text-sky-100/90">Pending validation stays separated from confirmed clinical status.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/icno/audit">
            <button className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-teal-900/30 transition-all hover:scale-[1.02] hover:from-teal-400 hover:to-emerald-400 active:scale-[0.98]">
              <ClipboardCheck size={18} />
              New Audit
            </button>
          </Link>
          <Link to="/icno/scan">
            <button className="flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white backdrop-blur-md transition-all hover:bg-white/20 hover:scale-[1.02] active:scale-[0.98]">
              <Camera size={18} />
              Scan Document
            </button>
          </Link>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-lg backdrop-blur-md">
        <div className="grid gap-2 sm:grid-cols-4">
          {dashboardTabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.sectionId}
                type="button"
                onClick={() => scrollToSection(item.sectionId)}
                className="touch-target group flex items-center justify-center gap-2.5 rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50 to-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-all duration-300 hover:border-sky-300 hover:bg-gradient-to-b hover:from-sky-50 hover:to-teal-50 hover:text-teal-900 hover:shadow-md"
              >
                <Icon size={18} className="text-teal-600 transition-transform group-hover:scale-110" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overview Stat Cards */}
      <section id="overview" className="scroll-mt-24 space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="group relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/30 to-indigo-100/40 p-5 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-indigo-500/10 blur-xl group-hover:bg-indigo-500/20" />
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-900">Pending approvals</p>
            <p className="mt-3 text-4xl font-extrabold text-indigo-700 drop-shadow-xs">{pending.length}</p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-amber-100 bg-gradient-to-br from-white via-amber-50/30 to-amber-100/40 p-5 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-amber-500/10 blur-xl group-hover:bg-amber-500/20" />
            <p className="text-xs font-bold uppercase tracking-wider text-amber-900">Top risk ward</p>
            <div className="mt-3">{topWard ? <RiskBadge level={topWard.risk_level} score={topWard.risk_score} /> : <Skeleton className="h-7 w-28" />}</div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/30 to-teal-100/40 p-5 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-emerald-500/10 blur-xl group-hover:bg-emerald-500/20" />
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">Wards monitored</p>
            <p className="mt-3 text-4xl font-extrabold text-emerald-700 drop-shadow-xs">{String(summary?.total_wards ?? wards.length)}</p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-rose-100 bg-gradient-to-br from-white via-rose-50/30 to-red-100/40 p-5 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-rose-500/10 blur-xl group-hover:bg-rose-500/20" />
            <p className="text-xs font-bold uppercase tracking-wider text-rose-900">Trend breaks</p>
            <p className="mt-3 text-4xl font-extrabold text-rose-700 drop-shadow-xs">{String(summary?.recent_anomalies ?? 0)}</p>
          </div>
        </div>
      </section>

      {/* Priorities Section */}
      <section id="priorities" className="scroll-mt-24">
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-xl backdrop-blur-md">
          <CardHeader
            title="Today's Top Priorities"
            description="Risk-weighted priority output from P = (w1 x C) + (w2 x V) + (w3 x L)."
            action={
              <Link to="/icno/approvals">
                <Button variant="secondary" icon={<ShieldCheck size={18} />}>Review queue</Button>
              </Link>
            }
          />
          <CardBody className="space-y-3.5 p-5">
            {priorityLoading ? <Skeleton className="h-24 rounded-xl" /> : null}
            {!priorityLoading && !priorities.length ? <p className="text-sm text-slate-500">No priority items returned by the backend.</p> : null}
            {priorities.slice(0, 5).map((item, index) => (
              <Link
                key={index}
                to={`/icno/audit?ward=${encodeURIComponent(priorityWardId(item))}`}
                className="group block rounded-xl border border-slate-200/90 bg-gradient-to-r from-slate-50/50 via-white to-sky-50/30 p-4 transition-all duration-300 hover:border-teal-500 hover:bg-gradient-to-r hover:from-teal-50/40 hover:to-sky-50/60 hover:shadow-md"
              >
                <div className="flex items-start gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-800 transition-colors group-hover:bg-teal-700 group-hover:text-white">
                    <TrendingUp size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-900 group-hover:text-teal-900">{String(item.title ?? item.task ?? item.ward_id ?? `Priority ${index + 1}`)}</p>
                    <p className="mt-1 text-sm font-medium text-slate-600">{String(item.description ?? item.reason ?? "Review ward risk, compliance, and lab signals.")}</p>
                    <p className="mt-2.5 inline-flex items-center text-xs font-bold uppercase tracking-wider text-teal-700 group-hover:text-teal-900">
                      Start audit for {priorityWardId(item)} →
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </CardBody>
        </div>
      </section>

      {/* Heatmap Section */}
      <section id="heatmap" className="scroll-mt-24">
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-xl backdrop-blur-md">
          <CardHeader title="Hospital Heatmap" description="Same semantic green, amber, and red risk system used across all roles." />
          <CardBody className="p-5">{heatmapLoading ? <Skeleton className="h-64 rounded-xl" /> : <HeatmapGrid wards={wards} />}</CardBody>
        </div>
      </section>

      {/* Analytics / Root Cause Section */}
      <section id="analytics" className="scroll-mt-24">
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-xl backdrop-blur-md">
          <CardHeader title="Root Cause Insights" description="Apriori associations are shown in plain language before any details." />
          <CardBody className="grid gap-4.5 p-5 md:grid-cols-2">
            {insightLoading ? <Skeleton className="h-24 rounded-xl" /> : null}
            {!insightLoading && !insights.length ? <p className="text-sm text-slate-500">No root-cause associations available.</p> : null}
            {insights.slice(0, 8).map((item, index) => (
              <RootCauseInsightCard key={index} insight={item} />
            ))}
          </CardBody>
        </div>
      </section>
    </div>
  );
}
