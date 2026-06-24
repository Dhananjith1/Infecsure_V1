import { api } from "./client";
import type { Notice } from "../types";

export async function listNotices() {
  const { data } = await api.get<Notice[]>("/notices/");
  return data;
}

export async function createNotice(payload: { title: string; body: string; is_pinned?: boolean; expires_at?: string | null }) {
  const { data } = await api.post("/notices/", payload);
  return data;
}

export async function deleteNotice(noticeId: string) {
  const { data } = await api.delete(`/notices/${noticeId}`);
  return data;
}
