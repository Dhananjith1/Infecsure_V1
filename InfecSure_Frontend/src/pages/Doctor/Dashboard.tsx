import { FormEvent, useEffect, useState } from "react";
import { Bell, Download, FileText, Mail, MessageSquare, Send } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { doctorAcknowledge, doctorSignoff, listAlerts, listManagementInstructions, sendDoctorInstructions } from "../../api/alerts";
import { apiErrorMessage } from "../../api/client";
import { dispatchReport, downloadReport, generateDengueReport, generateWeeklyDengueReport, listReports } from "../../api/reports";
import { Button } from "../../components/Button";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { Modal } from "../../components/Modal";
import { RiskBadge } from "../../components/RiskBadge";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../hooks/useToast";
import type { AlertItem } from "../../types";

type DoctorReport = {
  report_id: string;
  report_type?: string;
  download_url: string;
  filename?: string;
  message?: string;
  file_size_bytes?: number;
  generated_at?: string;
  period_start?: string;
  period_end?: string;
  approved_dengue_findings?: number;
  positive_dengue_lab_results?: number;
  related_audits?: number;
  ward_ids?: string[];
};

function shortDate(value?: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString();
}

export function DoctorDashboard() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [instructions, setInstructions] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<AlertItem | null>(null);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  const [weeklyReport, setWeeklyReport] = useState<DoctorReport | null>(null);
  const [reportHistory, setReportHistory] = useState<DoctorReport[]>([]);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [dispatchMessage, setDispatchMessage] = useState("Please review the attached authorized weekly dengue clinical report.");
  const [reportBusy, setReportBusy] = useState(false);
  const [ackMode, setAckMode] = useState<"instructions" | "doctor-acknowledge" | "acknowledge">("instructions");
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "instructions" || tabParam === "reports" ? tabParam : "alerts";

  useEffect(() => {
    listAlerts("approved").then(setAlerts).catch(() => setAlerts([]));
    listManagementInstructions().then((data) => setInstructions(Array.isArray(data) ? data : [])).catch(() => setInstructions([]));
    listReports()
      .then((data) => {
        const reports = Array.isArray(data) ? data : [];
        setReportHistory(reports.filter((item) => String(item.report_type || "").startsWith("dengue")).slice(0, 6));
      })
      .catch(() => setReportHistory([]));
  }, []);

  async function submitInstruction(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    try {
      if (ackMode === "doctor-acknowledge") await doctorAcknowledge(selected.alert_id, message, notes);
      else if (ackMode === "acknowledge") await doctorSignoff(selected.alert_id, message, notes);
      else await sendDoctorInstructions(selected.alert_id, message, notes);
      showToast({ type: "success", title: "Instruction sent", message: `Instruction tied to ${selected.ward_id || "selected alert"}.` });
      setSelected(null);
      setMessage("");
      setNotes("");
      const data = await listManagementInstructions();
      setInstructions(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast({ type: "error", title: "Instruction failed", message: apiErrorMessage(err) });
    }
  }

  async function makeDengueReport(alert: AlertItem) {
    try {
      const report = await generateDengueReport(alert.alert_id);
      showToast({ type: "success", title: "Dengue report generated", message: report.message });
      await downloadReport(report.download_url, `${report.report_id || "dengue-report"}.pdf`);
    } catch (err) {
      showToast({ type: "error", title: "Report failed", message: apiErrorMessage(err) });
    }
  }

  async function downloadDoctorReport(report: Pick<DoctorReport, "download_url" | "filename" | "report_id">) {
    try {
      await downloadReport(report.download_url, report.filename || `${report.report_id}.pdf`);
    } catch (err) {
      showToast({ type: "error", title: "Download failed", message: apiErrorMessage(err) });
    }
  }

  async function makeWeeklyDengueReport() {
    setReportBusy(true);
    try {
      const report = await generateWeeklyDengueReport();
      setWeeklyReport(report);
      setReportHistory((current) => [report, ...current.filter((item) => item.report_id !== report.report_id)].slice(0, 6));
      showToast({ type: "success", title: "Weekly dengue report ready", message: report.message });
    } catch (err) {
      showToast({ type: "error", title: "Report failed", message: apiErrorMessage(err) });
    } finally {
      setReportBusy(false);
    }
  }

  async function emailWeeklyReport(event: FormEvent) {
    event.preventDefault();
    if (!weeklyReport) return;
    setReportBusy(true);
    try {
      const cc = ccEmail.split(",").map((item) => item.trim()).filter(Boolean);
      const result = await dispatchReport(weeklyReport.report_id, {
        to_email: recipientEmail,
        cc,
        message: dispatchMessage,
      });
      showToast({ type: "success", title: "Report emailed", message: result.message });
    } catch (err) {
      showToast({ type: "error", title: "Email failed", message: apiErrorMessage(err) });
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Supervising Doctor Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Only ICNO-approved clinical alerts appear here.</p>
      </div>

      {activeTab === "alerts" ? (
        <Card>
          <CardHeader title="Clinical Alerts / Notifications" description="Formatted from validated findings, never raw AI output." />
          <CardBody className="space-y-4">
            {!alerts.length ? <p className="text-sm text-slate-500">No approved clinical alerts assigned.</p> : null}
            {alerts.map((alert) => (
              <article key={alert.alert_id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2"><StatusBadge status={alert.status} /><RiskBadge level={alert.severity} /></div>
                    <h2 className="mt-3 text-lg font-semibold text-slate-950">{alert.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{alert.description}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-700">MoH ward reference: {alert.ward_id || "Not specified"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button icon={<MessageSquare size={18} />} onClick={() => setSelected(alert)}>Send instruction</Button>
                    <Button variant="secondary" icon={<FileText size={18} />} onClick={() => makeDengueReport(alert)}>Dengue report</Button>
                  </div>
                </div>
              </article>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {activeTab === "reports" ? (
        <Card>
          <CardHeader title="Weekly Dengue Report and External Notification" description="Supervising Doctor report using ICNO-validated dengue findings, dengue-positive lab results, and related ICNO ward audits." />
          <CardBody className="space-y-5">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="rounded-md border border-slate-200 p-4">
                <p className="font-semibold text-slate-950">Weekly dengue clinical pack</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Includes approved dengue findings, positive dengue lab reports, and ICNO audit context for possible dengue spreading cases.
                </p>
              </div>
              <Button icon={<FileText size={18} />} disabled={reportBusy} onClick={makeWeeklyDengueReport}>
                Generate weekly report
              </Button>
            </div>

            {weeklyReport ? (
              <div className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-emerald-950">Report ready: {weeklyReport.report_id}</p>
                    <p className="mt-1 text-sm text-emerald-800">{weeklyReport.message || "Weekly dengue report generated."}</p>
                    <p className="mt-2 text-xs font-semibold uppercase text-emerald-700">
                      Period {shortDate(weeklyReport.period_start)} to {shortDate(weeklyReport.period_end)}
                    </p>
                  </div>
                  <Button variant="secondary" icon={<Download size={18} />} onClick={() => downloadDoctorReport(weeklyReport)}>
                    Download
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-md border border-emerald-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Approved findings</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{weeklyReport.approved_dengue_findings ?? 0}</p>
                  </div>
                  <div className="rounded-md border border-emerald-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Positive lab reports</p>
                    <p className="mt-1 text-2xl font-bold text-red-700">{weeklyReport.positive_dengue_lab_results ?? 0}</p>
                  </div>
                  <div className="rounded-md border border-emerald-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">ICNO audits</p>
                    <p className="mt-1 text-2xl font-bold text-clinical-800">{weeklyReport.related_audits ?? 0}</p>
                  </div>
                  <div className="rounded-md border border-emerald-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Wards</p>
                    <p className="mt-1 text-sm font-bold text-slate-950">{weeklyReport.ward_ids?.length ? weeklyReport.ward_ids.join(", ") : "Hospital-wide"}</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-950">Generated Dengue Reports</p>
              </div>
              <div className="divide-y divide-slate-100">
                {!reportHistory.length ? <p className="p-4 text-sm text-slate-500">No dengue reports generated yet.</p> : null}
                {reportHistory.map((report) => (
                  <article key={report.report_id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                      <p className="font-semibold text-slate-950">{report.filename || report.report_id}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {shortDate(report.period_start || report.generated_at)} to {shortDate(report.period_end || report.generated_at)}
                        {" "} | findings {report.approved_dengue_findings ?? "N/A"}
                        {" "} | lab positives {report.positive_dengue_lab_results ?? "N/A"}
                        {" "} | audits {report.related_audits ?? "N/A"}
                      </p>
                    </div>
                    <Button variant="ghost" icon={<Download size={16} />} onClick={() => downloadDoctorReport(report)}>
                      View
                    </Button>
                  </article>
                ))}
              </div>
            </div>

            <form className="grid gap-3 lg:grid-cols-2" onSubmit={emailWeeklyReport}>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">MOH / authorized recipient email</span>
                <input className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} required />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">CC emails</span>
                <input className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={ccEmail} onChange={(event) => setCcEmail(event.target.value)} placeholder="optional, comma separated" />
              </label>
              <label className="block lg:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Email message</span>
                <textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-300 p-3" value={dispatchMessage} onChange={(event) => setDispatchMessage(event.target.value)} />
              </label>
              <div className="lg:col-span-2">
                <Button type="submit" icon={<Mail size={18} />} disabled={!weeklyReport || reportBusy}>
                  Email report
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {activeTab === "instructions" ? (
        <Card>
          <CardHeader title="Digital Management Instructions" description="Ward-linked clinical instructions issued after reviewing confirmed reports." />
          <CardBody className="space-y-3">
            {!instructions.length ? <p className="text-sm text-slate-500">No instructions sent yet.</p> : null}
            {instructions.slice(0, 8).map((instruction, index) => (
              <article key={String(instruction.instruction_id || index)} className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <Bell size={18} className="text-clinical-700" />
                  <p className="font-semibold text-slate-950">{String(instruction.ward_id || instruction.alert_id || "Ward instruction")}</p>
                </div>
                <p className="mt-1 text-sm text-slate-600">{String(instruction.management_instructions || instruction.message || "Instruction recorded")}</p>
              </article>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Modal
        open={Boolean(selected)}
        title="Confirm ward instruction"
        onClose={() => setSelected(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>Cancel</Button>
            <Button form="doctor-instruction" type="submit" icon={<Send size={18} />}>Send instruction</Button>
          </>
        }
      >
        <form id="doctor-instruction" className="space-y-4" onSubmit={submitInstruction}>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
            This will send a management instruction tied to {selected?.ward_id || "the selected ward alert"}.
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Acknowledgement notes</span>
            <input className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Backend endpoint</span>
            <select className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={ackMode} onChange={(event) => setAckMode(event.target.value as typeof ackMode)}>
              <option value="instructions">/alerts/:id/instructions</option>
              <option value="doctor-acknowledge">/alerts/:id/doctor-acknowledge</option>
              <option value="acknowledge">/alerts/:id/acknowledge</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Management instruction</span>
            <textarea className="mt-1 min-h-32 w-full rounded-md border border-slate-300 p-3" value={message} onChange={(event) => setMessage(event.target.value)} required placeholder="Ward 03 - initiate isolation protocol" />
          </label>
        </form>
      </Modal>
    </div>
  );
}
