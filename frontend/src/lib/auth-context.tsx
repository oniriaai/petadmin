import React, { createContext, useContext, useState, useEffect } from "react";
import { api, setUnauthorizedHandler } from "./api";

interface User {
  id: string;
  username: string;
  name: string;
  businessUnit: "KINDERDOG" | "PETHIJOS";
  role: string;
}

interface AuthCtx {
  user: User | null;
  login: (businessUnit: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  clearSession: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function clearSession() {
    localStorage.clear();
    setUser(null);
  }

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (stored && token) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        clearSession();
      }
    } else if (stored || token) {
      clearSession();
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  async function login(businessUnit: string, username: string, password: string) {
    const data = await api.post<{ token: string; user: User }>("/auth/login", { businessUnit, username, password });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    clearSession();
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, clearSession, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
