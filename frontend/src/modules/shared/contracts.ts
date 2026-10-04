export type BusinessUnit = "DAYCARE" | "GROOMING";
/** `superadmin` is the vendor role: it has no daycare and no tenant user can hold it. */
export type UserRole = "superadmin" | "admin" | "daycare" | "grooming";
/** The roles a daycare user can actually have, used for per-route role checks. */
export type TenantRole = Exclude<UserRole, "superadmin">;

export const BUSINESS_UNITS: readonly BusinessUnit[] = ["DAYCARE", "GROOMING"];
export const USER_ROLES: readonly UserRole[] = ["superadmin", "admin", "daycare", "grooming"];

/**
 * The Spanish name for each unit slot.
 *
 * `DAYCARE`/`GROOMING` are internal slot ids; the interface is Spanish and never shows them. The
 * platform console was printing the raw values beside roles it *had* translated, so this lives
 * here rather than in one screen. `GLOBAL` is the stored unit of a role that spans both.
 */
export const BUSINESS_UNIT_LABELS: Record<string, string> = {
  DAYCARE: "Guardería",
  GROOMING: "Peluquería",
  GLOBAL: "Ambas unidades",
};

export function businessUnitLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return BUSINESS_UNIT_LABELS[value] ?? value;
}

/**
 * Product module ids, mirroring `backend/src/platform/product-modules.ts`.
 *
 * These are the ids `GET /auth/me` returns in `enabledModules` and the ones routes and nav
 * items declare in `requires`. The two lists are separate code bases and can drift, so
 * `validateFrontendModules()` rejects a `requires` value that is not in this catalog, and the
 * backend refuses to boot if a backend module is not claimed by a product module.
 */
export const PRODUCT_MODULE_IDS = [
  "nucleo",
  "reservas",
  "guarderia",
  "peluqueria",
  "finanzas",
  "inventario",
  "informes",
  "cumplimiento",
] as const;
export type ProductModuleId = (typeof PRODUCT_MODULE_IDS)[number];

export function isProductModuleId(value: string): value is ProductModuleId {
  return (PRODUCT_MODULE_IDS as readonly string[]).includes(value);
}

/**
 * Transitional aliases for the pre-rename Kinderdog/Pethijos identifiers. A browser can be
 * holding these in localStorage from a session that predates the rename, so both normalizers
 * accept them on input. Neither is ever emitted. Safe to delete once no old session remains.
 */
const LEGACY_BUSINESS_UNITS: Record<string, BusinessUnit> = {
  KINDERDOG: "DAYCARE",
  PETHIJOS: "GROOMING",
};
const LEGACY_ROLES: Record<string, UserRole> = { kinderdog: "daycare", pethijos: "grooming" };

export function normalizeBusinessUnit(value: unknown): BusinessUnit | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toUpperCase();
  if ((BUSINESS_UNITS as readonly string[]).includes(candidate)) return candidate as BusinessUnit;
  return LEGACY_BUSINESS_UNITS[candidate] ?? null;
}

export function normalizeUserRole(value: unknown): UserRole | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  if ((USER_ROLES as readonly string[]).includes(candidate)) return candidate as UserRole;
  return LEGACY_ROLES[candidate] ?? null;
}

export interface ClientSummary {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  whatsapp?: string | null;
}

export interface PetSummary {
  id: string;
  name: string;
  species: string;
  breed?: string | null;
  photoUrl?: string | null;
}

export interface ClientWithPets extends ClientSummary {
  pets: PetSummary[];
}
