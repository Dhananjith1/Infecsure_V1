import { api } from "./client";
import type { AlertItem } from "../types";

export async function listAlerts(status?: string, config?: { timeout?: number; limit?: number }) {
  const { limit, ...axiosConfig } = config || {};
  const { data } = await api.get<AlertItem[]>("/alerts/", {
    ...axiosConfig,
    params: {
      ...(status ? { alert_status: status } : {}),
      ...(limit ? { limit } : {})
    }
  });
  return data;
}

export async function listPendingAlerts() {
  const { data } = await api.get<AlertItem[]>("/alerts/pending");
  return data;
}

export async function getAlert(alertId: string) {
  const { data } = await api.get<AlertItem>(`/alerts/${alertId}`);
  return data;
}

export async function approveAlert(alertId: string, notes?: string) {
  const { data } = await api.post(`/alerts/validate/${alertId}`, { icno_notes: notes || "" });
  return data;
}

export async function rejectAlert(alertId: string, notes?: string) {
  const { data } = await api.post(`/alerts/reject/${alertId}`, { icno_notes: notes || "" });
  return data;
}

export async function dispatchMoh(alertId: string, toEmail: string) {
  const { data } = await api.post(`/alerts/dispatch/${alertId}`, null, { params: { to_email: toEmail } });
  return data;
}

export async function getRootCauseInsights() {
  const { data } = await api.get("/alerts/analytics/root-cause", {
    params: { max_rules: 10 }
  });
  return data;
}

export async function dashboardSummary() {
  const { data } = await api.get("/alerts/analytics/dashboard");
  return data;
}

export async function sendDoctorInstructions(alertId: string, managementInstructions: string, acknowledgementNotes?: string) {
  const { data } = await api.post(`/alerts/${alertId}/instructions`, {
    acknowledgement_notes: acknowledgementNotes || "",
    management_instructions: managementInstructions,
    follow_up_required: true
  });
  return data;
}

export async function doctorAcknowledge(alertId: string, managementInstructions: string, acknowledgementNotes?: string) {
  const { data } = await api.post(`/alerts/${alertId}/doctor-acknowledge`, {
    acknowledgement_notes: acknowledgementNotes || "",
    management_instructions: managementInstructions,
    follow_up_required: true
  });
  return data;
}

export async function doctorSignoff(alertId: string, managementInstructions: string, acknowledgementNotes?: string) {
  const { data } = await api.post(`/alerts/${alertId}/acknowledge`, {
    acknowledgement_notes: acknowledgementNotes || "",
    management_instructions: managementInstructions,
    follow_up_required: true
  });
  return data;
}

export async function listManagementInstructions(alertId?: string) {
  const { data } = await api.get("/alerts/management-instructions", {
    params: alertId ? { alert_id: alertId } : undefined
  });
  return data;
}
