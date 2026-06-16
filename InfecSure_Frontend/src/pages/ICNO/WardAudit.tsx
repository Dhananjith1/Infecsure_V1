import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Save, WifiOff } from "lucide-react";
import { createAudit, type AuditPayload, type CompliancePayload } from "../../api/audits";
import { apiErrorMessage } from "../../api/client";
import { listWards } from "../../api/wards";
import { Button } from "../../components/Button";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { useOfflineSync } from "../../hooks/useOfflineSync";
import { useToast } from "../../hooks/useToast";
import type { HeatmapWard } from "../../types";

const sections = [
  {
    key: "hand_hygiene",
    scoreKey: "hand_hygiene_score",
    itemKey: "hand_hygiene_items",
    title: "Hand Hygiene",
    items: ["Hand hygiene stations stocked", "Alcohol rub available", "Staff hand hygiene observed"]
  },
  {
    key: "ppe",
    scoreKey: "ppe_score",
    itemKey: "ppe_items",
    title: "PPE Compliance",
    items: ["PPE compliance", "Masks and gloves available", "Isolation PPE station ready"]
  },
  {
    key: "waste",
    scoreKey: "waste_segregation_score",
    itemKey: "waste_segregation_items",
    title: "Waste / Garbage Removal",
    items: ["Garbage / waste removed", "Clinical waste segregated", "Sharps container below fill line"]
  },
  {
    key: "environment",
    scoreKey: "environmental_score",
    itemKey: "environmental_items",
    title: "Environmental Hygiene",
    items: ["Toilet hygiene", "Lighting status", "Bedside surfaces cleaned", "Ventilation and drainage acceptable"]
  }
] as const;

type ToggleState = Record<string, boolean>;

const fallbackWards: HeatmapWard[] = [
  { ward_id: "etu", ward_name: "ETU", risk_level: "medium", risk_score: 0 },
  { ward_id: "male_ward", ward_name: "Male Ward", risk_level: "medium", risk_score: 0 },
  { ward_id: "female_ward", ward_name: "Female Ward", risk_level: "medium", risk_score: 0 },
  { ward_id: "opd", ward_name: "OPD", risk_level: "medium", risk_score: 0 },
  { ward_id: "family_medical_clinic", ward_name: "Family Medical Clinic", risk_level: "low", risk_score: 0 },
  { ward_id: "psychiatrist_clinic", ward_name: "Psychiatrist Clinic", risk_level: "low", risk_score: 0 }
];

