import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, ClipboardCheck, Download, FileSpreadsheet, FileText, Filter, ShieldCheck, TrendingUp } from "lucide-react";
import { listAudits } from "../../api/audits";
import { dashboardSummary, getRootCauseInsights, listAlerts } from "../../api/alerts";
import { getHeatmapWithFallback } from "../../api/heatmap";
import { listLabResults } from "../../api/lab";
import { downloadReport, generateExecutiveReport, listReports } from "../../api/reports";
import { apiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { HeatmapGrid } from "../../components/HeatmapGrid";
import { RootCauseInsightCard } from "../../components/RootCauseInsightCard";
import { Skeleton } from "../../components/Skeleton";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../hooks/useToast";
import type { AlertItem, HeatmapWard, LabResult } from "../../types";

type ReportRecord = {
  report_id?: string;
  filename?: string;
  format?: string;
  download_url?: string;
  generated_at?: string;
};

type AuditRecord = {
  audit_id?: string;
  ward_id: string;
  ward_name?: string;
  hand_hygiene_score?: number;
  ppe_score?: number;
  waste_segregation_score?: number;
  environmental_score?: number;
  overall_compliance_score?: number;
  conducted_by_name?: string;
  created_at?: string;
  audit_date?: string;
  remarks?: string;
  source?: string;
};

type DashboardTab = "overview" | "trends" | "heatmap" | "analytics" | "reports" | "summary";
type FeedKey = "audits" | "alerts" | "lab";

const FAST_FEED_TIMEOUT = 12000;

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDateKey() {
  return localDateKey(new Date());
}

function clampDateToToday(value: string) {
  const today = todayDateKey();
  return value && value > today ? today : value;
}

function isoDateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateKey(date);
}

function toDateKey(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return localDateKey(parsed);
}

function inDateRange(value: string, from: string, to: string) {
  const key = toDateKey(value);
  if (!key) return true;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

function latestDateKey(records: string[]) {
  return records.filter(Boolean).sort((a, b) => b.localeCompare(a))[0] || "";
}

function riskCount(wards: HeatmapWard[], levels: string[]) {
  const allowed = new Set(levels);
  return wards.filter((ward) => allowed.has(String(ward.risk_level || ward.status || "low").toLowerCase())).length;
}

function labelForWard(wardId: string, wards: HeatmapWard[]) {
  const ward = wards.find((item) => item.ward_id === wardId);
  return ward?.ward_name || wardId.replace(/_/g, " ");
}

function scoreText(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return `${Math.round(value)}%`;
}

function scoreTone(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "text-slate-500";
  if (value < 70) return "text-red-700";
  if (value < 85) return "text-amber-700";
  return "text-emerald-700";
}

function TrendBars({ rows }: { rows: { label: string; count: number; anomalyCount: number }[] }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  if (!rows.length) {
    return <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No infection trend data for the selected filters.</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const width = `${Math.max(8, (row.count / max) * 100)}%`;
        return (
          <div key={row.label} className="grid gap-2 sm:grid-cols-[96px_1fr_84px] sm:items-center">
            <p className="text-sm font-semibold text-slate-600">{row.label}</p>
            <div className="h-9 rounded-md bg-slate-100">
              <div className="flex h-9 items-center rounded-md bg-clinical-700 px-3 text-xs font-semibold text-white" style={{ width }}>
                {row.count} case{row.count === 1 ? "" : "s"}
              </div>
            </div>
            <p className="text-sm font-semibold text-red-700">{row.anomalyCount} anomaly</p>
          </div>
        );
      })}
    </div>
  );
}

function DistributionBars({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <section>
      <p className="mb-3 text-sm font-semibold text-slate-700">{title}</p>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-2 sm:grid-cols-[150px_1fr_48px] sm:items-center">
            <p className="truncate text-sm text-slate-600">{row.label}</p>
            <div className="h-3 rounded-full bg-slate-100">
              <div className="h-3 rounded-full bg-emerald-600" style={{ width: `${Math.max(6, (row.count / max) * 100)}%` }} />
            </div>
            <p className="text-right text-sm font-semibold text-slate-900">{row.count}</p>
          </div>
        ))}
        {!rows.length ? <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No data in this selection.</p> : null}
      </div>
    </section>
  );
}

