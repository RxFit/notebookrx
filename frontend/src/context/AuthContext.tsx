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

  // Rehydrate on mount
  useEffect(() => {
    const stored = authStorage.getToken();
    if (stored) {
      AuthService.me()
        .then((u) => { setToken(stored); setUser(u); })
        .catch(() => authStorage.clear())
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }

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
