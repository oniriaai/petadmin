import React, { createContext, useContext, useState, useEffect } from "react";
import { api, setUnauthorizedHandler } from "./api";

export type BusinessUnit = "KINDERDOG" | "PETHIJOS";
export type UserRole = "admin" | "kinderdog" | "pethijos";

interface User {
  id: string;
  username: string;
  name: string;
  businessUnit: BusinessUnit | "GLOBAL";
  role: UserRole;
}

interface AuthCtx {
  user: User | null;
  login: (businessUnit: BusinessUnit | null, username: string, password: string) => Promise<void>;
  logout: () => void;
  clearSession: () => void;
  isLoading: boolean;
  activeBusinessUnit: BusinessUnit | null;
  setActiveBusinessUnit: (value: BusinessUnit | null) => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [activeBusinessUnit, setActiveBusinessUnitState] = useState<BusinessUnit | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function setActiveBusinessUnit(value: BusinessUnit | null) {
    setActiveBusinessUnitState(value);
    if (value) localStorage.setItem("activeBusinessUnit", value);
    else localStorage.removeItem("activeBusinessUnit");
  }

  function clearSession() {
    localStorage.clear();
    setUser(null);
    setActiveBusinessUnitState(null);
  }

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (stored && token) {
      try {
        const parsedUser = JSON.parse(stored) as User;
        setUser(parsedUser);
        const scopedBu = localStorage.getItem("activeBusinessUnit");
        if (scopedBu === "KINDERDOG" || scopedBu === "PETHIJOS") {
          setActiveBusinessUnitState(scopedBu);
        } else if (parsedUser.role !== "admin" && (parsedUser.businessUnit === "KINDERDOG" || parsedUser.businessUnit === "PETHIJOS")) {
          setActiveBusinessUnitState(parsedUser.businessUnit);
        }
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

  async function login(businessUnit: BusinessUnit | null, username: string, password: string) {
    const payload = businessUnit ? { businessUnit, username, password } : { username, password };
    const data = await api.post<{ token: string; user: User }>("/auth/login", payload);
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    if (data.user.role === "admin") {
      setActiveBusinessUnit(businessUnit);
    } else if (data.user.businessUnit === "KINDERDOG" || data.user.businessUnit === "PETHIJOS") {
      setActiveBusinessUnit(data.user.businessUnit);
    } else {
      setActiveBusinessUnit(null);
    }
  }

  function logout() {
    clearSession();
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, clearSession, isLoading, activeBusinessUnit, setActiveBusinessUnit }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
