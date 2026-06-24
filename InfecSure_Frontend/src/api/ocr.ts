import { api } from "./client";

const OCR_TIMEOUT_MS = 180000;

export async function scanDocument(imageBase64: string, formType: string, referenceId?: string) {
  const { data } = await api.post("/ocr/scan", {
    image_base64: imageBase64,
    form_type: formType,
    reference_id: referenceId || null
  }, { timeout: OCR_TIMEOUT_MS });
  return data;
}

export async function confirmOcr(scanId: string, correctedFields: Record<string, unknown>, target?: string) {
  const { data } = await api.post("/ocr/confirm", {
    scan_id: scanId,
    corrected_fields: correctedFields,
    commit_to_collection: target || null
  });
  return data;
}

export async function listOcrQueue() {
  const { data } = await api.get("/ocr/queue");
  return data;
}

export async function listLowConfidenceOcr() {
  const { data } = await api.get("/ocr/pending");
  return data;
}

export async function getOcrRecord(scanId: string) {
  const { data } = await api.get(`/ocr/${scanId}`);
  return data;
}

export async function processDocument(imageBase64: string, formType: string, referenceId?: string) {
  const { data } = await api.post("/ocr/process", {
    image_base64: imageBase64,
    form_type: formType,
    reference_id: referenceId || null
  }, { timeout: OCR_TIMEOUT_MS });
  return data;
}

export async function uploadDocument(file: File, formType: string, referenceId?: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("form_type", formType);
  if (referenceId) form.append("reference_id", referenceId);
  const { data } = await api.post("/ocr/upload", form, { timeout: OCR_TIMEOUT_MS });
  return data;
}
