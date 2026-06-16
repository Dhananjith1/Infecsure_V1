import { api } from "./client";
import type { UserProfile, UserRole } from "../types";

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  role: UserRole;
  uid: string;
};

export async function login(email: string, password: string) {
  const { data } = await api.post<LoginResponse>("/auth/login", { email, password });
  return data;
}

export async function refresh(refreshToken: string) {
  const { data } = await api.post<LoginResponse>("/auth/refresh", { refresh_token: refreshToken });
  return data;
}

export async function me() {
  const { data } = await api.get<UserProfile>("/auth/me");
  return data;
}
