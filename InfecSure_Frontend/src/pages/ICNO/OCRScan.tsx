import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Loader2, ScanLine, Video, X } from "lucide-react";
import { apiErrorMessage } from "../../api/client";
import { confirmOcr, scanDocument } from "../../api/ocr";
import { Button } from "../../components/Button";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../hooks/useToast";

type OcrResponse = {
  scan_id: string;
  form_type: string;
  raw_text: string;
  tokens: { text: string; confidence: number; needs_review?: boolean }[];
  low_confidence_count: number;
  extracted_fields: Record<string, unknown>;
  status: string;
};

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatKeyLabel(key: string): string {
  if (key === "waste_garbage_removal") return "Waste / Garbage Removal";

  const acronyms: Record<string, string> = {
    id: "ID",
    moh: "MoH",
    ocr: "OCR",
    url: "URL",
    ppe: "PPE",
    icno: "ICNO",
  };

  return key
    .split("_")
    .map((word) => acronyms[word.toLowerCase()] || word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Utility to extract structured ICNO audit fields directly from unstructured raw text / raw_text_preview.
 */
function parseIcnoRawText(rawText: string = ""): Record<string, string> {
  if (!rawText || typeof rawText !== "string") {
    return {
      ward_name: "—",
      hand_hygiene: "—",
      ppe_compliance: "—",
      waste_garbage_removal: "—",
      environmental_hygiene: "—",
      icno_additional_note: "—",
    };
  }

  // Next boundary indicating the start of another field or end of line/string
  const generalBoundary =
    "(?=\\s*(?:(?:Ward\\s*(?:name|no|id)?|Date|Time|Hand\\s*Hygiene(?:\\s*Compliance)?|PPE(?:\\s*Compliance)?|Waste(?:\\s*[/\\\\]?\\s*Garbage)?\\s*(?:Removal|Management)?|Environmental\\s*(?:Hygiene|Cleaning)?|(?:ICNO\\s*)?(?:Additional\\s*)?Notes?|Remarks?|Comments?)\\s*[:=-]|[\\r\\n]|$))";

  const noteBoundary =
    "(?=\\s*(?:(?:Ward\\s*(?:name|no|id)?|Date|Time|Hand\\s*Hygiene(?:\\s*Compliance)?|PPE(?:\\s*Compliance)?|Waste(?:\\s*[/\\\\]?\\s*Garbage)?\\s*(?:Removal|Management)?|Environmental\\s*(?:Hygiene|Cleaning)?)\\s*[:=-]|$))";

  const extract = (patterns: string[], isNote = false): string => {
    const boundary = isNote ? noteBoundary : generalBoundary;
    for (const pattern of patterns) {
      const flags = isNote ? "is" : "i";
      const regex = new RegExp(`(?:${pattern})\\s*[:=-]?\\s*(.+?)${boundary}`, flags);
      const match = rawText.match(regex);
      if (match && match[1]) {
        const cleaned = match[1]
          .trim()
          .replace(/^[:=-]+\s*/, "")
          .replace(/[,;]+$/, "")
          .trim();
        if (
          cleaned &&
          cleaned !== "—" &&
          cleaned !== "-" &&
          cleaned.toLowerCase() !== "null" &&
          cleaned.toLowerCase() !== "undefined" &&
          cleaned.toLowerCase() !== "n/a"
        ) {
          return cleaned;
        }
      }
    }
    return "—";
  };

  return {
    ward_name: extract([
      "Ward\\s*name",
      "Ward\\s*no(?:\\.|mber)?",
      "Ward\\s*id",
      "Ward",
    ]),
    hand_hygiene: extract([
      "Hand\\s*Hygiene(?:\\s*Compliance)?",
      "Hand\\s*Hygiene",
    ]),
    ppe_compliance: extract([
      "PPE(?:\\s*Compliance)?",
    ]),
    waste_garbage_removal: extract([
      "Waste\\s*[/\\\\]?\\s*Garbage\\s*Removal",
      "Waste\\s*[/\\\\]?\\s*Garbage",
      "Waste\\s*Removal",
      "Garbage\\s*Removal",
      "Waste\\s*Management",
      "Waste",
    ]),
    environmental_hygiene: extract([
      "Environmental\\s*Hygiene",
      "Environment\\s*Hygiene",
      "Environmental\\s*Cleaning",
      "Environmental",
    ]),
    icno_additional_note: extract([
      "(?:ICNO\\s*)?(?:Additional\\s*)?Notes?",
      "Remarks?",
      "Comments?",
    ], true),
  };
}

/**
 * Dynamically calculate a 0-100 score based on extracted text.
 * - Percentage check: extracts number if percentage is present (e.g., "95%" -> 95).
 * - Positive keywords: "Good", "Satisfactory", "Clean", "Excellent", "Yes" -> 100.
 * - Negative keywords: "Poor", "Bad", "Unsatisfactory", "Dirty", "No" -> 0.
 * - Fallback: 50.
 */
export function calculateScoreFromString(text: string = ""): number {
  if (!text || typeof text !== "string") {
    return 50;
  }

  const trimmed = text.trim();

  // 1. Percentage check (e.g., "95%", "95.5%", "100%")
  const percentMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch && percentMatch[1]) {
    const num = parseFloat(percentMatch[1]);
    if (!isNaN(num)) {
      return Math.min(100, Math.max(0, Math.round(num)));
    }
  }

  // Plain number check (e.g., "85")
  const plainNumMatch = trimmed.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (plainNumMatch && plainNumMatch[1]) {
    const num = parseFloat(plainNumMatch[1]);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      return Math.round(num);
    }
  }

  // 2. Positive keywords -> 100
  if (/\b(?:good|satisfactory|clean|excellent|yes)\b/i.test(trimmed)) {
    return 100;
  }

  // 3. Negative keywords -> 0
  if (/\b(?:poor|bad|unsatisfactory|dirty|no)\b/i.test(trimmed)) {
    return 0;
  }

  // 4. Fallback -> 50
  return 50;
}

