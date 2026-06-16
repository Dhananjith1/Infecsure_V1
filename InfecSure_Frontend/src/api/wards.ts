import { api } from "./client";
import type { HeatmapWard, LabResult } from "../types";

export type WardPayload = {
  name: string;
  ward_type?: string;
  bed_count: number;
  floor?: string;
  description?: string;
};

export async function listWards() {
  const { data } = await api.get<HeatmapWard[]>("/wards/");
  return data;
}

export async function createWard(payload: WardPayload) {
  const { data } = await api.post("/wards/", payload);
  return data;
}

export async function getWard(wardId: string) {
  const { data } = await api.get<HeatmapWard>(`/wards/${wardId}`);
  return data;
}

export async function updateWard(wardId: string, payload: WardPayload) {
  const { data } = await api.put(`/wards/${wardId}`, payload);
  return data;
}

export async function deleteWard(wardId: string) {
  const { data } = await api.delete(`/wards/${wardId}`);
  return data;
}

export async function predictWard(wardId: string) {
  const { data } = await api.post(`/wards/${wardId}/predict`);
  return data;
}

export async function getWardAudits(wardId: string) {
  const { data } = await api.get(`/wards/${wardId}/audits`);
  return data;
}

export async function getWardLabResults(wardId: string) {
  const { data } = await api.get<LabResult[]>(`/wards/${wardId}/lab-results`);
  return data;
}
