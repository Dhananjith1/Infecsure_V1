import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, ScanLine, Video, X } from "lucide-react";
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
      setOcr(result);
      setFieldsText(JSON.stringify(result.extracted_fields || {}, null, 2));
      showToast({ type: "success", title: "OCR complete", message: `${result.low_confidence_count || 0} low-confidence token(s) need review.` });
    } catch (err) {
      showToast({ type: "error", title: "OCR failed", message: apiErrorMessage(err) });
    } finally {
      setProcessing(false);
    }
  }

  async function confirm() {
    if (!ocr) return;
    try {
      const corrected = JSON.parse(fieldsText || "{}");
      await confirmOcr(ocr.scan_id, corrected, commitTarget);
      showToast({ type: "success", title: "OCR record saved", message: `Corrected data committed to ${commitTarget.replace("_", " ")}.` });
    } catch (err) {
      showToast({ type: "error", title: "Could not confirm OCR", message: err instanceof SyntaxError ? "Corrected fields must be valid JSON." : apiErrorMessage(err) });
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
              <img src={preview} alt="Captured document preview" className="max-h-[520px] w-full rounded-md object-contain" />
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
              {processing ? "Processing..." : "Process OCR"}
            </Button>
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
                  {ocr.tokens.filter((token) => token.confidence < 0.8 || token.needs_review).slice(0, 12).map((token, index) => (
                    <label key={`${token.text}-review-${index}`} className="grid gap-1 text-sm sm:grid-cols-[1fr_120px] sm:items-center">
                      <input className="min-h-11 rounded-md border border-yellow-300 px-3" defaultValue={token.text} />
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
                {Object.entries(parsedFields).map(([key, value]) => (
                  <label key={key} className="block">
                    <span className="text-sm font-semibold text-slate-700">{key}</span>
                    <input className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={String(value ?? "")} onChange={(event) => updateField(key, event.target.value)} />
                  </label>
                ))}
              </div>
              <textarea className="min-h-52 w-full rounded-md border border-slate-300 p-3 font-mono text-sm" value={fieldsText} onChange={(event) => setFieldsText(event.target.value)} />
              <Button className="mt-4" icon={<CheckCircle2 size={18} />} onClick={confirm}>Confirm corrected record</Button>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
