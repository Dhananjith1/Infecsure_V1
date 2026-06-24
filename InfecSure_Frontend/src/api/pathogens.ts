import { api } from "./client";

export type PathogenPayload = {
  name: string;
  category: string;
  risk_level: "low" | "moderate" | "high" | "critical";
  clinical_risk_class?: number;
  description?: string;
  typical_source?: string;
};

export type Pathogen = PathogenPayload & {
  pathogen_id: string;
  created_at?: string;
};

export async function listPathogens() {
  const { data } = await api.get<Pathogen[]>("/pathogens/");
  return data;
}

export async function createPathogen(payload: PathogenPayload) {
  const { data } = await api.post("/pathogens/", payload);
  return data;
}

export async function createLabPathogen(payload: PathogenPayload) {
  const { data } = await api.post("/lab/pathogens", payload);
  return data;
}

export async function getPathogen(pathogenId: string) {
  const { data } = await api.get<Pathogen>(`/pathogens/${pathogenId}`);
  return data;
}

export async function updatePathogen(pathogenId: string, payload: PathogenPayload) {
  const { data } = await api.put(`/pathogens/${pathogenId}`, payload);
  return data;
}

export async function deletePathogen(pathogenId: string) {
  const { data } = await api.delete(`/pathogens/${pathogenId}`);
  return data;
}

export async function getPathogenStats(pathogenId: string) {
  const { data } = await api.get(`/pathogens/${pathogenId}/stats`);
  return data;
}

export async function getPositiveCultureVolume(wardId: string, pathogenId?: string) {
  const { data } = await api.get("/lab/volume/48h", {
    params: { ward_id: wardId, pathogen_id: pathogenId || undefined }
  });
  return data;
}
