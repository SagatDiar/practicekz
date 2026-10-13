import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, post } from "../api/client";
import type { Me } from "../api/types";

interface Ctx {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  register: (data: Record<string, unknown>) => Promise<{ email: string; devCode?: string }>;
  verifyEmail: (email: string, code: string) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export const homePath = (role: Me["role"]) =>
  role === "STUDENT" ? "/student" : role === "COMPANY" ? "/company" : "/university";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: Me }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await post<{ user: Me }>("/auth/login", { email, password });
    setUser(r.user);
    return r.user;
  }, []);

  const register = useCallback(async (data: Record<string, unknown>) => {
    // регистрация вход не выдаёт: сначала нужно подтвердить email кодом из письма
    return post<{ verificationRequired: true; email: string; devCode?: string }>("/auth/register", data);
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const r = await post<{ user: Me }>("/auth/verify-email", { email, code });
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await post("/auth/logout");
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const r = await api<{ user: Me }>("/auth/me");
    setUser(r.user);
  }, []);

  return <AuthCtx.Provider value={{ user, loading, login, register, verifyEmail, logout, refresh }}>{children}</AuthCtx.Provider>;
}
