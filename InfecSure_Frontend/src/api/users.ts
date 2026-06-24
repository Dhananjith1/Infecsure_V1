import { api } from "./client";
import type { UserProfile, UserRole } from "../types";

export type CreateUserPayload = {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
};

export type UpdateUserPayload = {
  full_name?: string;
  is_active?: boolean;
  role?: UserRole;
};

export async function listUsers() {
  const { data } = await api.get<UserProfile[]>("/users/");
  return data;
}

export async function createUser(payload: CreateUserPayload) {
  const { data } = await api.post("/users/", payload);
  return data;
}

export async function getUser(uid: string) {
  const { data } = await api.get<UserProfile>(`/users/${uid}`);
  return data;
}

export async function updateUser(uid: string, payload: UpdateUserPayload) {
  const { data } = await api.put(`/users/${uid}`, payload);
  return data;
}

export async function deactivateUser(uid: string) {
  const { data } = await api.delete(`/users/${uid}`);
  return data;
}
