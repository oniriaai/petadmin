import { Request } from "express";
import { AuthzError, assertBusinessUnitAccess, getBusinessUnitScope } from "../../middleware/auth";

/**
 * Tenant scoping. Every query that reads or writes tenant-owned data must derive its
 * `daycareId` from here rather than from the request body, so a caller cannot choose
 * which tenant it operates on.
 *
 * A daycare user is pinned to its own daycare. A superadmin (the vendor) has full access:
 * it may pin one tenant with the `X-Daycare-Id` header, and without the header its reads
 * span every tenant. Writes always require an explicit pin — writing to "all tenants" is
 * meaningless and silently doing it to the wrong one is the failure mode worth preventing.
 */

export const DAYCARE_HEADER = "x-daycare-id";

export type DaycareScope = { mode: "single"; daycareId: string } | { mode: "all" };

function readPinnedDaycareId(req: Request): string | undefined {
  const raw = req.headers[DAYCARE_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function resolveDaycareScope(req: Request): DaycareScope {
  if (!req.user) throw new AuthzError(401, "No autorizado");

  if (req.user.role === "superadmin") {
    const pinned = readPinnedDaycareId(req);
    return pinned ? { mode: "single", daycareId: pinned } : { mode: "all" };
  }

  const own = req.user.daycareId;
  if (!own) throw new AuthzError(403, "Usuario sin guardería asignada");

  // A tenant user may send the header (the client sets it generically), but only for itself.
  const pinned = readPinnedDaycareId(req);
  if (pinned && pinned !== own) {
    throw new AuthzError(403, "No tienes acceso a esa guardería");
  }
  return { mode: "single", daycareId: own };
}

/**
 * The tenant fragment for a Prisma `where`. Empty for a superadmin spanning all tenants,
 * which is what makes cross-tenant console reads work without special-casing each query.
 */
export function buildDaycareWhere(req: Request, field = "daycareId"): Record<string, unknown> {
  const scope = resolveDaycareScope(req);
  return scope.mode === "single" ? { [field]: scope.daycareId } : {};
}

/**
 * The combined tenant + business-unit fragment. This is the replacement for
 * `buildBusinessUnitWhere` and what most routers should use.
 */
export function buildScopeWhere(
  req: Request,
  businessUnitField = "businessUnit",
): Record<string, unknown> {
  const units = getBusinessUnitScope(req);
  const unitWhere =
    units.length === 1 ? { [businessUnitField]: units[0] } : { [businessUnitField]: { in: units } };
  return { ...buildDaycareWhere(req), ...unitWhere };
}

/**
 * The daycare a write belongs to. A superadmin must pin one explicitly.
 */
export function getRequiredDaycareId(req: Request): string {
  const scope = resolveDaycareScope(req);
  if (scope.mode === "all") {
    throw new AuthzError(400, "Selecciona una guardería (X-Daycare-Id) para esta operación");
  }
  return scope.daycareId;
}

/** Post-fetch ownership check, mirroring `assertBusinessUnitAccess`. */
export function assertDaycareAccess(req: Request, daycareId: string): void {
  const scope = resolveDaycareScope(req);
  if (scope.mode === "all") return;
  if (scope.daycareId !== daycareId) {
    throw new AuthzError(404, "Registro no encontrado");
  }
}

/**
 * Tenant filter for a model that has no `daycareId` of its own and inherits tenancy through a
 * parent relation (PetVaccination/PetDocument -> pet, ReservationPet -> reservation,
 * Payment -> payable, InventoryMovement -> item).
 */
export function buildChildScopeWhere(req: Request, relation: string): Record<string, unknown> {
  const scope = resolveDaycareScope(req);
  if (scope.mode === "all") return {};
  return { [relation]: { daycareId: scope.daycareId } };
}

/**
 * Ownership check for a record fetched by id. Verifies BOTH the tenant and the business unit.
 *
 * Checking the unit alone was sufficient when there was one tenant; it is not now — two
 * daycares both have a DAYCARE unit, so a unit-only check would let one read the other's
 * records by id. Prefer filtering in the query (`findFirst` with `buildScopeWhere`) where
 * practical; use this where the record is already in hand.
 */
export function assertRecordAccess(
  req: Request,
  record: { daycareId: string; businessUnit: string },
): void {
  assertDaycareAccess(req, record.daycareId);
  assertBusinessUnitAccess(req, record.businessUnit);
}
