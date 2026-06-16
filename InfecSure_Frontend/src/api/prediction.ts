import { api } from "./client";

export type PredictionPayload = {
  hand_hygiene_score: number;
  ppe_score: number;
  waste_segregation_score: number;
  environmental_score: number;
  recent_lab_count: number;
  anomaly_count: number;
  max_virulence: number;
  days_since_last_audit: number;
};

export async function predictAiEngine(wardId: string, payload: PredictionPayload) {
  const { data } = await api.post(`/ai-engine/${wardId}/predict`, payload);
  return data;
}

export async function getAiMetrics() {
  const { data } = await api.get("/ai-engine/metrics");
  return data;
}
