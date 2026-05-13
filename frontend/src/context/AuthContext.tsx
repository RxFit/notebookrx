"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { AuthUser, TokenResponse } from "@/types";
import { AuthService, authStorage } from "@/lib/api";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyToken = useCallback((res: TokenResponse) => {
    authStorage.setToken(res.access_token);
    setToken(res.access_token);
    setUser({ user_id: res.user_id, email: res.email, display_name: res.display_name });
  }, []);

  const logout = useCallback(() => {
    authStorage.clear();
    setToken(null);
    setUser(null);
  }, []);

  // Rehydrate session from localStorage on page load
  useEffect(() => {
    const stored = authStorage.getToken();
    if (!stored) {
      setIsLoading(false);
      return;
    }

    AuthService.me()
      .then((u) => {
        setToken(stored);
        setUser(u);
      })
      .catch((err: unknown) => {
        // Only destroy the token if the server explicitly rejects it (401/403).
        // Network errors, 502 during deploys, timeouts etc. should NOT log the user out —
        // we keep the token and let them stay logged in optimistically.
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
          authStorage.clear();
        }
        // On any other error: keep token in localStorage so the next page load retries.
        // The user stays logged in optimistically using the stored token.
        if (status !== 401 && status !== 403) {
          setToken(stored);
          // Reconstruct minimal user from the JWT payload (no server round-trip needed)
          try {
            const payload = JSON.parse(atob(stored.split(".")[1]));
            setUser({ user_id: payload.user_id || payload.sub, email: payload.email || "", display_name: payload.display_name || "" });
          } catch {
            // JWT decode failed — token is malformed, clear it
            authStorage.clear();
          }
        }
      })
      .finally(() => setIsLoading(false));

    window.addEventListener("auth:logout", logout);
    return () => window.removeEventListener("auth:logout", logout);
  }, [logout]);

  const login = async (email: string, password: string) => {
    const res = await AuthService.login(email, password);
    applyToken(res);
  };

  const register = async (email: string, password: string, displayName?: string) => {
    const res = await AuthService.register(email, password, displayName);
    applyToken(res);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
