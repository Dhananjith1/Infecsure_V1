import { api } from "./client";

export async function rootHealth() {
  const { data } = await api.get("/");
  return data;
}

export async function detailedHealth() {
  const { data } = await api.get("/health");
  return data;
}
