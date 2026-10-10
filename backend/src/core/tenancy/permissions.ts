import type { Request } from "express";

import type { UserRole } from "../../middleware/auth";

/**
 * The permission catalog: what a staff member may do INSIDE a module its daycare owns.
 *
 * Role, business unit and entitlement decide which modules a user reaches; none of them says
 * whether a receptionist may read the income statement or rewrite stock. That is what a
 * permission answers. The catalog is fixed in code, and each user row carries the list it was
 * granted (`users.permissions`). A tenant `admin` holds every permission implicitly, so there is
 * no way to lock a daycare out of its own administration by unticking a box.
 *
 * Enforcement lives at the registry: a `BackendModule` declares `permissions` rules and
 * `requireModuleAccess` evaluates them. `hasPermission` is for the rare handler that returns a
 * mixed payload and must leave one field out.
 *
 * The frontend mirrors the ids and labels in `frontend/src/modules/shared/contracts.ts`.
 */
export interface Permission {
  id: string;
  /** Spanish label shown to whoever assigns it. */
  label: string;
  description: string;
  /** Permissions granted along with this one: writing something requires reading it. */
  implies?: readonly string[];
}

export const PERMISSIONS = [
  {
    id: "finanzas.read",
    label: "Ver finanzas",
    description: "Consultar cobros, cuentas por pagar, proveedores e informes financieros.",
  },
  {
    id: "finanzas.write",
    label: "Gestionar finanzas",
    description: "Registrar, editar y eliminar cobros, cuentas por pagar, pagos y proveedores.",
    implies: ["finanzas.read"],
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
    implies: ["inventario.read"],
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
      "Eliminar o dar de baja tutores, mascotas, reservas, planes, salas, citas y consultas.",
  },
] as const satisfies readonly Permission[];

export type PermissionId = (typeof PERMISSIONS)[number]["id"];

export const PERMISSION_IDS = PERMISSIONS.map((permission) => permission.id) as [
  PermissionId,
  ...PermissionId[],
];

const byId = new Map<string, Permission>(
  PERMISSIONS.map((permission) => [permission.id, permission]),
);

export function isPermissionId(value: unknown): value is PermissionId {
  return typeof value === "string" && byId.has(value);
}

/**
 * What a newly created non-admin user starts with, and what the migration gave every existing
 * one. Deliberately narrow: money, exports and deletes are granted by an admin, not inherited.
 */
export const DEFAULT_STAFF_PERMISSIONS: readonly PermissionId[] = ["inventario.read"];

/**
 * Cleans a list before it is stored: unknown ids dropped, implied permissions added, catalog
 * order. Unknown ids are dropped rather than rejected because this also reads rows written by
 * an older catalog; request bodies are validated by zod before they get here.
 */
export function normalizePermissions(input: readonly unknown[]): PermissionId[] {
  const granted = new Set<PermissionId>();
  for (const value of input) {
    if (!isPermissionId(value)) continue;
    granted.add(value);
    for (const implied of byId.get(value)?.implies ?? []) {
      if (isPermissionId(implied)) granted.add(implied);
    }
  }
  return PERMISSION_IDS.filter((id) => granted.has(id));
}

/** The permissions a caller actually holds: everything for the two administrative roles. */
export function effectivePermissions(role: UserRole, stored: readonly unknown[]): PermissionId[] {
  if (role === "admin" || role === "superadmin") return [...PERMISSION_IDS];
  return normalizePermissions(stored);
}

export function hasPermission(req: Request, permission: PermissionId): boolean {
  const user = req.user;
  if (!user) return false;
  if (user.role === "superadmin" || user.role === "admin") return true;
  return user.permissions?.includes(permission) ?? false;
}
