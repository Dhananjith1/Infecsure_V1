import { ChangeEvent, useEffect, useState } from "react";
import { Activity, Bot, ClipboardList, FileText, FlaskConical, MapPin, RefreshCw, Search, Shield, Trash2, Upload, Users } from "lucide-react";
import { apiErrorMessage } from "../../api/client";
import { detailedHealth, rootHealth } from "../../api/system";
import { createUser, deactivateUser, getUser, listUsers, updateUser } from "../../api/users";
import { createWard, deleteWard, getWard, getWardAudits, getWardLabResults, listWards, predictWard, updateWard } from "../../api/wards";
import { createPathogen, deletePathogen, getPathogen, getPathogenStats, listPathogens, updatePathogen } from "../../api/pathogens";
import { getAiMetrics, predictAiEngine } from "../../api/prediction";
import { refreshHeatmap } from "../../api/heatmap";
import { createNotice, deleteNotice, listNotices } from "../../api/notices";
import { generateDengueReport, generateExecutiveReport, listReports, reportDownloadUrl } from "../../api/reports";
import { getAudit, listAudits } from "../../api/audits";
import { getLabResult, listLabResults } from "../../api/lab";
import { getAlert, listAlerts } from "../../api/alerts";
import { listGatePending, validateGateItem } from "../../api/gate";
import { getOcrRecord, listLowConfidenceOcr, listOcrQueue, processDocument, uploadDocument } from "../../api/ocr";
import { Button } from "../../components/Button";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { useToast } from "../../hooks/useToast";
import type { UserRole } from "../../types";

