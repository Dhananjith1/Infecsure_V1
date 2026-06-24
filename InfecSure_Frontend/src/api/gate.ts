import { api } from "./client";

export async function listGatePending() {
  const { data } = await api.get("/gate/pending");
  return data;
}

export async function validateGateItem(alertId: string, decision: "approve" | "reject", notes?: string) {
  const { data } = await api.post("/gate/validate", {
    alert_id: alertId,
    decision,
    icno_notes: notes || ""
  });
  return data;
}
