import { api } from "./api";
import type {
  PermissionId,
  ProductModuleId,
  SubscriptionSummary,
} from "../modules/shared/contracts";

/**
 * Typed client for the vendor console (`/platform`).
 *
 * Kept out of `lib/api.ts` so it is only pulled in by the lazily loaded console bundle — a
 * daycare user never downloads a description of this API surface.
 */

export interface PlatformOverview {
  daycareCount: number;
  activeDaycareCount: number;
  userCount: number;
  activeUserCount: number;
  enabledModuleCount: number;
}

export interface DaycareSummary {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  timezone: string;
  units: string;
  unitList: string[];
  isActive: boolean;
  createdAt: string;
  userCount: number;
  enabledModuleCount: number;
  enabledModules: string[];
}

export interface PlatformUser {
  id: string;
  username: string;
  name: string;
  role: string;
  businessUnit: string;
  isActive: boolean;
  permissions: PermissionId[];
  createdAt?: string;
}

export interface Entitlement {
  moduleId: ProductModuleId;
  label: string;
  description: string;
  isEnabled: boolean;
  requires: string[];
  updatedAt: string | null;
}

export interface AuditEntry {
  id: string;
  actorUsername: string;
  action: string;
  daycareId: string | null;
  targetType: string | null;
  targetId: string | null;
  detail: unknown;
  createdAt: string;
}

export interface DaycareDetail extends Omit<
  DaycareSummary,
  "userCount" | "enabledModuleCount" | "enabledModules"
> {
  users: PlatformUser[];
  entitlements: Entitlement[];
  audit: AuditEntry[];
}

export interface ModuleCatalog {
  modules: Array<{
    id: ProductModuleId;
    label: string;
    description: string;
    requires: string[];
    backendModuleIds: string[];
  }>;
  core: Array<{ id: string; label: string; description: string; backendModuleIds: string[] }>;
  units: string[];
  roles: string[];
}

export interface CreateDaycarePayload {
  slug: string;
  name: string;
  legalName?: string;
  timezone?: string;
  units: string[];
  modules?: string[];
  admin: { username: string; password: string; name: string };
}

export const platformApi = {
  overview: () => api.get<PlatformOverview>("/platform/overview"),
  catalog: () => api.get<ModuleCatalog>("/platform/modules"),
  listDaycares: () => api.get<DaycareSummary[]>("/platform/daycares"),
  getDaycare: (id: string) => api.get<DaycareDetail>(`/platform/daycares/${id}`),
  createDaycare: (payload: CreateDaycarePayload) =>
    api.post<{ daycare: DaycareSummary; admin: PlatformUser }>("/platform/daycares", payload),
  updateDaycare: (
    id: string,
    payload: Partial<Pick<DaycareSummary, "name" | "legalName" | "timezone" | "isActive">> & {
      units?: string[];
    },
  ) => api.patch<DaycareSummary>(`/platform/daycares/${id}`, payload),
  setModules: (id: string, modules: Array<{ moduleId: string; isEnabled: boolean }>) =>
    api.put<Entitlement[]>(`/platform/daycares/${id}/modules`, { modules }),
  provisionUser: (
    id: string,
    payload: {
      username: string;
      password: string;
      name: string;
      role: string;
      permissions?: PermissionId[];
    },
  ) => api.post<PlatformUser>(`/platform/daycares/${id}/users`, payload),
  updateUser: (
    id: string,
    userId: string,
    payload: {
      name?: string;
      role?: string;
      password?: string;
      isActive?: boolean;
      permissions?: PermissionId[];
    },
  ) => api.patch<PlatformUser>(`/platform/daycares/${id}/users/${userId}`, payload),
  /** Null for a daycare created from the console: nothing bills it. */
  getSubscription: (id: string) =>
    api.get<{ subscription: PlatformSubscription | null }>(`/billing/tenants/${id}`),
  audit: (limit = 50) => api.get<AuditEntry[]>(`/platform/audit?limit=${limit}`),
};

/** A self-service daycare's subscription, as the vendor sees it. */
export interface PlatformSubscription extends SubscriptionSummary {
  priceCents: number;
  founderNumber: number | null;
  founderUntil: string | null;
  billingEmail: string;
  failedAttempts: number;
}
