import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock, FileText, RefreshCw, Send } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { createLabResult, listLabResults, scanLabSlip, type LabSlipOCRResponse } from "../../api/lab";
import { listPathogens } from "../../api/pathogens";
import { listWards } from "../../api/wards";
import { apiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { useToast } from "../../hooks/useToast";
import type { HeatmapWard, LabResult } from "../../types";

type LabTestType = {
  id: string;
  name: string;
  specimen: string;
};

const FALLBACK_TEST_TYPES: LabTestType[] = [
  { id: "dengue", name: "Dengue NS1", specimen: "blood" },
  { id: "covid19", name: "Covid-19 RDT", specimen: "other" }
];

const FALLBACK_WARDS: Pick<HeatmapWard, "ward_id" | "ward_name">[] = [
  { ward_id: "male_ward", ward_name: "Male Ward" },
  { ward_id: "female_ward", ward_name: "Female Ward" },
  { ward_id: "etu", ward_name: "ETU" },
  { ward_id: "opd", ward_name: "OPD" },
  { ward_id: "family_medical_clinic", ward_name: "Family Medical Clinic" },
  { ward_id: "psychiatrist_clinic", ward_name: "Psychiatrist Clinic" }
];

const initialForm = {
  bht_number: "",
  ward_id: "male_ward",
  test_type_id: "dengue",
  specimen_type: "blood",
  result_datetime: localDateTimeValue(new Date()),
  result: "positive" as "positive" | "negative"
};

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value?: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function resultLabel(item: LabResult) {
  if (item.test_result) return item.test_result;
  if (typeof item.colony_count === "number") return item.colony_count > 0 ? "positive" : "negative";
  return item.notes?.toLowerCase().includes("negative") ? "negative" : "positive";
}

function statusText(status?: string) {
  return (status || "pending").toLowerCase() === "approved" ? "Approved by ICNO" : "Pending";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function inferSpecimenType(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("dengue") || lower.includes("ns1") || lower.includes("blood")) return "blood";
  if (lower.includes("urine")) return "urine";
  if (lower.includes("sputum")) return "sputum";
  if (lower.includes("stool")) return "stool";
  if (lower.includes("csf")) return "csf";
  if (lower.includes("wound") || lower.includes("swab")) return "wound_swab";
  return "other";
}

function normalizedTestKey(test: Pick<LabTestType, "id" | "name">) {
  const value = `${test.id} ${test.name}`.toLowerCase();
  if (value.includes("dengue") || value.includes("ns1")) return "dengue";
  if (value.includes("covid") || value.includes("cov-19") || value.includes("sars") || value.includes("rdt")) return "covid19";
  return value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function LabDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "entry";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submissions, setSubmissions] = useState<LabResult[]>([]);
  const [wards, setWards] = useState<Pick<HeatmapWard, "ward_id" | "ward_name">[]>(FALLBACK_WARDS);
  const [testTypes, setTestTypes] = useState<LabTestType[]>(FALLBACK_TEST_TYPES);
  const [ocrResult, setOcrResult] = useState<LabSlipOCRResponse | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const { showToast } = useToast();

  const selectedTest = useMemo(
    () => testTypes.find((test) => test.id === form.test_type_id) || testTypes[0] || FALLBACK_TEST_TYPES[0],
    [form.test_type_id, testTypes]
  );
  const selectedWard = useMemo(
    () => wards.find((ward) => ward.ward_id === form.ward_id),
    [form.ward_id, wards]
  );
  const maxDateTime = localDateTimeValue(new Date());

  async function refreshSubmissions() {
    try {
      setSubmissions(await listLabResults());
    } catch {
      setSubmissions([]);
    }
  }

  useEffect(() => {
    refreshSubmissions();
    listWards()
      .then((items) => {
        const next = items.map((ward) => ({
          ward_id: ward.ward_id,
          ward_name: ward.ward_name || ward.ward_id
        }));
        if (next.length) {
          setWards(next);
          setForm((current) => next.some((ward) => ward.ward_id === current.ward_id)
            ? current
            : { ...current, ward_id: next[0].ward_id });
        }
      })
      .catch(() => setWards(FALLBACK_WARDS));
    listPathogens()
      .then((items) => {
        const merged = new Map<string, LabTestType>();
        FALLBACK_TEST_TYPES.forEach((test) => merged.set(normalizedTestKey(test), test));
        items.forEach((pathogen) => {
          const id = pathogen.pathogen_id;
          if (!id) return;
          const next = {
            id,
            name: pathogen.name,
            specimen: inferSpecimenType(`${pathogen.name} ${pathogen.typical_source || ""}`)
          };
          const key = normalizedTestKey(next);
          if (!merged.has(key)) merged.set(key, next);
        });
        const next = Array.from(merged.values());
        setTestTypes(next);
        setForm((current) => next.some((test) => test.id === current.test_type_id)
          ? current
          : { ...current, test_type_id: next[0]?.id || "dengue" });
      })
      .catch(() => setTestTypes(FALLBACK_TEST_TYPES));
  }, []);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  function validate() {
    const next: Record<string, string> = {};
    if (!form.bht_number.trim()) next.bht_number = "Patient BHT number is required.";
    if (!form.ward_id) next.ward_id = "Ward is required.";
    if (!form.test_type_id) next.test_type_id = "Test type is required.";
    if (!form.specimen_type) next.specimen_type = "Specimen type is required.";
    if (!form.result_datetime) next.result_datetime = "Result date and time is required.";
    if (form.result_datetime && new Date(form.result_datetime) > new Date()) next.result_datetime = "Future result times are not allowed.";
    if (!form.result) next.result = "Test result is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await createLabResult({
        ward_id: form.ward_id,
        pathogen_id: selectedTest.id,
        pathogen_name: selectedTest.name,
        specimen_type: form.specimen_type,
        result_date: new Date(form.result_datetime).toISOString(),
        test_result: form.result,
        colony_count: form.result === "positive" ? 1 : 0,
        patient_ward_location: form.bht_number.trim(),
        notes: ocrResult ? `OCR engine: ${ocrResult.engine}` : "Manual laboratory entry"
      });
      await refreshSubmissions();
      setForm((current) => ({ ...current, bht_number: "", result_datetime: localDateTimeValue(new Date()), result: "positive" }));
      setOcrResult(null);
      setSearchParams({ tab: "status" });
      showToast({ type: "success", title: "Result submitted", message: "Z-score analysis completed and status is pending ICNO approval." });
    } catch (err) {
      showToast({ type: "error", title: "Submission failed", message: apiErrorMessage(err) });
    } finally {
      setIsSubmitting(false);
    }
  }

  function applyOcrFields(scan: LabSlipOCRResponse) {
    const fields = scan.extracted_fields || {};
    setForm((current) => {
      const matchedTest = testTypes.find((test) => {
        const id = String(fields.pathogen_id || "").toLowerCase();
        const name = String(fields.pathogen_name || "").toLowerCase();
        return id === test.id || name.includes(test.name.toLowerCase().split(" ")[0]);
      });
      return {
        ...current,
        bht_number: String(fields.patient_ward_location || current.bht_number),
        ward_id: String(fields.ward_id || current.ward_id),
        test_type_id: matchedTest?.id || current.test_type_id,
        specimen_type: String(fields.specimen_type || matchedTest?.specimen || current.specimen_type),
        result: fields.test_result === "negative" ? "negative" : fields.test_result === "positive" ? "positive" : current.result
      };
    });
  }

  async function scanImage(imageBase64: string) {
    setIsScanning(true);
    try {
      const scan = await scanLabSlip(imageBase64);
      setOcrResult(scan);
      applyOcrFields(scan);
      showToast({ type: "success", title: "Slip scanned", message: "Detected fields were copied into the entry form." });
    } catch (err) {
      showToast({ type: "error", title: "OCR scan failed", message: apiErrorMessage(err) });
    } finally {
      setIsScanning(false);
    }
  }

  async function onScanFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const imageBase64 = await readFileAsDataUrl(file);
    await scanImage(imageBase64);
  }

  async function startCamera() {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } }
      });
      setCameraStream(stream);
      window.setTimeout(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => undefined);
      }, 0);
    } catch (err) {
      setCameraError(apiErrorMessage(err));
    }
  }

  function stopCamera() {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function captureCameraFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);
    await scanImage(canvas.toDataURL("image/jpeg", 0.92));
  }

  const entrySection = (
    <Card>
      <CardHeader
        title="New Lab Result"
        description="Patient BHT, ward, test type, and positive or negative result."
        action={
          <Button variant="secondary" icon={<Camera size={18} />} onClick={() => setSearchParams({ tab: "ocr" })}>
            OCR Scan
          </Button>
        }
      />
      <CardBody>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Patient BHT Number</span>
            <input
              className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3"
              value={form.bht_number}
              onChange={(event) => setForm((current) => ({ ...current, bht_number: event.target.value }))}
            />
            {errors.bht_number ? <span className="mt-1 block text-sm text-red-700">{errors.bht_number}</span> : null}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Ward</span>
            <select
              className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3"
              value={form.ward_id}
              onChange={(event) => setForm((current) => ({ ...current, ward_id: event.target.value }))}
            >
              {wards.map((ward) => (
                <option key={ward.ward_id} value={ward.ward_id}>{ward.ward_name}</option>
              ))}
            </select>
            {errors.ward_id ? <span className="mt-1 block text-sm text-red-700">{errors.ward_id}</span> : null}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Test Type</span>
            <select
              className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3"
              value={form.test_type_id}
              onChange={(event) => {
                const test = testTypes.find((item) => item.id === event.target.value);
                setForm((current) => ({
                  ...current,
                  test_type_id: event.target.value,
                  specimen_type: test?.specimen || current.specimen_type
                }));
              }}
            >
              {testTypes.map((test) => (
                <option key={test.id} value={test.id}>{test.name}</option>
              ))}
            </select>
            {errors.test_type_id ? <span className="mt-1 block text-sm text-red-700">{errors.test_type_id}</span> : null}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Specimen Type</span>
            <select
              className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3"
              value={form.specimen_type}
              onChange={(event) => setForm((current) => ({ ...current, specimen_type: event.target.value }))}
            >
              <option value="blood">Blood</option>
              <option value="urine">Urine</option>
              <option value="sputum">Sputum</option>
              <option value="wound_swab">Wound swab</option>
              <option value="csf">CSF</option>
              <option value="stool">Stool</option>
              <option value="other">Other</option>
            </select>
            {errors.specimen_type ? <span className="mt-1 block text-sm text-red-700">{errors.specimen_type}</span> : null}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Result Date & Time</span>
            <input
              className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3"
              type="datetime-local"
              max={maxDateTime}
              value={form.result_datetime}
              onChange={(event) => setForm((current) => ({ ...current, result_datetime: event.target.value }))}
            />
            {errors.result_datetime ? <span className="mt-1 block text-sm text-red-700">{errors.result_datetime}</span> : null}
          </label>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-700">Test Result</legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["positive", "negative"] as const).map((result) => (
                <button
                  key={result}
                  type="button"
                  className={`min-h-12 rounded-md border px-3 text-sm font-semibold capitalize transition ${
                    form.result === result
                      ? "border-clinical-700 bg-clinical-700 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                  onClick={() => setForm((current) => ({ ...current, result }))}
                >
                  {result}
                </button>
              ))}
            </div>
            {errors.result ? <span className="mt-1 block text-sm text-red-700">{errors.result}</span> : null}
          </fieldset>

          <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:col-span-2 sm:grid-cols-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-500">Ward ID</span>
              <input className="mt-1 min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={selectedWard?.ward_id || form.ward_id} readOnly />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-500">Pathogen ID</span>
              <input className="mt-1 min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={selectedTest.id} readOnly />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-500">Pathogen Name</span>
              <input className="mt-1 min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={selectedTest.name} readOnly />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-500">Z-Score Count</span>
              <input className="mt-1 min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={form.result === "positive" ? 1 : 0} readOnly />
            </label>
          </div>

          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button icon={<Send size={18} />} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Result"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );

  const ocrSection = (
    <Card>
      <CardHeader
        title="OCR Scan"
        description="Scan printed Dengue NS1 or Covid-19 RDT slips."
        action={<Camera size={20} className="text-clinical-700" />}
      />
      <CardBody className="space-y-5">
        <div className="rounded-md border border-dashed border-clinical-300 bg-clinical-50 p-4">
          <div className="flex flex-wrap gap-3">
            <Button type="button" icon={<Camera size={18} />} onClick={startCamera} disabled={isScanning || Boolean(cameraStream)}>
              Open Camera
            </Button>
            <label className="touch-target inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">
              {isScanning ? <RefreshCw size={18} className="animate-spin" /> : <FileText size={18} />}
              Upload Image
              <input className="sr-only" type="file" accept="image/*" onChange={onScanFile} disabled={isScanning} />
            </label>
            {cameraStream ? (
              <>
                <Button type="button" variant="secondary" icon={<Camera size={18} />} onClick={captureCameraFrame} disabled={isScanning}>
                  Capture Photo
                </Button>
                <Button type="button" variant="ghost" onClick={stopCamera}>
                  Stop Camera
                </Button>
              </>
            ) : null}
          </div>
          <p className="mt-3 text-xs font-medium text-clinical-700">Google Vision when configured, local OCR fallback in development.</p>
          {cameraError ? <p className="mt-3 text-sm font-semibold text-red-700">{cameraError}</p> : null}
        </div>

        {cameraStream ? (
          <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-950">
            <video ref={videoRef} className="aspect-video w-full object-contain" playsInline muted />
          </div>
        ) : null}
        <canvas ref={canvasRef} className="hidden" />

        {ocrResult ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">OCR Auto-Fill Ready</p>
                <p className="text-sm text-slate-600">Engine: {ocrResult.engine}</p>
              </div>
              <Button variant="secondary" icon={<FileText size={18} />} onClick={() => setSearchParams({ tab: "entry" })}>
                Review Entry
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(ocrResult.extracted_fields).map(([key, value]) => (
                <div key={key} className="rounded-md border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">{key.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{String(value)}</p>
                </div>
              ))}
            </div>
            {ocrResult.low_confidence_count > 0 ? (
              <p className="text-sm text-amber-700">{ocrResult.low_confidence_count} low-confidence OCR token(s) need review.</p>
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );

  const statusSection = (
    <Card>
      <CardHeader title="Submission Status Tracker" description="Only records entered by this laboratory account are listed." />
      <CardBody className="space-y-3">
        {!submissions.length ? <p className="text-sm text-slate-500">No submissions yet.</p> : null}
        {submissions.slice(0, 12).map((item, index) => {
          const approved = statusText(item.status) === "Approved by ICNO";
          const StatusIcon = approved ? CheckCircle2 : Clock;
          return (
            <article key={item.result_id || index} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{item.pathogen_name}</p>
                  <p className="mt-1 text-sm text-slate-600">BHT {item.patient_ward_location || "not recorded"} - {item.ward_id}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  approved
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-indigo-200 bg-indigo-50 text-indigo-700"
                }`}>
                  <StatusIcon size={14} />
                  {statusText(item.status)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
                <span className="capitalize">Result: {resultLabel(item)}</span>
                <span>{formatDate(item.created_at || item.result_date)}</span>
              </div>
            </article>
          );
        })}
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Laboratory Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Microbiology entry, OCR scan, and personal submission status.</p>
      </div>

      {activeTab === "ocr" ? ocrSection : activeTab === "status" ? statusSection : entrySection}
    </div>
  );
}