function ResultPanel({ result }: { result: unknown }) {
  return (
    <pre className="clinical-scrollbar max-h-96 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-slate-50">
      {JSON.stringify(result ?? { status: "No action run yet" }, null, 2)}
    </pre>
  );
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function SystemConsole() {
  const { showToast } = useToast();
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState("");
  const [userForm, setUserForm] = useState({ uid: "", email: "", password: "", full_name: "", role: "staff" as UserRole });
  const [wardForm, setWardForm] = useState({ ward_id: "etu", name: "ETU", bed_count: 10, floor: "Ground", description: "" });
  const [pathogenForm, setPathogenForm] = useState({ pathogen_id: "dengue", name: "Dengue NS1", category: "virus", risk_level: "high" as "low" | "moderate" | "high" | "critical", description: "", typical_source: "Mosquito-borne" });
  const [noticeForm, setNoticeForm] = useState({ notice_id: "", title: "Elevated infection risk", body: "Please follow PPE precautions.", is_pinned: true });
  const [recordForm, setRecordForm] = useState({ audit_id: "", result_id: "", alert_id: "", report_id: "", scan_id: "" });
  const [aiWard, setAiWard] = useState("etu");
  const [ocrFile, setOcrFile] = useState<File | null>(null);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    try {
      const data = await action();
      setResult({ endpoint: label, data });
      showToast({ type: "success", title: label });
      return data;
    } catch (err) {
      const message = apiErrorMessage(err);
      setResult({ endpoint: label, error: message });
      showToast({ type: "error", title: label, message });
      return null;
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    run("GET /health", detailedHealth);
  }, []);

  const wardPayload = {
    name: wardForm.name,
    bed_count: Number(wardForm.bed_count || 0),
    floor: wardForm.floor,
    description: wardForm.description
  };

  const pathogenPayload = {
    name: pathogenForm.name,
    category: pathogenForm.category,
    risk_level: pathogenForm.risk_level,
    description: pathogenForm.description,
    typical_source: pathogenForm.typical_source
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">ICNO System Console</h1>
        <p className="mt-1 text-sm text-slate-600">Administrative and endpoint-level controls for backend functions that do not belong on the daily clinical dashboard.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="System, Heatmap, and AI" description="Health checks, model metrics, heatmap refresh, and both prediction APIs." />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" icon={<Activity size={18} />} onClick={() => run("GET /", rootHealth)}>Root health</Button>
                <Button variant="secondary" icon={<Activity size={18} />} onClick={() => run("GET /health", detailedHealth)}>Detailed health</Button>
                <Button icon={<RefreshCw size={18} />} onClick={() => run("POST /heatmap/refresh", refreshHeatmap)}>Refresh heatmap</Button>
                <Button variant="secondary" icon={<Bot size={18} />} onClick={() => run("GET /ai-engine/metrics", getAiMetrics)}>ML metrics</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input className="min-h-12 rounded-md border border-slate-300 px-3" value={aiWard} onChange={(event) => setAiWard(event.target.value)} />
                <Button icon={<Bot size={18} />} onClick={() => run(`POST /ai-engine/${aiWard}/predict`, () => predictAiEngine(aiWard, {
                  hand_hygiene_score: 82,
                  ppe_score: 78,
                  waste_segregation_score: 70,
                  environmental_score: 75,
                  recent_lab_count: 5,
                  anomaly_count: 1,
                  max_virulence: 0.6,
                  days_since_last_audit: 2
                }))}>AI predict</Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Users" description="ICNO-only Firebase user management." />
            <CardBody className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="UID" value={userForm.uid} onChange={(event) => setUserForm((v) => ({ ...v, uid: event.target.value }))} />
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="Email" value={userForm.email} onChange={(event) => setUserForm((v) => ({ ...v, email: event.target.value }))} />
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="Full name" value={userForm.full_name} onChange={(event) => setUserForm((v) => ({ ...v, full_name: event.target.value }))} />
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="Temporary password" value={userForm.password} onChange={(event) => setUserForm((v) => ({ ...v, password: event.target.value }))} />
                <select className="min-h-12 rounded-md border border-slate-300 px-3" value={userForm.role} onChange={(event) => setUserForm((v) => ({ ...v, role: event.target.value as UserRole }))}>
                  <option value="icno">ICNO</option><option value="sister">Sister</option><option value="lab">Lab</option><option value="doctor">Doctor</option><option value="staff">Staff</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" icon={<Users size={18} />} onClick={() => run("GET /users/", listUsers)}>List</Button>
                <Button icon={<Users size={18} />} onClick={() => run("POST /users/", () => createUser(userForm))}>Create</Button>
                <Button variant="secondary" icon={<Search size={18} />} onClick={() => run(`GET /users/${userForm.uid}`, () => getUser(userForm.uid))}>Get</Button>
                <Button variant="secondary" onClick={() => run(`PUT /users/${userForm.uid}`, () => updateUser(userForm.uid, { full_name: userForm.full_name, role: userForm.role }))}>Update</Button>
                <Button variant="danger" icon={<Trash2 size={18} />} onClick={() => run(`DELETE /users/${userForm.uid}`, () => deactivateUser(userForm.uid))}>Deactivate</Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Wards" description="Ward catalogue, details, ward-specific audits/lab results, and ward prediction." />
            <CardBody className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="ward_id" value={wardForm.ward_id} onChange={(event) => setWardForm((v) => ({ ...v, ward_id: event.target.value }))} />
                <select className="min-h-12 rounded-md border border-slate-300 px-3" value={wardForm.name} onChange={(event) => setWardForm((v) => ({ ...v, name: event.target.value }))}>
                  <option>ETU</option><option>Male Ward</option><option>Female Ward</option><option>OPD</option><option>Family Medical Clinic</option><option>Psychiatrist Clinic</option>
                </select>
                <input className="min-h-12 rounded-md border border-slate-300 px-3" type="number" placeholder="Beds" value={wardForm.bed_count} onChange={(event) => setWardForm((v) => ({ ...v, bed_count: Number(event.target.value) }))} />
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="Floor" value={wardForm.floor} onChange={(event) => setWardForm((v) => ({ ...v, floor: event.target.value }))} />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" icon={<MapPin size={18} />} onClick={() => run("GET /wards/", listWards)}>List</Button>
                <Button icon={<MapPin size={18} />} onClick={() => run("POST /wards/", () => createWard(wardPayload))}>Create</Button>
                <Button variant="secondary" onClick={() => run(`GET /wards/${wardForm.ward_id}`, () => getWard(wardForm.ward_id))}>Get</Button>
                <Button variant="secondary" onClick={() => run(`PUT /wards/${wardForm.ward_id}`, () => updateWard(wardForm.ward_id, wardPayload))}>Update</Button>
                <Button variant="danger" onClick={() => run(`DELETE /wards/${wardForm.ward_id}`, () => deleteWard(wardForm.ward_id))}>Delete</Button>
                <Button onClick={() => run(`POST /wards/${wardForm.ward_id}/predict`, () => predictWard(wardForm.ward_id))}>Ward predict</Button>
                <Button variant="secondary" onClick={() => run(`GET /wards/${wardForm.ward_id}/audits`, () => getWardAudits(wardForm.ward_id))}>Ward audits</Button>
                <Button variant="secondary" onClick={() => run(`GET /wards/${wardForm.ward_id}/lab-results`, () => getWardLabResults(wardForm.ward_id))}>Ward labs</Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pathogens and Lab Intelligence" />
            <CardBody className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="pathogen_id" value={pathogenForm.pathogen_id} onChange={(event) => setPathogenForm((v) => ({ ...v, pathogen_id: event.target.value }))} />
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="Name" value={pathogenForm.name} onChange={(event) => setPathogenForm((v) => ({ ...v, name: event.target.value }))} />
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="Category" value={pathogenForm.category} onChange={(event) => setPathogenForm((v) => ({ ...v, category: event.target.value }))} />
                <select className="min-h-12 rounded-md border border-slate-300 px-3" value={pathogenForm.risk_level} onChange={(event) => setPathogenForm((v) => ({ ...v, risk_level: event.target.value as typeof pathogenForm.risk_level }))}>
                  <option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" icon={<FlaskConical size={18} />} onClick={() => run("GET /pathogens/", listPathogens)}>List</Button>
                <Button icon={<FlaskConical size={18} />} onClick={() => run("POST /pathogens/", () => createPathogen(pathogenPayload))}>Create</Button>
                <Button variant="secondary" onClick={() => run(`GET /pathogens/${pathogenForm.pathogen_id}`, () => getPathogen(pathogenForm.pathogen_id))}>Get</Button>
                <Button variant="secondary" onClick={() => run(`PUT /pathogens/${pathogenForm.pathogen_id}`, () => updatePathogen(pathogenForm.pathogen_id, pathogenPayload))}>Update</Button>
                <Button variant="danger" onClick={() => run(`DELETE /pathogens/${pathogenForm.pathogen_id}`, () => deletePathogen(pathogenForm.pathogen_id))}>Delete</Button>
                <Button variant="secondary" onClick={() => run(`GET /pathogens/${pathogenForm.pathogen_id}/stats`, () => getPathogenStats(pathogenForm.pathogen_id))}>Stats</Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Records, Gate, Reports, Notices, and OCR" />
            <CardBody className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="audit_id" value={recordForm.audit_id} onChange={(event) => setRecordForm((v) => ({ ...v, audit_id: event.target.value }))} />
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="result_id" value={recordForm.result_id} onChange={(event) => setRecordForm((v) => ({ ...v, result_id: event.target.value }))} />
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="alert_id" value={recordForm.alert_id} onChange={(event) => setRecordForm((v) => ({ ...v, alert_id: event.target.value }))} />
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="scan_id" value={recordForm.scan_id} onChange={(event) => setRecordForm((v) => ({ ...v, scan_id: event.target.value }))} />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" icon={<ClipboardList size={18} />} onClick={() => run("GET /audits/", listAudits)}>Audits</Button>
                <Button variant="secondary" onClick={() => run(`GET /audits/${recordForm.audit_id}`, () => getAudit(recordForm.audit_id))}>Audit detail</Button>
                <Button variant="secondary" onClick={() => run("GET /lab-results/", () => listLabResults())}>Lab results</Button>
                <Button variant="secondary" onClick={() => run(`GET /lab-results/${recordForm.result_id}`, () => getLabResult(recordForm.result_id))}>Lab detail</Button>
                <Button variant="secondary" onClick={() => run("GET /alerts/", () => listAlerts())}>Alerts</Button>
                <Button variant="secondary" onClick={() => run(`GET /alerts/${recordForm.alert_id}`, () => getAlert(recordForm.alert_id))}>Alert detail</Button>
                <Button variant="secondary" icon={<Shield size={18} />} onClick={() => run("GET /gate/pending", listGatePending)}>Gate queue</Button>
                <Button onClick={() => run("POST /gate/validate approve", () => validateGateItem(recordForm.alert_id, "approve", "Approved from console"))}>Gate approve</Button>
                <Button variant="danger" onClick={() => run("POST /gate/validate reject", () => validateGateItem(recordForm.alert_id, "reject", "Rejected from console"))}>Gate reject</Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" icon={<FileText size={18} />} onClick={() => run("GET /reports/", listReports)}>Reports</Button>
                <Button onClick={() => run("POST /reports/executive pdf", () => generateExecutiveReport("pdf"))}>Executive PDF</Button>
                <Button onClick={() => run("POST /reports/executive excel", () => generateExecutiveReport("excel"))}>Executive Excel</Button>
                <Button variant="secondary" onClick={async () => {
                  const report = await run("POST /reports/dengue", () => generateDengueReport(recordForm.alert_id));
                  if (report && typeof report === "object" && "download_url" in report) window.open(reportDownloadUrl(String(report.download_url)), "_blank", "noopener,noreferrer");
                }}>Dengue report</Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="notice_id" value={noticeForm.notice_id} onChange={(event) => setNoticeForm((v) => ({ ...v, notice_id: event.target.value }))} />
                <input className="min-h-12 rounded-md border border-slate-300 px-3" placeholder="Notice title" value={noticeForm.title} onChange={(event) => setNoticeForm((v) => ({ ...v, title: event.target.value }))} />
                <input className="min-h-12 rounded-md border border-slate-300 px-3 md:col-span-2" placeholder="Notice body" value={noticeForm.body} onChange={(event) => setNoticeForm((v) => ({ ...v, body: event.target.value }))} />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => run("GET /notices/", listNotices)}>Notices</Button>
                <Button onClick={() => run("POST /notices/", () => createNotice({ title: noticeForm.title, body: noticeForm.body, is_pinned: noticeForm.is_pinned }))}>Create notice</Button>
                <Button variant="danger" onClick={() => run(`DELETE /notices/${noticeForm.notice_id}`, () => deleteNotice(noticeForm.notice_id))}>Delete notice</Button>
              </div>
              <div className="space-y-3 rounded-md border border-slate-200 p-3">
                <input type="file" accept="image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => setOcrFile(event.target.files?.[0] || null)} />
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={() => run("GET /ocr/queue", listOcrQueue)}>OCR queue</Button>
                  <Button variant="secondary" onClick={() => run("GET /ocr/pending", listLowConfidenceOcr)}>Low-confidence OCR</Button>
                  <Button variant="secondary" onClick={() => run(`GET /ocr/${recordForm.scan_id}`, () => getOcrRecord(recordForm.scan_id))}>OCR detail</Button>
                  <Button icon={<Upload size={18} />} disabled={!ocrFile} onClick={() => run("POST /ocr/upload", () => uploadDocument(ocrFile as File, "general"))}>Upload OCR</Button>
                  <Button variant="secondary" disabled={!ocrFile} onClick={async () => {
                    if (!ocrFile) return;
                    const base64 = await fileToBase64(ocrFile);
                    await run("POST /ocr/process", () => processDocument(base64, "general"));
                  }}>Process alias</Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader title="Last Endpoint Result" description={busy ? `Running ${busy}` : "JSON response or error from the latest action."} />
            <CardBody><ResultPanel result={result} /></CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