export function SisterDashboard() {
  const [wards, setWards] = useState<HeatmapWard[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [insights, setInsights] = useState<Record<string, unknown>[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyLoading, setDailyLoading] = useState<Record<FeedKey, boolean>>({
    audits: true,
    alerts: true,
    lab: true,
  });
  const [dailyErrors, setDailyErrors] = useState<Partial<Record<FeedKey, string>>>({});
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [searchParams] = useSearchParams();
  const [reportDate, setReportDate] = useState(todayDateKey());
  const [filters, setFilters] = useState({
    from: isoDateDaysAgo(6),
    to: todayDateKey(),
    wardId: "all",
    pathogen: "all",
  });
  const { showToast } = useToast();

  useEffect(() => {
    let mounted = true;
    async function loadDashboard() {
      setLoading(true);
      setDailyLoading({ audits: true, alerts: true, lab: true });
      setDailyErrors({});

      const [auditResult, alertsResult, labResult] = await Promise.allSettled([
        listAudits({ timeout: FAST_FEED_TIMEOUT, limit: 40 }),
        listAlerts("approved", { timeout: FAST_FEED_TIMEOUT, limit: 40 }),
        listLabResults(undefined, { timeout: FAST_FEED_TIMEOUT, limit: 40 }),
      ]);
      if (!mounted) return;
      if (auditResult.status === "fulfilled") {
        setAudits(Array.isArray(auditResult.value) ? auditResult.value : []);
      } else {
        setDailyErrors((current) => ({ ...current, audits: apiErrorMessage(auditResult.reason) }));
      }
      if (alertsResult.status === "fulfilled") {
        setAlerts(alertsResult.value || []);
      } else {
        setDailyErrors((current) => ({ ...current, alerts: apiErrorMessage(alertsResult.reason) }));
      }
      if (labResult.status === "fulfilled") {
        setLabResults(labResult.value || []);
      } else {
        setDailyErrors((current) => ({ ...current, lab: apiErrorMessage(labResult.reason) }));
      }
      setDailyLoading({
        audits: false,
        alerts: false,
        lab: false,
      });

      const [heatmapResult, insightResult, reportsResult, summaryResult] = await Promise.allSettled([
        getHeatmapWithFallback(),
        getRootCauseInsights(),
        listReports(),
        dashboardSummary(),
      ]);
      if (!mounted) return;
      if (heatmapResult.status === "fulfilled") setWards(heatmapResult.value.heatmap || []);
      if (insightResult.status === "fulfilled") setInsights(Array.isArray(insightResult.value) ? insightResult.value : insightResult.value?.rules || []);
      if (reportsResult.status === "fulfilled") setReports(Array.isArray(reportsResult.value) ? reportsResult.value : []);
      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
      setLoading(false);
    }
    loadDashboard().catch((error) => {
      if (!mounted) return;
      setLoading(false);
      showToast({ type: "error", title: "Dashboard load failed", message: apiErrorMessage(error) });
    });
    return () => {
      mounted = false;
    };
  }, [showToast]);

  const availableReportDate = useMemo(() => {
    return latestDateKey([
      ...audits.map((audit) => toDateKey(audit.created_at || audit.audit_date)),
      ...alerts.map((alert) => toDateKey(alert.created_at)),
      ...labResults.map((result) => toDateKey(result.result_date || result.created_at)),
    ]);
  }, [alerts, audits, labResults]);

  useEffect(() => {
    const hasSelectedDateData = audits.some((audit) => toDateKey(audit.created_at || audit.audit_date) === reportDate)
      || alerts.some((alert) => toDateKey(alert.created_at) === reportDate)
      || labResults.some((result) => toDateKey(result.result_date || result.created_at) === reportDate);
    if (!hasSelectedDateData && availableReportDate && reportDate === todayDateKey()) {
      setReportDate(availableReportDate);
    }
  }, [alerts, audits, availableReportDate, labResults, reportDate]);

  const pathogenOptions = useMemo(() => {
    const names = new Set<string>();
    labResults.forEach((result) => {
      if (result.pathogen_name) names.add(result.pathogen_name);
    });
    alerts.forEach((alert) => {
      const sourcePathogen = alert.source_data?.pathogen_name;
      if (typeof sourcePathogen === "string") names.add(sourcePathogen);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [alerts, labResults]);

  const filteredLab = useMemo(() => {
    return labResults.filter((result) => {
      const resultDate = result.result_date || result.created_at || "";
      const wardMatch = filters.wardId === "all" || result.ward_id === filters.wardId;
      const pathogenMatch = filters.pathogen === "all" || result.pathogen_name === filters.pathogen;
      return wardMatch && pathogenMatch && inDateRange(resultDate, filters.from, filters.to);
    });
  }, [filters, labResults]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const alertDate = alert.created_at || "";
      const text = `${alert.title} ${alert.description} ${JSON.stringify(alert.source_data || {})}`.toLowerCase();
      const wardMatch = filters.wardId === "all" || alert.ward_id === filters.wardId;
      const pathogenMatch = filters.pathogen === "all" || text.includes(filters.pathogen.toLowerCase());
      return wardMatch && pathogenMatch && inDateRange(alertDate, filters.from, filters.to);
    });
  }, [alerts, filters]);

  const trendRows = useMemo(() => {
    const byDate = new Map<string, { label: string; count: number; anomalyCount: number }>();
    filteredLab.forEach((result) => {
      const label = toDateKey(result.result_date || result.created_at) || "Undated";
      const row = byDate.get(label) || { label, count: 0, anomalyCount: 0 };
      row.count += 1;
      if (result.anomaly?.is_anomaly) row.anomalyCount += 1;
      byDate.set(label, row);
    });
    return Array.from(byDate.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(-10);
  }, [filteredLab]);

  const wardDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    filteredLab.forEach((result) => counts.set(result.ward_id, (counts.get(result.ward_id) || 0) + 1));
    return Array.from(counts.entries())
      .map(([wardId, count]) => ({ label: labelForWard(wardId, wards), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [filteredLab, wards]);

  const pathogenDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    filteredLab.forEach((result) => counts.set(result.pathogen_name, (counts.get(result.pathogen_name) || 0) + 1));
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [filteredLab]);

  const dailyAudits = useMemo(() => {
    return audits
      .filter((audit) => toDateKey(audit.created_at || audit.audit_date) === reportDate)
      .sort((a, b) => String(a.ward_id).localeCompare(String(b.ward_id)));
  }, [audits, reportDate]);

  const dailyAlerts = useMemo(() => {
    return alerts.filter((alert) => toDateKey(alert.created_at) === reportDate);
  }, [alerts, reportDate]);

  const visibleAlerts = useMemo(() => {
    if (dailyAlerts.length) return dailyAlerts;
    return alerts
      .slice()
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .slice(0, 5);
  }, [alerts, dailyAlerts]);

  const dailyLabResults = useMemo(() => {
    return labResults.filter((result) => toDateKey(result.result_date || result.created_at) === reportDate);
  }, [labResults, reportDate]);

  const visibleLabResults = useMemo(() => {
    if (dailyLabResults.length) return dailyLabResults;
    return labResults
      .slice()
      .sort((a, b) => String(b.result_date || b.created_at || "").localeCompare(String(a.result_date || a.created_at || "")))
      .slice(0, 8);
  }, [dailyLabResults, labResults]);

  const dailyAverageCompliance = useMemo(() => {
    const scores = dailyAudits
      .map((audit) => audit.overall_compliance_score)
      .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
    if (!scores.length) return null;
    return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
  }, [dailyAudits]);

  const lowestAudit = useMemo(() => {
    return dailyAudits
      .filter((audit) => typeof audit.overall_compliance_score === "number")
      .sort((a, b) => Number(a.overall_compliance_score) - Number(b.overall_compliance_score))[0];
  }, [dailyAudits]);

  const highRiskCount = riskCount(wards, ["high", "critical", "red"]);
  const dailyReportLoading = dailyLoading.audits || dailyLoading.alerts || dailyLoading.lab;
  const averageCompliance = Number(summary?.average_compliance ?? 0);
  const maxDate = todayDateKey();
  const tabParam = searchParams.get("tab");
  const activeTab: DashboardTab = tabParam === "trends" || tabParam === "heatmap" || tabParam === "analytics" || tabParam === "reports" || tabParam === "summary"
    ? tabParam
    : "overview";

  async function exportReport(format: "pdf" | "excel") {
    setExporting(format);
    try {
      const report = await generateExecutiveReport(format);
      showToast({ type: "success", title: "Report generated", message: report.message });
      await downloadReport(report.download_url, `executive-summary.${format === "pdf" ? "pdf" : "xlsx"}`);
      setReports(await listReports());
    } catch (err) {
      showToast({ type: "error", title: "Export failed", message: apiErrorMessage(err) });
    } finally {
      setExporting(null);
    }
  }

  async function openReport(report: ReportRecord) {
    if (!report.download_url) return;
    try {
      await downloadReport(report.download_url, report.filename || "infecsure-report");
    } catch (err) {
      showToast({ type: "error", title: "Download failed", message: apiErrorMessage(err) });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Nursing Sister Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Read-only managerial view of ICNO-validated infection risk, trends, and executive reports.</p>
      </div>

      {activeTab === "overview" ? (
        <div className="space-y-6" role="tabpanel">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card><CardBody><p className="text-sm text-slate-500">Wards monitored</p>{loading ? <Skeleton className="mt-2 h-9 w-16" /> : <p className="mt-2 text-3xl font-bold text-slate-950">{String(summary?.total_wards ?? wards.length)}</p>}</CardBody></Card>
            <Card><CardBody><p className="text-sm text-slate-500">High-risk zones</p>{loading ? <Skeleton className="mt-2 h-9 w-16" /> : <p className="mt-2 text-3xl font-bold text-red-700">{highRiskCount}</p>}</CardBody></Card>
            <Card><CardBody><p className="text-sm text-slate-500">Trend breaks</p>{loading ? <Skeleton className="mt-2 h-9 w-16" /> : <p className="mt-2 text-3xl font-bold text-amber-700">{String(summary?.recent_anomalies ?? filteredLab.filter((item) => item.anomaly?.is_anomaly).length)}</p>}</CardBody></Card>
            <Card><CardBody><p className="text-sm text-slate-500">Average compliance</p>{loading ? <Skeleton className="mt-2 h-9 w-16" /> : <p className="mt-2 text-3xl font-bold text-emerald-700">{Number.isFinite(averageCompliance) && averageCompliance > 0 ? `${averageCompliance}%` : "N/A"}</p>}</CardBody></Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Executive Snapshot" description="Hospital-wide risk distribution and validation status." />
              <CardBody className="space-y-4">
                <DistributionBars title="Risk zone distribution" rows={[
                  { label: "Low", count: riskCount(wards, ["low", "safe", "green"]) },
                  { label: "Medium", count: riskCount(wards, ["medium", "moderate", "amber", "watch"]) },
                  { label: "High or critical", count: highRiskCount },
                ]} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Recent Validated Alerts" description="Latest ICNO-approved summaries." />
              <CardBody className="space-y-3">
                {filteredAlerts.slice(0, 3).map((alert) => (
                  <article key={alert.alert_id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{alert.title}</p>
                        <p className="mt-1 text-xs font-semibold uppercase text-slate-500">{alert.ward_id || "Hospital-wide"}</p>
                      </div>
                      <StatusBadge status={alert.status} />
                    </div>
                  </article>
                ))}
                {!filteredAlerts.length ? <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No approved summaries in the current filter window.</p> : null}
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      {activeTab === "trends" ? (
        <Card>
          <CardHeader title="Systemic Infection Trends" description="Executive trend view filtered by date range, ward, and pathogen." action={<Filter className="text-clinical-700" size={20} />} />
          <CardBody className="space-y-5">
            <div className="grid gap-3 lg:grid-cols-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">From</span>
                <input className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" type="date" max={maxDate} value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: clampDateToToday(event.target.value) }))} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">To</span>
                <input className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" type="date" max={maxDate} value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: clampDateToToday(event.target.value) }))} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Ward</span>
                <select className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={filters.wardId} onChange={(event) => setFilters((current) => ({ ...current, wardId: event.target.value }))}>
                  <option value="all">All wards</option>
                  {wards.map((ward) => <option key={ward.ward_id} value={ward.ward_id}>{ward.ward_name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Pathogen</span>
                <select className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={filters.pathogen} onChange={(event) => setFilters((current) => ({ ...current, pathogen: event.target.value }))}>
                  <option value="all">All pathogens</option>
                  {pathogenOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
            </div>

            {loading ? <Skeleton className="h-64" /> : <TrendBars rows={trendRows} />}

            <div className="grid gap-6 lg:grid-cols-2">
              <DistributionBars title="Ward infection distribution" rows={wardDistribution} />
              <DistributionBars title="Pathogen distribution" rows={pathogenDistribution} />
            </div>
          </CardBody>
        </Card>
      ) : null}

      {activeTab === "heatmap" ? (
        <Card>
          <CardHeader title="Dynamic Hospital Heatmap" description="Random Forest ward risk scores after ICNO validation, shown as green, amber, and red operational zones." action={<ShieldCheck className="text-emerald-700" size={20} />} />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">Green safe</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">Amber watch</span>
              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">Red high risk</span>
            </div>
            {loading ? <Skeleton className="h-72" /> : <HeatmapGrid wards={wards} />}
          </CardBody>
        </Card>
      ) : null}

      {activeTab === "analytics" ? (
        <Card>
          <CardHeader title="Root Cause Analytics" description="Apriori association rules linking hygiene failures, pathogens, and outbreak signals." action={<TrendingUp className="text-amber-700" size={20} />} />
          <CardBody className="space-y-3">
            {loading ? <Skeleton className="h-36" /> : null}
            {!loading && !insights.length ? <p className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500">No Apriori root-cause insights are available for the current data.</p> : null}
            {!loading && insights.map((item, index) => <RootCauseInsightCard key={index} insight={item} />)}
          </CardBody>
        </Card>
      ) : null}

      {activeTab === "reports" ? (
        <Card>
          <CardHeader title="Executive Summary Reports" description="Structured administrative reports for governance and decision-making." action={<BarChart3 className="text-clinical-700" size={20} />} />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button icon={<FileText size={18} />} disabled={exporting !== null} onClick={() => exportReport("pdf")}>Generate PDF</Button>
              <Button variant="secondary" icon={<FileSpreadsheet size={18} />} disabled={exporting !== null} onClick={() => exportReport("excel")}>Generate Excel</Button>
            </div>
            <div className="space-y-3">
              {reports.slice(0, 5).map((report, index) => (
                <article key={String(report.report_id || index)} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{String(report.filename || report.report_id || "Generated report")}</p>
                      <p className="text-xs text-slate-500">{String(report.generated_at || report.format || "executive summary")}</p>
                    </div>
                    {report.download_url ? <Button variant="ghost" icon={<Download size={16} />} onClick={() => openReport(report)}>Download</Button> : null}
                  </div>
                </article>
              ))}
              {!reports.length ? <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No generated executive reports yet.</p> : null}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {activeTab === "summary" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Daily ICNO Ward Audit Report" description="Full in-system report view of ICNO-submitted ward audits, approved alerts, and infection signals for the selected day." action={<ClipboardCheck className="text-clinical-700" size={20} />} />
            <CardBody className="space-y-5">
              <div className="grid gap-3 md:grid-cols-[220px_1fr] md:items-end">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Report date</span>
                  <input className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" type="date" max={maxDate} value={reportDate} onChange={(event) => setReportDate(clampDateToToday(event.target.value))} />
                </label>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Ward audits</p>
                    {dailyReportLoading ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="mt-1 text-2xl font-bold text-slate-950">{dailyAudits.length}</p>}
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Avg compliance</p>
                    {dailyReportLoading ? <Skeleton className="mt-2 h-8 w-14" /> : <p className={`mt-1 text-2xl font-bold ${scoreTone(dailyAverageCompliance ?? undefined)}`}>{dailyAverageCompliance !== null ? `${dailyAverageCompliance}%` : "N/A"}</p>}
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Approved alerts</p>
                    {dailyReportLoading ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="mt-1 text-2xl font-bold text-amber-700">{visibleAlerts.length}</p>}
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Lab signals</p>
                    {dailyReportLoading ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="mt-1 text-2xl font-bold text-red-700">{visibleLabResults.filter((item) => item.anomaly?.is_anomaly).length}</p>}
                  </div>
                </div>
              </div>

              {availableReportDate && availableReportDate === reportDate && reportDate !== todayDateKey() ? (
                <p className="rounded-md border border-clinical-200 bg-clinical-50 p-3 text-sm text-clinical-900">
                  Showing the latest available daily report date because no records were found for today.
                </p>
              ) : null}

              {lowestAudit ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-950">Lowest compliance ward</p>
                  <p className="mt-1 text-sm text-amber-900">
                    {labelForWard(lowestAudit.ward_id, wards)} recorded {scoreText(lowestAudit.overall_compliance_score)} overall compliance.
                  </p>
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Ward</th>
                      <th className="px-4 py-3">Overall</th>
                      <th className="px-4 py-3">Hand hygiene</th>
                      <th className="px-4 py-3">PPE</th>
                      <th className="px-4 py-3">Waste</th>
                      <th className="px-4 py-3">Environment</th>
                      <th className="px-4 py-3">ICNO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {dailyAudits.map((audit) => (
                      <tr key={audit.audit_id || `${audit.ward_id}-${audit.created_at}`}>
                        <td className="px-4 py-3 font-semibold text-slate-950">{labelForWard(audit.ward_id, wards)}</td>
                        <td className={`px-4 py-3 font-bold ${scoreTone(audit.overall_compliance_score)}`}>{scoreText(audit.overall_compliance_score)}</td>
                        <td className={`px-4 py-3 font-semibold ${scoreTone(audit.hand_hygiene_score)}`}>{scoreText(audit.hand_hygiene_score)}</td>
                        <td className={`px-4 py-3 font-semibold ${scoreTone(audit.ppe_score)}`}>{scoreText(audit.ppe_score)}</td>
                        <td className={`px-4 py-3 font-semibold ${scoreTone(audit.waste_segregation_score)}`}>{scoreText(audit.waste_segregation_score)}</td>
                        <td className={`px-4 py-3 font-semibold ${scoreTone(audit.environmental_score)}`}>{scoreText(audit.environmental_score)}</td>
                        <td className="px-4 py-3 text-slate-600">{audit.conducted_by_name || "ICNO"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dailyLoading.audits ? <div className="p-4"><Skeleton className="h-20" /></div> : null}
                {!dailyLoading.audits && dailyErrors.audits ? <p className="p-6 text-center text-sm text-red-700">{dailyErrors.audits}</p> : null}
                {!dailyLoading.audits && !dailyErrors.audits && !dailyAudits.length ? <p className="p-6 text-center text-sm text-slate-500">No ICNO ward audit records were found for this date.</p> : null}
              </div>
            </CardBody>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Approved Infection Findings" description="ICNO-approved alerts included in the daily report." />
              <CardBody className="space-y-3">
                {dailyLoading.alerts ? <Skeleton className="h-28" /> : null}
                {!dailyLoading.alerts && dailyErrors.alerts ? <p className="rounded-md border border-red-200 bg-red-50 p-6 text-sm text-red-700">{dailyErrors.alerts}</p> : null}
                {!dailyLoading.alerts && !dailyErrors.alerts && !dailyAlerts.length && visibleAlerts.length ? (
                  <p className="rounded-md border border-clinical-200 bg-clinical-50 p-3 text-xs font-semibold uppercase text-clinical-800">No findings for the selected date. Showing recent approved findings.</p>
                ) : null}
                {visibleAlerts.map((alert) => (
                  <article key={alert.alert_id} className="rounded-md border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{alert.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{alert.description}</p>
                        <p className="mt-2 text-xs font-semibold uppercase text-slate-500">{alert.ward_id || "Hospital-wide"} | {toDateKey(alert.created_at) || reportDate}</p>
                      </div>
                      <StatusBadge status={alert.status} />
                    </div>
                  </article>
                ))}
                {!dailyLoading.alerts && !dailyErrors.alerts && !visibleAlerts.length ? <p className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500">No ICNO-approved findings are recorded yet.</p> : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Daily Lab and Outbreak Signals" description="Lab results connected to the selected daily report." />
              <CardBody className="space-y-3">
                {dailyLoading.lab ? <Skeleton className="h-28" /> : null}
                {!dailyLoading.lab && dailyErrors.lab ? <p className="rounded-md border border-red-200 bg-red-50 p-6 text-sm text-red-700">{dailyErrors.lab}</p> : null}
                {!dailyLoading.lab && !dailyErrors.lab && !dailyLabResults.length && visibleLabResults.length ? (
                  <p className="rounded-md border border-clinical-200 bg-clinical-50 p-3 text-xs font-semibold uppercase text-clinical-800">No lab signals for the selected date. Showing recent lab and outbreak signals.</p>
                ) : null}
                {visibleLabResults.map((result) => (
                  <article key={result.result_id || `${result.ward_id}-${result.pathogen_name}-${result.result_date}`} className="rounded-md border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{result.pathogen_name}</p>
                        <p className="mt-1 text-sm text-slate-600">{labelForWard(result.ward_id, wards)} | {result.specimen_type}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${result.anomaly?.is_anomaly ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                        {result.anomaly?.is_anomaly ? "anomaly" : "normal"}
                      </span>
                    </div>
                  </article>
                ))}
                {!dailyLoading.lab && !dailyErrors.lab && !visibleLabResults.length ? <p className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500">No lab signals are recorded yet.</p> : null}
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
