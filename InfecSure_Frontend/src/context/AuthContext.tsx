import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { login as loginRequest, me, refresh as refreshRequest } from "../api/auth";
import { REFRESH_KEY, TOKEN_KEY, USER_KEY } from "../api/client";
import type { UserProfile, UserRole } from "../types";

const SESSION_MS = 15 * 60 * 1000;

type AuthContextValue = {
  user: UserProfile | null;
  token: string | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  loading: boolean;
  expiresAt: number | null;
  secondsRemaining: number;
  login: (email: string, password: string) => Promise<UserRole>;
  logout: () => void;
  stayLoggedIn: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function storedUser() {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<UserProfile | null>(() => storedUser());
  const [expiresAt, setExpiresAt] = useState<number | null>(() => (sessionStorage.getItem(TOKEN_KEY) ? Date.now() + SESSION_MS : null));
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [loading, setLoading] = useState(Boolean(sessionStorage.getItem(TOKEN_KEY)));

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setExpiresAt(null);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener("infecsure:unauthorized", onUnauthorized);
    return () => window.removeEventListener("infecsure:unauthorized", onUnauthorized);
  }, [logout]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let active = true;
    me()
      .then((profile) => {
        if (!active) return;
        const normalized = { ...profile, uid: profile.uid || user?.uid || "", role: (profile.role || user?.role) as UserRole };
        setUser(normalized);
        sessionStorage.setItem(USER_KEY, JSON.stringify(normalized));
      })
      .catch((error) => {
        if (!active) return;
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          logout();
          return;
        }
        if (user) {
          setUser(user);
          sessionStorage.setItem(USER_KEY, JSON.stringify(user));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [logout, token]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!expiresAt) {
        setSecondsRemaining(0);
        return;
      }
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0) logout();
    }, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await loginRequest(email, password);
    sessionStorage.setItem(TOKEN_KEY, response.access_token);
    sessionStorage.setItem(REFRESH_KEY, response.refresh_token);
    const profile: UserProfile = {
      uid: response.uid,
      email,
      role: response.role
    };
    sessionStorage.setItem(USER_KEY, JSON.stringify(profile));
    setToken(response.access_token);
    setUser(profile);
    setExpiresAt(Date.now() + SESSION_MS);
    return response.role;
  }, []);

  const stayLoggedIn = useCallback(async () => {
    const refreshToken = sessionStorage.getItem(REFRESH_KEY);
    if (!refreshToken) {
      logout();
      return;
    }
    const response = await refreshRequest(refreshToken);
    sessionStorage.setItem(TOKEN_KEY, response.access_token);
    sessionStorage.setItem(REFRESH_KEY, response.refresh_token);
    setToken(response.access_token);
    setExpiresAt(Date.now() + SESSION_MS);
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      role: user?.role ?? null,
      isAuthenticated: Boolean(token && user),
      loading,
      expiresAt,
      secondsRemaining,
      login,
      logout,
      stayLoggedIn
    }),
    [expiresAt, loading, login, logout, secondsRemaining, stayLoggedIn, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
