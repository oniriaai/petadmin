import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import {
  api,
  ApiError,
  getPinnedDaycareId,
  setPinnedDaycareId as persistPinnedDaycareId,
  setModuleDisabledHandler,
  setUnauthorizedHandler,
} from "./api";
import { normalizeBusinessUnit, normalizeUserRole } from "../modules/shared/contracts";
import type { BusinessUnit, ProductModuleId, UserRole } from "../modules/shared/contracts";
export type { BusinessUnit, ProductModuleId, UserRole } from "../modules/shared/contracts";

interface User {
  id: string;
  username: string;
  name: string;
  businessUnit: BusinessUnit | "GLOBAL";
  role: UserRole;
  daycareId?: string | null;
}

export interface Daycare {
  id: string;
  slug: string;
  name: string;
  legalName?: string | null;
  timezone: string;
  units: string;
  unitList: string[];
  isActive: boolean;
}

/** The shape of `GET /auth/me`. */
interface SessionResponse {
  user: User;
  daycare: Daycare | null;
  enabledModules: string[];
  units: string[];
  fullAccess: boolean;
}

interface AuthCtx {
  user: User | null;
  daycare: Daycare | null;
  /** Product modules this session may reach. Empty until the session has been fetched. */
  enabledModules: ProductModuleId[];
  units: BusinessUnit[];
  /** True for a superadmin: the backend gate does not restrict it, whatever enabledModules says. */
  fullAccess: boolean;
  hasModule: (id: ProductModuleId | undefined) => boolean;
  hasModules: (ids: readonly ProductModuleId[] | undefined) => boolean;
  login: (
    businessUnit: BusinessUnit | null,
    username: string,
    password: string,
    /** The daycare slug. Only needed when the username exists in more than one daycare. */
    daycare?: string,
  ) => Promise<User>;
  logout: () => void;
  clearSession: () => void;
  refreshSession: () => Promise<void>;
  isLoading: boolean;
  /** True while the first /auth/me of this session is still in flight. */
  isSessionLoading: boolean;
  activeBusinessUnit: BusinessUnit | null;
  setActiveBusinessUnit: (value: BusinessUnit | null) => void;
  pinnedDaycareId: string | null;
  setPinnedDaycare: (daycareId: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

/** Maps a persisted session onto the current unions, tolerating pre-rename values. */
function normalizeStoredUser(raw: unknown): User | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const role = normalizeUserRole(candidate.role);
  if (!role) return null;
  const unit = normalizeBusinessUnit(candidate.businessUnit);
  return {
    id: String(candidate.id ?? ""),
    username: String(candidate.username ?? ""),
    name: String(candidate.name ?? ""),
    businessUnit: unit ?? "GLOBAL",
    role,
    daycareId: candidate.daycareId == null ? null : String(candidate.daycareId),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [daycare, setDaycare] = useState<Daycare | null>(null);
  const [enabledModules, setEnabledModules] = useState<ProductModuleId[]>([]);
  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [fullAccess, setFullAccess] = useState(false);
  const [activeBusinessUnit, setActiveBusinessUnitState] = useState<BusinessUnit | null>(null);
  const [pinnedDaycareId, setPinnedDaycareIdState] = useState<string | null>(getPinnedDaycareId());
  const [isLoading, setIsLoading] = useState(true);
  const [isSessionLoading, setIsSessionLoading] = useState(false);

  // `clearSession` is referenced by effects that must not re-run when it changes identity.
  const clearSessionRef = useRef<() => void>(() => {});

  function setActiveBusinessUnit(value: BusinessUnit | null) {
    setActiveBusinessUnitState(value);
    if (value) localStorage.setItem("activeBusinessUnit", value);
    else localStorage.removeItem("activeBusinessUnit");
  }

  const clearSession = useCallback(() => {
    // Only the auth keys — localStorage.clear() also wiped unrelated UI preferences.
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("activeBusinessUnit");
    persistPinnedDaycareId(null);
    setUser(null);
    setDaycare(null);
    setEnabledModules([]);
    setUnits([]);
    setFullAccess(false);
    setActiveBusinessUnitState(null);
    setPinnedDaycareIdState(null);
  }, []);
  clearSessionRef.current = clearSession;

  /**
   * Re-reads the session from the server.
   *
   * Entitlements and the tenant are authoritative from `/auth/me`, not from localStorage: a
   * module disabled in the console while someone is logged in has to take effect without a
   * re-login, and the stored copy is only a cache of the last answer.
   */
  const applySession = useCallback((data: SessionResponse) => {
    const normalized = normalizeStoredUser(data.user);
    if (!normalized) throw new Error("El servidor devolvió un rol no reconocido.");
    setUser(normalized);
    localStorage.setItem("user", JSON.stringify(normalized));
    setDaycare(data.daycare);
    setEnabledModules((data.enabledModules ?? []) as ProductModuleId[]);
    setUnits(
      (data.units ?? []).map(normalizeBusinessUnit).filter((u): u is BusinessUnit => u !== null),
    );
    setFullAccess(Boolean(data.fullAccess));
    return normalized;
  }, []);

  const refreshSession = useCallback(async () => {
    if (!localStorage.getItem("token")) return;
    setIsSessionLoading(true);
    try {
      applySession(await api.get<SessionResponse>("/auth/me"));
    } catch (error) {
      // A 401 is already handled by the unauthorized handler. Anything else (the daycare was
      // deactivated, the user was disabled) also means this session is no longer usable.
      if (error instanceof ApiError && error.status !== 401) clearSessionRef.current();
    } finally {
      setIsSessionLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (stored && token) {
      try {
        const parsedUser = normalizeStoredUser(JSON.parse(stored));
        if (!parsedUser) {
          // Session predates the unit/role rename in a way we cannot map — start clean
          // rather than render a user whose role no longer matches any navigation entry.
          clearSession();
          setIsLoading(false);
          return;
        }
        // Render from the cached user immediately, then let /auth/me correct it. Blocking the
        // first paint on a network round trip would make every reload feel like a cold start.
        setUser(parsedUser);
        localStorage.setItem("user", JSON.stringify(parsedUser));

        const scopedBu = normalizeBusinessUnit(localStorage.getItem("activeBusinessUnit"));
        if (scopedBu) {
          setActiveBusinessUnit(scopedBu);
        } else if (parsedUser.role !== "admin" && parsedUser.role !== "superadmin") {
          const ownUnit = normalizeBusinessUnit(parsedUser.businessUnit);
          if (ownUnit) setActiveBusinessUnit(ownUnit);
          else localStorage.removeItem("activeBusinessUnit");
        } else {
          localStorage.removeItem("activeBusinessUnit");
        }

        void refreshSession();
      } catch {
        clearSession();
      }
    } else if (stored || token) {
      clearSession();
    }
    setIsLoading(false);
    // Intentionally runs once: this is session rehydration, not a subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSessionRef.current();
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    });
    // A module turned off mid-session: re-read the session so navigation and guards catch up
    // instead of leaving a route on screen that now 403s.
    setModuleDisabledHandler(() => {
      void refreshSession();
    });
    return () => {
      setUnauthorizedHandler(null);
      setModuleDisabledHandler(null);
    };
  }, [refreshSession]);

  /** Returns the signed-in user so the caller can route by role without waiting for a re-render. */
  async function login(
    businessUnit: BusinessUnit | null,
    username: string,
    password: string,
    daycare?: string,
  ): Promise<User> {
    const payload = {
      username,
      password,
      ...(businessUnit ? { businessUnit } : {}),
      // Usernames are unique per daycare, so one that exists in several needs the slug to
      // disambiguate. Omitted when empty: for the common unique username the server resolves
      // it on its own and nobody has to know their daycare's identifier.
      ...(daycare ? { daycare } : {}),
    };
    const data = await api.post<{ token: string; user: User }>("/auth/login", payload);
    const normalized = normalizeStoredUser(data.user);
    if (!normalized) throw new Error("El servidor devolvió un rol no reconocido.");
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(normalized));
    // A previous superadmin session could have left a pin behind; it must not carry into a
    // different login.
    persistPinnedDaycareId(null);
    setPinnedDaycareIdState(null);
    setUser(normalized);

    if (normalized.role === "admin") {
      setActiveBusinessUnit(businessUnit);
    } else if (normalized.role === "superadmin") {
      setActiveBusinessUnit(null);
    } else {
      setActiveBusinessUnit(normalizeBusinessUnit(normalized.businessUnit));
    }

    await refreshSession();
    return normalized;
  }

  function logout() {
    clearSession();
  }

  /** Pins (or releases) the tenant a superadmin operates inside, then re-reads the session. */
  const setPinnedDaycare = useCallback(
    async (daycareId: string | null) => {
      persistPinnedDaycareId(daycareId);
      setPinnedDaycareIdState(daycareId);
      // Leaving a tenant also drops any unit filter picked up inside it.
      if (!daycareId) setActiveBusinessUnit(null);
      await refreshSession();
    },
    [refreshSession],
  );

  const hasModule = useCallback(
    (id: ProductModuleId | undefined) => (id ? enabledModules.includes(id) : true),
    [enabledModules],
  );

  const hasModules = useCallback(
    (ids: readonly ProductModuleId[] | undefined) =>
      !ids || ids.every((id) => enabledModules.includes(id)),
    [enabledModules],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        daycare,
        enabledModules,
        units,
        fullAccess,
        hasModule,
        hasModules,
        login,
        logout,
        clearSession,
        refreshSession,
        isLoading,
        isSessionLoading,
        activeBusinessUnit,
        setActiveBusinessUnit,
        pinnedDaycareId,
        setPinnedDaycare,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