export function WardAudit() {
  const [searchParams] = useSearchParams();
  const [wardId, setWardId] = useState(searchParams.get("ward") || "etu");
  const [remarks, setRemarks] = useState("");
  const [wards, setWards] = useState<HeatmapWard[]>(fallbackWards);
  const [toggles, setToggles] = useState<ToggleState>(() => Object.fromEntries(sections.flatMap((section) => section.items.map((item) => [item, true]))));
  const [submitting, setSubmitting] = useState(false);
  const { offlineCount, saveOffline, syncNow, syncing } = useOfflineSync();
  const { showToast } = useToast();

  useEffect(() => {
    let mounted = true;
    listWards()
      .then((items) => {
        if (!mounted || !items.length) return;
        setWards(items);
        const hasSelectedWard = items.some((ward) => ward.ward_id === wardId);
        if (!hasSelectedWard) {
          setWardId(items[0].ward_id);
        }
      })
      .catch(() => setWards(fallbackWards));
    return () => {
      mounted = false;
    };
  }, [wardId]);

  const payload = useMemo<AuditPayload>(() => {
    const draft: Record<string, unknown> = { ward_id: wardId, remarks, is_offline_sync: false };
    for (const section of sections) {
      const items: CompliancePayload[] = section.items.map((item) => ({ item_name: item, compliant: Boolean(toggles[item]) }));
      const compliant = items.filter((item) => item.compliant).length;
      draft[section.itemKey] = items;
      draft[section.scoreKey] = Math.round((compliant / items.length) * 100);
    }
    return draft as AuditPayload;
  }, [remarks, toggles, wardId]);

  const overallCompliance = Math.round((
    payload.hand_hygiene_score +
    payload.ppe_score +
    payload.waste_segregation_score +
    payload.environmental_score
  ) / 4);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (!navigator.onLine) {
        await saveOffline({
          offline_record_id: crypto.randomUUID(),
          ward_id: wardId,
          hand_hygiene: { correct: payload.hand_hygiene_items.filter((i) => i.compliant).length, total: payload.hand_hygiene_items.length },
          ppe_adherence: { correct: payload.ppe_items.filter((i) => i.compliant).length, total: payload.ppe_items.length },
          waste_segregation: { misplaced_items: payload.waste_segregation_items.filter((i) => !i.compliant).length, total_items: payload.waste_segregation_items.length },
          environmental_score: payload.environmental_score,
          hand_hygiene_items: payload.hand_hygiene_items,
          ppe_items: payload.ppe_items,
          waste_segregation_items: payload.waste_segregation_items,
          environmental_items: payload.environmental_items,
          remarks,
          captured_at: new Date().toISOString()
        });
        showToast({ type: "info", title: "Audit saved offline", message: "It will sync when the connection returns." });
      } else {
        await createAudit(payload);
        showToast({ type: "success", title: "Audit submitted", message: "Compliance and risk calculations were sent for validation." });
      }
    } catch (err) {
      showToast({ type: "error", title: "Audit could not be saved", message: apiErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">New Audit</h1>
          <p className="mt-1 text-sm text-slate-600">Digital ward round checklist, shaped like the existing paper forms.</p>
        </div>
        <Button type="button" variant="secondary" disabled={!offlineCount || syncing} icon={<WifiOff size={18} />} onClick={() => syncNow().then(() => showToast({ type: "success", title: "Offline audits synced" }))}>
          {offlineCount} waiting to sync
        </Button>
      </div>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm font-semibold text-indigo-800">
        {offlineCount} audits saved offline - will sync when connected.
      </div>

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Real-time Ward Compliance Score</p>
            <p className="mt-1 text-4xl font-bold text-clinical-800">{overallCompliance}%</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <span className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">Hand {payload.hand_hygiene_score}%</span>
            <span className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">PPE {payload.ppe_score}%</span>
            <span className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">Waste {payload.waste_segregation_score}%</span>
            <span className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">Environment {payload.environmental_score}%</span>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ward Details" />
        <CardBody>
          <label>
            <span className="text-sm font-semibold text-slate-700">Ward / Unit</span>
            <select className="mt-1 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3" value={wardId} onChange={(event) => setWardId(event.target.value)} required>
              {wards.map((ward) => (
                <option key={ward.ward_id} value={ward.ward_id}>
                  {ward.ward_name || ward.ward_id}
                </option>
              ))}
            </select>
          </label>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.key}>
            <CardHeader title={section.title} description={`${payload[section.scoreKey]}% compliant`} />
            <CardBody className="space-y-3">
              {section.items.map((item) => (
                <div key={item} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3">
                  <span className="font-medium text-slate-800">{item}</span>
                  <div className="grid min-w-48 grid-cols-2 rounded-md border border-slate-300 bg-white p-1">
                    <button type="button" className={`touch-target rounded px-3 text-sm font-semibold ${toggles[item] ? "bg-emerald-600 text-white" : "text-slate-600"}`} onClick={() => setToggles((current) => ({ ...current, [item]: true }))}>Yes</button>
                    <button type="button" className={`touch-target rounded px-3 text-sm font-semibold ${!toggles[item] ? "bg-red-600 text-white" : "text-slate-600"}`} onClick={() => setToggles((current) => ({ ...current, [item]: false }))}>No</button>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="ICNO Additional Note" />
        <CardBody>
          <textarea
            className="min-h-32 w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm"
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder="Add observations that are not covered by the digital checklist."
          />
        </CardBody>
      </Card>

      <Button type="submit" disabled={submitting} icon={<Save size={18} />}>
        {submitting ? "Saving audit..." : navigator.onLine ? "Submit audit" : "Save offline"}
      </Button>
    </form>
  );
}
