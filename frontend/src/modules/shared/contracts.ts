export type BusinessUnit = "DAYCARE" | "GROOMING" | "VETERINARY";
/** `superadmin` is the vendor role: it has no daycare and no tenant user can hold it. */
export type UserRole = "superadmin" | "admin" | "daycare" | "grooming" | "veterinary";
/** The roles a daycare user can actually have, used for per-route role checks. */
export type TenantRole = Exclude<UserRole, "superadmin">;

export const BUSINESS_UNITS: readonly BusinessUnit[] = ["DAYCARE", "GROOMING", "VETERINARY"];
export const USER_ROLES: readonly UserRole[] = [
  "superadmin",
  "admin",
  "daycare",
  "grooming",
  "veterinary",
];

/**
 * The Spanish name for each unit slot.
 *
 * `DAYCARE`/`GROOMING`/`VETERINARY` are internal slot ids; the interface is Spanish and never shows them. The
 * platform console was printing the raw values beside roles it *had* translated, so this lives
 * here rather than in one screen. `GLOBAL` is the stored unit of a role that spans all of them.
 */
export const BUSINESS_UNIT_LABELS: Record<string, string> = {
  DAYCARE: "Guardería",
  GROOMING: "Peluquería",
  VETERINARY: "Veterinaria",
  GLOBAL: "Todas las unidades",
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
  "veterinaria",
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
 * Permission ids, mirroring `backend/src/core/tenancy/permissions.ts`.
 *
 * A product module says what the daycare bought; a permission says what one member of its staff
 * may do inside it. `GET /auth/me` returns the ones the session holds (all of them for an
 * admin), and routes and nav items declare the ones they need in `permissions`.
 */
export const PERMISSION_IDS = [
  "finanzas.read",
  "finanzas.write",
  "inventario.read",
  "inventario.write",
  "datos.export",
  "registros.delete",
] as const;
export type PermissionId = (typeof PERMISSION_IDS)[number];

export function isPermissionId(value: string): value is PermissionId {
  return (PERMISSION_IDS as readonly string[]).includes(value);
}

export interface PermissionInfo {
  id: PermissionId;
  label: string;
  description: string;
  /** Granted along with this one: managing something includes seeing it. */
  implies?: PermissionId;
}

export const PERMISSIONS: readonly PermissionInfo[] = [
  {
    id: "finanzas.read",
    label: "Ver finanzas",
    description: "Consultar cobros, cuentas por pagar, proveedores e informes financieros.",
  },
  {
    id: "finanzas.write",
    label: "Gestionar finanzas",
    description: "Registrar, editar y eliminar cobros, cuentas por pagar, pagos y proveedores.",
    implies: "finanzas.read",
  },
  {
    id: "inventario.read",
    label: "Ver inventario",
    description: "Consultar artículos, niveles de stock y movimientos.",
  },
  {
    id: "inventario.write",
    label: "Gestionar inventario",
    description: "Crear, editar y eliminar artículos y registrar movimientos de stock.",
    implies: "inventario.read",
  },
  {
    id: "datos.export",
    label: "Exportar datos",
    description: "Descargar listados en Excel. Los financieros requieren además ver finanzas.",
  },
  {
    id: "registros.delete",
    label: "Eliminar registros",
    description:
      "Eliminar o dar de baja tutores, mascotas, reservas, planes, salas, contratos, citas y consultas.",
  },
];

/** What a new staff account starts with, mirroring `DEFAULT_STAFF_PERMISSIONS` in the backend. */
export const DEFAULT_STAFF_PERMISSIONS: readonly PermissionId[] = ["inventario.read"];

/**
 * Ticks or unticks one permission, keeping the list coherent: granting "gestionar" grants its
 * "ver", and withdrawing a "ver" withdraws the "gestionar" that depends on it. The server
 * applies the first rule again on save; doing it here keeps the checklist from lying meanwhile.
 */
export function togglePermission(
  current: readonly PermissionId[],
  id: PermissionId,
  granted: boolean,
): PermissionId[] {
  const next = new Set(current);
  if (granted) {
    next.add(id);
    const implied = PERMISSIONS.find((permission) => permission.id === id)?.implies;
    if (implied) next.add(implied);
  } else {
    next.delete(id);
    for (const permission of PERMISSIONS) {
      if (permission.implies === id) next.delete(permission.id);
    }
  }
  return PERMISSION_IDS.filter((permission) => next.has(permission));
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
