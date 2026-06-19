import { api } from "./client";
import type { LabResult } from "../types";

export type LabResultPayload = {
  ward_id: string;
  pathogen_id: string;
  pathogen_name: string;
  specimen_type: string;
  result_date: string;
  test_result?: "positive" | "negative";
  colony_count?: number;
  resistance_profile?: string[];
  antibiotic_sensitivity?: Record<string, string>;
  patient_ward_location?: string;
  notes?: string;
};

export type LabSlipOCRResponse = {
  raw_text: string;
  extracted_fields: Partial<LabResultPayload> & {
    test_result?: "positive" | "negative";
  };
  tokens: Array<Record<string, unknown>>;
  low_confidence_count: number;
  engine: "google_vision" | "easyocr" | string;
};

export async function createLabResult(payload: LabResultPayload) {
  const { data } = await api.post("/lab-results/", payload);
  return data;
}

export async function listLabResults(wardId?: string) {
  const { data } = await api.get<LabResult[]>("/lab-results/", { params: wardId ? { ward_id: wardId } : undefined });
  return data;
}

export async function scanLabSlip(imageBase64: string) {
  const { data } = await api.post<LabSlipOCRResponse>("/lab-results/scan-slip", { image_base64: imageBase64 });
  return data;
}

export async function getLabResult(resultId: string) {
  const { data } = await api.get<LabResult>(`/lab-results/${resultId}`);
  return data;
}