const ICNO_FIELDS = [
  { key: "ward_name", label: "Ward name", type: "input" },
  { key: "hand_hygiene", label: "Hand Hygiene", type: "input" },
  { key: "ppe_compliance", label: "PPE Compliance", type: "input" },
  { key: "waste_garbage_removal", label: "Waste / Garbage Removal", type: "input" },
  { key: "environmental_hygiene", label: "Environmental Hygiene", type: "input" },
  { key: "icno_additional_note", label: "ICNO Additional Note", type: "textarea" },
] as const;

export function OCRScan() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState("");
  const [base64, setBase64] = useState("");
  const [formType, setFormType] = useState("moh_notification");
  const [ocr, setOcr] = useState<OcrResponse | null>(null);
  const [fieldsText, setFieldsText] = useState("{}");
  const [commitTarget, setCommitTarget] = useState("moh_notifications");
  const [processing, setProcessing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("");
  const { showToast } = useToast();

  const confidenceSummary = useMemo(() => {
    if (!ocr) return null;
    const high = ocr.tokens.filter((token) => token.confidence >= 0.8).length;
    const medium = ocr.tokens.filter((token) => token.confidence >= 0.55 && token.confidence < 0.8).length;
    const low = ocr.tokens.filter((token) => token.confidence < 0.55 || token.needs_review).length;
    return { high, medium, low };
  }, [ocr]);

  const parsedFields = useMemo(() => {
    try {
      return JSON.parse(fieldsText || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  }, [fieldsText]);

  // Derived card values parsed directly from raw_text_preview with fallback to parsedFields
  const parsedCards = useMemo(() => {
    const rawPreview =
      typeof parsedFields.raw_text_preview === "string"
        ? parsedFields.raw_text_preview
        : typeof ocr?.raw_text === "string"
        ? ocr.raw_text
        : "";

    const parsedFromText = parseIcnoRawText(rawPreview);

    const getFieldValue = (key: string): string => {
      const existing = parsedFields[key];
      if (existing !== undefined && existing !== null) {
        const strVal = String(existing).trim();
        if (
          strVal &&
          strVal !== "—" &&
          strVal !== "-" &&
          strVal.toLowerCase() !== "null" &&
          strVal.toLowerCase() !== "undefined" &&
          strVal.toLowerCase() !== "n/a"
        ) {
          return strVal;
        }
      }
      return parsedFromText[key] || "—";
    };

    return {
      ward_name: getFieldValue("ward_name"),
      hand_hygiene: getFieldValue("hand_hygiene"),
      ppe_compliance: getFieldValue("ppe_compliance"),
      waste_garbage_removal: getFieldValue("waste_garbage_removal"),
      environmental_hygiene: getFieldValue("environmental_hygiene"),
      icno_additional_note: getFieldValue("icno_additional_note"),
    };
  }, [parsedFields, ocr?.raw_text]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setBase64(await fileToBase64(file));
    setOcr(null);
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast({ type: "error", title: "Camera unavailable", message: "This browser does not expose MediaDevices camera capture." });
      return;
    }
    try {
      setCameraStatus("Waiting for camera permission and video frames...");
      setVideoReady(false);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setCameraActive(true);
      setCameraStatus("Camera started. If the preview stays black, check browser/site camera permission or try the file picker.");
    } catch (err) {
      setCameraStatus("");
      showToast({ type: "error", title: "Camera permission failed", message: err instanceof Error ? err.message : "Could not open camera." });
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
    setVideoReady(false);
    setCameraStatus("");
  }

  useEffect(() => {
    if (!cameraActive || !streamRef.current || !videoRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video
      .play()
      .then(() => {
        if (video.videoWidth && video.videoHeight) {
          setVideoReady(true);
          setCameraStatus("Camera preview is ready.");
        }
      })
      .catch((err) => {
        setVideoReady(false);
        setCameraStatus(err instanceof Error ? err.message : "The browser could not play the camera preview.");
      });
  }, [cameraActive]);

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (!video.videoWidth || !video.videoHeight) {
      showToast({ type: "error", title: "Camera frame not ready", message: "The browser has not delivered a visible video frame yet. Try again or use the file picker." });
      setCameraStatus("No visible video frame received yet. Try Stop, Start live camera again, or use Open camera/file picker.");
      return;
    }
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPreview(dataUrl);
    setBase64(dataUrl.split(",")[1] || "");
    setOcr(null);
    stopCamera();
  }

  useEffect(() => stopCamera, []);

  async function process() {
    if (!base64) return;
    setProcessing(true);
    try {
      const result = await scanDocument(base64, formType);
      if (result.extracted_fields && typeof result.extracted_fields.raw_text_preview === "string") {
        result.extracted_fields.raw_text_preview = result.extracted_fields.raw_text_preview.replace(/\s+/g, " ").trim();
      }
      if (result.extracted_fields) {
        const raw = String(result.extracted_fields.raw_text_preview || result.raw_text || "");
        const parsed = parseIcnoRawText(raw);
        for (const [k, v] of Object.entries(parsed)) {
          if (v && v !== "—" && (!result.extracted_fields[k] || result.extracted_fields[k] === "—")) {
            result.extracted_fields[k] = v;
          }
        }
      }
      setOcr(result);
      setFieldsText(JSON.stringify(result.extracted_fields || {}, null, 2));
      showToast({ type: "success", title: "OCR complete", message: `${result.low_confidence_count || 0} low-confidence token(s) need review.` });
    } catch (err) {
      showToast({ type: "error", title: "OCR failed", message: apiErrorMessage(err) });
    } finally {
      setProcessing(false);
    }
  }

  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    if (!ocr) return;
    setSubmitting(true);
    try {
      let corrected = JSON.parse(fieldsText || "{}");

      const icnoKeys = [
        "ward_name",
        "hand_hygiene",
        "ppe_compliance",
        "waste_garbage_removal",
        "environmental_hygiene",
        "icno_additional_note",
      ];
      const filtered: Record<string, unknown> = {};
      for (const key of icnoKeys) {
        const fallback = parsedCards[key as keyof typeof parsedCards];
        filtered[key] = corrected[key] || (fallback !== "—" ? fallback : "");
      }
      if (corrected.raw_text_preview) {
        filtered.raw_text_preview = corrected.raw_text_preview;
      }

      // Dynamically calculate 0-100 scores based on the extracted text for each field
      filtered.hand_hygiene_score = calculateScoreFromString(String(filtered.hand_hygiene || ""));
      filtered.ppe_score = calculateScoreFromString(String(filtered.ppe_compliance || ""));
      filtered.waste_segregation_score = calculateScoreFromString(String(filtered.waste_garbage_removal || ""));
      filtered.environmental_score = calculateScoreFromString(String(filtered.environmental_hygiene || ""));

      // Also map ICNO additional note to remarks for audit record compatibility
      if (filtered.icno_additional_note && !filtered.remarks) {
        filtered.remarks = filtered.icno_additional_note;
      }

      corrected = filtered;

      await confirmOcr(ocr.scan_id, corrected, commitTarget);
      showToast({
        type: "success",
        title: "OCR Record Saved & Committed",
        message: `Successfully saved and committed record to ${commitTarget.replace("_", " ")}.`,
      });
      setOcr((prev) => (prev ? { ...prev, status: "committed" } : null));
    } catch (err) {
      showToast({
        type: "error",
        title: "Could not confirm OCR",
        message: err instanceof SyntaxError ? "Corrected fields must be valid JSON format." : apiErrorMessage(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  function updateField(key: string, value: string) {
    try {
      const current = JSON.parse(fieldsText || "{}");
      const next = { ...current, [key]: value };
      setFieldsText(JSON.stringify(next, null, 2));
    } catch {
      setFieldsText(JSON.stringify({ [key]: value }, null, 2));
    }
  }

  /** Update a token's text in the OCR state so the confidence display and commit payload stay in sync. */
  const updateTokenText = useCallback(
    (tokenIndex: number, newText: string) => {
      setOcr((prev) => {
        if (!prev) return prev;
        const updatedTokens = prev.tokens.map((t, i) =>
          i === tokenIndex ? { ...t, text: newText } : t,
        );
        return { ...prev, tokens: updatedTokens };
      });
    },
    [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Scan Document</h1>
        <p className="mt-1 text-sm text-slate-600">Capture handwritten MoH, hand hygiene, or ward inspection forms and correct low-confidence fields before commit.</p>
      </div>

      <Card>
        <CardHeader title="Camera Capture" description="Uses the browser camera on supported mobile/PWA devices." />
        <CardBody className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            {cameraActive ? (
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="min-h-80 max-h-[520px] w-full rounded-md bg-slate-950 object-contain"
                  onLoadedMetadata={() => {
                    setVideoReady(true);
                    setCameraStatus("Camera preview is ready.");
                  }}
                  onLoadedData={() => {
                    setVideoReady(true);
                    setCameraStatus("Camera preview is ready.");
                  }}
                  onPlaying={() => {
                    setVideoReady(true);
                    setCameraStatus("Camera preview is ready.");
                  }}
                  onError={() => {
                    setVideoReady(false);
                    setCameraStatus("The browser could not render the camera stream. Use the file picker or reset site camera permission.");
                  }}
                />
                {!videoReady ? (
                  <div className="absolute inset-0 grid place-items-center rounded-md bg-slate-950/80 p-6 text-center text-white">
                    <div>
                      <AlertCircle className="mx-auto mb-3" size={32} />
                      <p className="font-semibold">Waiting for a visible camera frame</p>
                      <p className="mt-2 text-sm text-slate-200">{cameraStatus || "Allow camera permission, then wait a moment."}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : preview ? (
              <div className="relative">
                <img src={preview} alt="Captured document preview" className="max-h-[520px] w-full rounded-md object-contain" />
                {processing ? (
                  <div className="absolute inset-0 grid place-items-center rounded-md bg-slate-950/70 backdrop-blur-sm">
                    <div className="text-center text-white">
                      <Loader2 className="mx-auto mb-3 animate-spin" size={40} />
                      <p className="font-semibold">Scanning document…</p>
                      <p className="mt-1 text-sm text-slate-300">Running OpenCV preprocessing &amp; EasyOCR extraction</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid min-h-80 place-items-center text-center text-slate-500"><ScanLine size={44} /><span className="mt-3 block">No document captured yet.</span></div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Form type</span>
              <select className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={formType} onChange={(event) => setFormType(event.target.value)}>
                <option value="moh_notification">MoH notification</option>
                <option value="hand_hygiene_audit">Hand hygiene audit</option>
                <option value="ward_inspection">Ward inspection</option>
                <option value="general">General</option>
              </select>
            </label>
            <input ref={inputRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={onFile} />
            {!cameraActive ? (
              <Button className="w-full" type="button" icon={<Video size={18} />} onClick={startCamera}>
                Start live camera
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" icon={<Camera size={18} />} onClick={captureFrame}>Capture</Button>
                <Button type="button" variant="secondary" icon={<X size={18} />} onClick={stopCamera}>Stop</Button>
              </div>
            )}
            <Button className="w-full" type="button" icon={<Camera size={18} />} onClick={() => inputRef.current?.click()}>
              Open camera/file picker
            </Button>
            {cameraStatus ? <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">{cameraStatus}</p> : null}
            <Button className="w-full" type="button" variant="secondary" disabled={!base64 || processing} onClick={process}>
              {processing ? (<><Loader2 className="animate-spin" size={16} /> Processing…</>) : "Process OCR"}
            </Button>
            {!base64 && !ocr ? <p className="rounded-md bg-amber-50 p-2.5 text-center text-xs text-amber-700">Capture or upload a document image first to enable OCR processing.</p> : null}
            {ocr ? (
              <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3">
                <StatusBadge status={ocr.status} />
                <p className="mt-2 text-sm text-indigo-800">{ocr.low_confidence_count} token(s) require manual review.</p>
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {ocr ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Extracted Text Confidence" description="Color is paired with confidence labels so it is not the only signal." />
            <CardBody>
              <div className="mb-4 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">High {confidenceSummary?.high}</span>
                <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-900">Uncertain yellow {confidenceSummary?.medium}</span>
                <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">Low {confidenceSummary?.low}</span>
              </div>
              <div className="clinical-scrollbar max-h-96 overflow-auto rounded-md border border-slate-200 p-3 leading-8">
                {ocr.tokens.map((token, index) => {
                  const tone = token.confidence >= 0.8 ? "bg-emerald-50 text-emerald-800" : token.confidence >= 0.55 ? "bg-yellow-100 text-yellow-950 ring-1 ring-yellow-300" : "bg-red-50 text-red-800";
                  return <span key={`${token.text}-${index}`} className={`mr-1 rounded px-1.5 py-1 text-sm ${tone}`}>{token.text}</span>;
                })}
              </div>
              <div className="mt-4 rounded-md border border-yellow-300 bg-yellow-50 p-3">
                <p className="text-sm font-semibold text-yellow-950">Confidence-Based Review Queue</p>
                <div className="mt-2 grid gap-2">
                  {ocr.tokens
                    .map((token, originalIndex) => ({ token, originalIndex }))
                    .filter(({ token }) => token.confidence < 0.8 || token.needs_review)
                    .slice(0, 12)
                    .map(({ token, originalIndex }) => (
                    <label key={`${originalIndex}-review`} className="grid gap-1 text-sm sm:grid-cols-[1fr_120px] sm:items-center">
                      <input
                        className="min-h-11 rounded-md border border-yellow-300 px-3"
                        value={token.text}
                        onChange={(e) => updateTokenText(originalIndex, e.target.value)}
                      />
                      <span className="font-semibold text-yellow-900">{Math.round(token.confidence * 100)}% confidence</span>
                    </label>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Corrected Fields" description="Review and correct before confirming the pending OCR record." />
            <CardBody>
              <label className="mb-4 block">
                <span className="text-sm font-semibold text-slate-700">Save corrected data to</span>
                <select className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={commitTarget} onChange={(event) => setCommitTarget(event.target.value)}>
                  <option value="moh_notifications">MoH notification record</option>
                  <option value="lab_results">Lab result record</option>
                  <option value="audits">Ward audit record</option>
                </select>
              </label>
              <div className="mb-4 grid gap-3">
                {ICNO_FIELDS.map(({ key, label, type }) => {
                  const currentValue =
                    parsedFields[key] !== undefined && parsedFields[key] !== null && String(parsedFields[key]) !== ""
                      ? String(parsedFields[key])
                      : parsedCards[key as keyof typeof parsedCards] !== "—"
                      ? parsedCards[key as keyof typeof parsedCards]
                      : "";

                  return (
                    <label key={key} className="block">
                      <span className="text-sm font-semibold text-slate-700">{label}</span>
                      {type === "textarea" ? (
                        <textarea
                          rows={3}
                          className="mt-1 w-full rounded-md border border-slate-300 p-3 text-sm leading-relaxed"
                          value={currentValue}
                          onChange={(event) => updateField(key, event.target.value)}
                          placeholder={`Enter ${label.toLowerCase()}…`}
                        />
                      ) : (
                        <input
                          className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3"
                          value={currentValue}
                          onChange={(event) => updateField(key, event.target.value)}
                          placeholder={`Enter ${label.toLowerCase()}…`}
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              {/* Clean Human-Readable Payload Summary Preview */}
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Payload Summary Preview</h4>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {ICNO_FIELDS.map(({ key, label }) => (
                    <div key={key} className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-xs">
                      <span className="block text-xs font-semibold text-slate-500">{label}</span>
                      <span className="mt-1 block text-sm font-bold text-slate-900">
                        {parsedCards[key as keyof typeof parsedCards] || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <Button
                className="mt-4 w-full"
                disabled={submitting || ocr?.status === "committed"}
                icon={submitting ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                onClick={confirm}
              >
                {submitting
                  ? "Saving to database…"
                  : ocr?.status === "committed"
                  ? "Record Committed"
                  : "Confirm corrected record"}
              </Button>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
