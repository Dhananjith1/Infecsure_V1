import { api } from "./client";

export type ReportFormat = "pdf" | "excel";

export async function listReports() {
  const { data } = await api.get("/reports/");
  return data;
}

export async function generateExecutiveReport(format: ReportFormat) {
  const { data } = await api.post("/reports/executive", {
    report_type: "executive_summary",
    format
  });
  return data;
}

export async function generateDengueReport(alertId: string) {
  const { data } = await api.post("/reports/dengue", null, { params: { alert_id: alertId } });
  return data;
}

export function reportDownloadUrl(downloadUrl: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
  return `${base}${downloadUrl}`;
}

export async function downloadReport(downloadUrl: string, filename = "infecsure-report") {
  const { data, headers } = await api.get<Blob>(downloadUrl, { responseType: "blob" });
  const disposition = String(headers["content-disposition"] || "");
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const resolvedFilename = match?.[1] || filename;
  const objectUrl = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = resolvedFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
