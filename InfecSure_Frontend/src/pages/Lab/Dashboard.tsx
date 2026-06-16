import { FormEvent, useEffect, useState } from "react";
import { Microscope, Send } from "lucide-react";
import { createLabResult, listLabResults } from "../../api/lab";
import { createLabPathogen, getPositiveCultureVolume, listPathogens, type Pathogen } from "../../api/pathogens";
import { apiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../hooks/useToast";
import type { LabResult } from "../../types";

export function LabDashboard() {
  const [form, setForm] = useState({
    ward_id: "WARD-03",
    patient_ward_location: "",
    pathogen_id: "dengue",
    pathogen_name: "Dengue NS1",
    specimen_type: "blood",
    result: "positive",
    colony_count: "",
    notes: ""
  });
  const [submissions, setSubmissions] = useState<LabResult[]>([]);
  const [pathogens, setPathogens] = useState<Pathogen[]>([]);
  const [volume, setVolume] = useState<unknown>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();

  useEffect(() => {
    listLabResults().then(setSubmissions).catch(() => setSubmissions([]));
    listPathogens().then(setPathogens).catch(() => setPathogens([]));
  }, []);

  function validate() {
    const next: Record<string, string> = {};
    if (!form.patient_ward_location.trim()) next.patient_ward_location = "BHT or bed reference is required.";
    if (!form.ward_id.trim()) next.ward_id = "Ward is required.";
    if (!form.pathogen_name.trim()) next.pathogen_name = "Test type is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function addPathogen() {
    try {
      const created = await createLabPathogen({
        name: form.pathogen_name,
        category: "virus",
        risk_level: "high",
        typical_source: "Laboratory entry"
      });
      showToast({ type: "success", title: "Pathogen created", message: created.message });
      setPathogens(await listPathogens());
    } catch (err) {
      showToast({ type: "error", title: "Could not create pathogen", message: apiErrorMessage(err) });
    }
  }

  async function checkVolume() {
    try {
      setVolume(await getPositiveCultureVolume(form.ward_id, form.pathogen_id));
    } catch (err) {
      showToast({ type: "error", title: "Volume lookup failed", message: apiErrorMessage(err) });
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    try {
      const created = await createLabResult({
        ward_id: form.ward_id,
        pathogen_id: form.pathogen_id,
        pathogen_name: form.pathogen_name,
        specimen_type: form.specimen_type,
        result_date: new Date().toISOString(),
        colony_count: form.result === "positive" ? Number(form.colony_count || 1) : 0,
        patient_ward_location: form.patient_ward_location,
        notes: `${form.result}. ${form.notes}`.trim()
      });
      setSubmissions((current) => [created, ...current]);
      showToast({ type: "success", title: "Result logged", message: "Result logged - pending ICNO review." });
    } catch (err) {
      showToast({ type: "error", title: "Could not log result", message: apiErrorMessage(err) });
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Laboratory Result Entry</h1>
          <p className="mt-1 text-sm text-slate-600">Restricted write access. This role does not show hospital-wide risk data.</p>
        </div>
        <Card>
          <CardHeader title="New Lab Result" />
          <CardBody>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
              {[
                ["patient_ward_location", "BHT / bed reference"],
                ["ward_id", "Ward"],
                ["pathogen_name", "Test type"],
                ["pathogen_id", "Pathogen ID"]
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-sm font-semibold text-slate-700">{label}</span>
                  <input className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={String(form[key as keyof typeof form])} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
                  {errors[key] ? <span className="mt-1 block text-sm text-red-700">{errors[key]}</span> : null}
                </label>
              ))}
              <label>
                <span className="text-sm font-semibold text-slate-700">Specimen</span>
                <select className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={form.specimen_type} onChange={(event) => setForm((current) => ({ ...current, specimen_type: event.target.value }))}>
                  <option value="blood">Blood</option>
                  <option value="urine">Urine</option>
                  <option value="sputum">Sputum</option>
                  <option value="wound_swab">Wound swab</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                <span className="text-sm font-semibold text-slate-700">Result</span>
                <select className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={form.result} onChange={(event) => setForm((current) => ({ ...current, result: event.target.value }))}>
                  <option value="positive">Positive</option>
                  <option value="negative">Negative</option>
                </select>
              </label>
              <label>
                <span className="text-sm font-semibold text-slate-700">Colony count</span>
                <input className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" type="number" min="0" value={form.colony_count} onChange={(event) => setForm((current) => ({ ...current, colony_count: event.target.value }))} />
              </label>
              <label>
                <span className="text-sm font-semibold text-slate-700">Notes</span>
                <input className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <div className="sm:col-span-2"><Button icon={<Send size={18} />}>Submit result</Button></div>
            </form>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Lab Intelligence" description="Pathogen catalogue and 48-hour volume checks." />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={addPathogen}>Create pathogen</Button>
              <Button variant="secondary" onClick={checkVolume}>48h volume</Button>
            </div>
            {volume ? <pre className="rounded-md bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(volume, null, 2)}</pre> : null}
            <div className="space-y-2">
              {pathogens.slice(0, 5).map((pathogen) => (
                <div key={pathogen.pathogen_id} className="rounded-md border border-slate-200 p-3">
                  <p className="font-semibold text-slate-950">{pathogen.name}</p>
                  <p className="text-sm text-slate-600">{pathogen.category} - {pathogen.risk_level}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="My Submissions" description="Shows only minimal status information." />
          <CardBody className="space-y-3">
          {!submissions.length ? <p className="text-sm text-slate-500">No submissions yet.</p> : null}
          {submissions.slice(0, 8).map((item, index) => (
            <article key={item.result_id || index} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <Microscope size={18} className="text-clinical-700" />
                <p className="font-semibold text-slate-950">{item.pathogen_name}</p>
              </div>
              <p className="mt-1 text-sm text-slate-600">{item.ward_id}</p>
              <div className="mt-2"><StatusBadge status={item.status || "pending"} /></div>
            </article>
          ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
