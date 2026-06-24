import { api } from "./client";
import type { HeatmapWard } from "../types";

export async function getHeatmap() {
  const { data } = await api.get<{ heatmap: HeatmapWard[]; summary?: Record<string, number> }>("/heatmap/");
  return data;
}

export async function getPublicHeatmap() {
  const { data } = await api.get<{ heatmap: HeatmapWard[] }>("/public/heatmap");
  return data;
}

export async function getHeatmapWithFallback() {
  try {
    const data = await getHeatmap();
    if (data.heatmap?.length) return data;
  } catch {
    // Fall through to the validated public feed so the UI does not render empty.
  }
  const fallback = await getPublicHeatmap();
  return { heatmap: fallback.heatmap || [], summary: undefined };
}

export async function refreshHeatmap() {
  const { data } = await api.post("/heatmap/refresh");
  return data;
}
