import { api } from "./client";
import type { LabResult } from "../types";

export type LabResultPayload = {
  ward_id: string;
  pathogen_id: string;
  pathogen_name: string;
  specimen_type: string;
  result_date: string;
  colony_count?: number;
  resistance_profile?: string[];
  antibiotic_sensitivity?: Record<string, string>;
  patient_ward_location?: string;
  notes?: string;
};

export async function createLabResult(payload: LabResultPayload) {
  const { data } = await api.post("/lab-results/", payload);
  return data;
}

export async function listLabResults(wardId?: string) {
  const { data } = await api.get<LabResult[]>("/lab-results/", { params: wardId ? { ward_id: wardId } : undefined });
  return data;
}

export async function getLabResult(resultId: string) {
  const { data } = await api.get<LabResult>(`/lab-results/${resultId}`);
  return data;
}
