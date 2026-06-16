import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, Megaphone, ShieldCheck } from "lucide-react";
import { getRootCauseInsights, listAlerts } from "../../api/alerts";
import { getHeatmap } from "../../api/heatmap";
import { generateExecutiveReport, listReports, reportDownloadUrl } from "../../api/reports";
import { createNotice, listNotices } from "../../api/notices";
import { apiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { HeatmapGrid } from "../../components/HeatmapGrid";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../hooks/useToast";
import type { AlertItem, HeatmapWard } from "../../types";

export function SisterDashboard() {
  const [wards, setWards] = useState<HeatmapWard[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [insights, setInsights] = useState<Record<string, unknown>[]>([]);
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [notices, setNotices] = useState<Record<string, unknown>[]>([]);
  const [notice, setNotice] = useState({ title: "Ward risk reminder", body: "Please follow PPE and hand hygiene precautions." });
  const { showToast } = useToast();

  useEffect(() => {
    Promise.allSettled([getHeatmap(), listAlerts("approved"), getRootCauseInsights(), listReports(), listNotices()]).then(([heatmapResult, alertsResult, insightResult, reportsResult, noticesResult]) => {
      if (heatmapResult.status === "fulfilled") setWards(heatmapResult.value.heatmap || []);
      if (alertsResult.status === "fulfilled") setAlerts(alertsResult.value || []);
      if (insightResult.status === "fulfilled") setInsights(Array.isArray(insightResult.value) ? insightResult.value : insightResult.value?.rules || []);
      if (reportsResult.status === "fulfilled") setReports(Array.isArray(reportsResult.value) ? reportsResult.value : []);
      if (noticesResult.status === "fulfilled") setNotices(Array.isArray(noticesResult.value) ? noticesResult.value : []);
    });
  }, []);

  async function exportReport(format: "pdf" | "excel") {
    try {
      const report = await generateExecutiveReport(format);
      showToast({ type: "success", title: "Report generated", message: report.message });
      window.open(reportDownloadUrl(report.download_url), "_blank", "noopener,noreferrer");
      setReports(await listReports());
    } catch (err) {
      showToast({ type: "error", title: "Export failed", message: apiErrorMessage(err) });
    }
  }

  async function postNotice() {
    try {
      await createNotice({ ...notice, is_pinned: true });
      showToast({ type: "success", title: "Notice posted" });
      setNotices(await listNotices());
    } catch (err) {
      showToast({ type: "error", title: "Notice failed", message: apiErrorMessage(err) });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Nursing Sister Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Executive read-only view. No approve, reject, or edit controls are available here.</p>
      </div>

      <Card>
        <CardHeader title="Hospital Heatmap" description="Validated ward-level risk and compliance overview." />
        <CardBody><HeatmapGrid wards={wards} /></CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Systemic Infection Trends" />
          <CardBody className="space-y-3">
            {!insights.length ? <p className="text-sm text-slate-500">No approved root-cause trends available.</p> : null}
            {insights.slice(0, 5).map((item, index) => (
              <article key={index} className="rounded-md border border-slate-200 p-4">
                <p className="font-semibold text-slate-950">{String(item.interpretation ?? item.pattern ?? "Root-cause association")}</p>
                <details className="mt-2 text-sm text-slate-600">
                  <summary className="cursor-pointer font-semibold text-clinical-700">Why this matters</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs">{JSON.stringify(item, null, 2)}</pre>
                </details>
              </article>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Executive Summary / Export Center" description="View-and-download only permission boundary." />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button icon={<Download size={18} />} onClick={() => exportReport("pdf")}>PDF report</Button>
              <Button variant="secondary" icon={<FileSpreadsheet size={18} />} onClick={() => exportReport("excel")}>Excel report</Button>
            </div>
            <div className="space-y-3">
              {reports.slice(0, 4).map((report, index) => (
                <article key={String(report.report_id || index)} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">{String(report.filename || report.report_id || "Generated report")}</p>
                    {report.download_url ? <Button variant="ghost" icon={<Download size={16} />} onClick={() => window.open(reportDownloadUrl(String(report.download_url)), "_blank", "noopener,noreferrer")}>Open</Button> : null}
                  </div>
                </article>
              ))}
              {alerts.slice(0, 5).map((alert) => (
                <article key={alert.alert_id} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">{alert.title}</p>
                    <StatusBadge status={alert.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{alert.description}</p>
                </article>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <ShieldCheck size={18} />
              Only ICNO-validated alerts are visible in this dashboard.
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Common Notice Panel" description="Sister can post general staff notices; no patient identifiers." />
          <CardBody className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Notice title</span>
              <input className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={notice.title} onChange={(event) => setNotice((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Notice body</span>
              <textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-300 p-3" value={notice.body} onChange={(event) => setNotice((current) => ({ ...current, body: event.target.value }))} />
            </label>
            <Button icon={<Megaphone size={18} />} onClick={postNotice}>Post notice</Button>
            <div className="space-y-2">
              {notices.slice(0, 3).map((item, index) => (
                <div key={String(item.notice_id || index)} className="rounded-md border border-slate-200 p-3">
                  <p className="font-semibold text-slate-950">{String(item.title || "Notice")}</p>
                  <p className="text-sm text-slate-600">{String(item.body || item.message || "")}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
