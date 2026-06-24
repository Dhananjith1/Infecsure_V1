import axios from "axios";

export const TOKEN_KEY = "infecsure.access_token";
export const REFRESH_KEY = "infecsure.refresh_token";
export const USER_KEY = "infecsure.user";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000",
  timeout: 60000
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(REFRESH_KEY);
      sessionStorage.removeItem(USER_KEY);
      window.dispatchEvent(new CustomEvent("infecsure:unauthorized"));
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export function apiErrorMessage(error: unknown, fallback = "Request failed. Please try again.") {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => item.msg ?? String(item)).join(", ");
    if (error.message) return error.message;
  }
  return fallback;
}
