import { FormEvent, useEffect, useState } from "react";
import { Bell, FileText, MessageSquare, Send } from "lucide-react";
import { doctorAcknowledge, doctorSignoff, listAlerts, listManagementInstructions, sendDoctorInstructions } from "../../api/alerts";
import { apiErrorMessage } from "../../api/client";
import { generateDengueReport, reportDownloadUrl } from "../../api/reports";
import { Button } from "../../components/Button";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { Modal } from "../../components/Modal";
import { RiskBadge } from "../../components/RiskBadge";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../hooks/useToast";
import type { AlertItem } from "../../types";

export function DoctorDashboard() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [instructions, setInstructions] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<AlertItem | null>(null);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  const [ackMode, setAckMode] = useState<"instructions" | "doctor-acknowledge" | "acknowledge">("instructions");
  const { showToast } = useToast();

  useEffect(() => {
    listAlerts("approved").then(setAlerts).catch(() => setAlerts([]));
    listManagementInstructions().then((data) => setInstructions(Array.isArray(data) ? data : [])).catch(() => setInstructions([]));
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
      window.open(reportDownloadUrl(report.download_url), "_blank", "noopener,noreferrer");
    } catch (err) {
      showToast({ type: "error", title: "Report failed", message: apiErrorMessage(err) });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Supervising Doctor Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Only ICNO-approved clinical alerts appear here.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
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

        <Card>
          <CardHeader title="Instruction Log" />
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
      </div>

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
