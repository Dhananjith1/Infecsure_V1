import { api } from "./client";

export type CompliancePayload = {
  item_name: string;
  compliant: boolean;
  notes?: string;
};

export type AuditPayload = {
  ward_id: string;
  hand_hygiene_score: number;
  hand_hygiene_items: CompliancePayload[];
  ppe_score: number;
  ppe_items: CompliancePayload[];
  waste_segregation_score: number;
  waste_segregation_items: CompliancePayload[];
  environmental_score: number;
  environmental_items: CompliancePayload[];
  remarks?: string;
  is_offline_sync?: boolean;
};

export async function createAudit(payload: AuditPayload) {
  const { data } = await api.post("/audits/", payload);
  return data;
}

export async function syncAudits(records: unknown[]) {
  const { data } = await api.post("/audits/sync", { records });
  return data;
}

export async function getPriorityList() {
  const { data } = await api.get("/audits/priority-list");
  return Array.isArray(data) ? data : data?.priorities ?? [];
}

export async function listAudits() {
  const { data } = await api.get("/audits/");
  return data;
}

export async function getAudit(auditId: string) {
  const { data } = await api.get(`/audits/${auditId}`);
  return data;
}
