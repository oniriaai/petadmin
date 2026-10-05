import type { NextFunction, Request, Response } from "express";

import { prisma } from "../db";
import {
  AuthzError,
  BUSINESS_UNITS,
  getBusinessUnitScope,
  handleAuthzError,
} from "../middleware/auth";
import type { BusinessUnit } from "../middleware/auth";
import type { PermissionId } from "../core/tenancy/permissions";
import type { BackendModule, PermissionRule } from "./module";
import { productModuleForBackendId } from "./product-modules";

/**
 * Per-daycare entitlements: which product modules a tenant has bought, and therefore which
 * backend modules its users may reach.
 *
 * This is the read side of what the platform console writes. It sits on the hot path of every
 * authenticated request, so it is memoised in process with a short TTL; the console calls
 * `invalidate(daycareId)` after a toggle so a change is visible immediately in the instance
 * that made it, and within `CACHE_TTL_MS` everywhere else.
 */

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  expiresAt: number;
  /** Product module ids that are enabled for the daycare. Core modules are not stored here. */
  enabled: Set<string>;
}

const cache = new Map<string, CacheEntry>();
/** De-duplicates concurrent misses so a burst of requests issues one query, not one each. */
const inFlight = new Map<string, Promise<Set<string>>>();

async function loadEnabledProductModules(daycareId: string): Promise<Set<string>> {
  const rows = await prisma.daycareModule.findMany({
    where: { daycareId, isEnabled: true },
    select: { moduleId: true },
  });
  return new Set(rows.map((row) => row.moduleId));
}

/**
 * The product modules enabled for a daycare. Excludes core modules, which are always available
 * and are handled by `isBackendModuleEnabled` rather than being written into every tenant's row
 * set.
 */
export async function getEnabledProductModules(daycareId: string): Promise<Set<string>> {
  const now = Date.now();
  const cached = cache.get(daycareId);
  if (cached && cached.expiresAt > now) return cached.enabled;

  const pending = inFlight.get(daycareId);
  if (pending) return pending;

  const load = loadEnabledProductModules(daycareId)
    .then((enabled) => {
      cache.set(daycareId, { enabled, expiresAt: Date.now() + CACHE_TTL_MS });
      return enabled;
    })
    .finally(() => {
      inFlight.delete(daycareId);
    });

  inFlight.set(daycareId, load);
  return load;
}

/**
 * Whether a daycare may reach a given backend module.
 *
 * An unclaimed backend module returns `false` rather than `true`: `validateBackendModules()`
 * already refuses to boot in that state, so reaching here means something is wrong, and the
 * safe answer to "is this sold?" is no.
 */
export async function isBackendModuleEnabled(
  daycareId: string,
  backendModuleId: string,
): Promise<boolean> {
  const productModule = productModuleForBackendId(backendModuleId);
  if (!productModule) return false;
  if (productModule.core) return true;
  if (productModule.platformOnly) return false;
  const enabled = await getEnabledProductModules(daycareId);
  return enabled.has(productModule.id);
}

/** Called by the console after writing entitlements for a daycare. */
export function invalidate(daycareId: string): void {
  cache.delete(daycareId);
  inFlight.delete(daycareId);
}

export function invalidateAll(): void {
  cache.clear();
  inFlight.clear();
}

/**
 * The gate mounted by `registerBackendModules()` in front of every non-public module.
 *
 * Order matters: the superadmin bypass comes before the role check, because the platform role
 * is deliberately absent from every module's `access.roles` (those list tenant roles) and would
 * otherwise be locked out of the product it administers.
 */
/**
 * Whether a module serves at least one of the units the caller is working in.
 *
 * A module that lists every unit constrains nothing. Exported as a pure function so the
 * architecture suite can assert the rule without a database behind it.
 */
export function moduleServesUnits(module: BackendModule, scope: readonly BusinessUnit[]): boolean {
  const allowedUnits = module.access?.businessUnits;
  if (!allowedUnits || allowedUnits.length >= BUSINESS_UNITS.length) return true;
  return scope.some((unit) => allowedUnits.includes(unit));
}

function ruleMatches(rule: PermissionRule, method: string, path: string): boolean {
  const verb = method.toUpperCase();
  const isRead = verb === "GET" || verb === "HEAD" || verb === "OPTIONS";
  if (rule.methods === "read" && !isRead) return false;
  if (rule.methods === "write" && isRead) return false;
  if (rule.methods === "delete" && verb !== "DELETE") return false;

  if (rule.path === undefined) return true;
  if (typeof rule.path !== "string") return rule.path.test(path);
  return path === rule.path || path.startsWith(`${rule.path}/`);
}

/**
 * The permissions a request to a module needs. `path` is the path inside the module, which is
 * what Express hands a middleware mounted at the module's base path.
 *
 * Exported as a pure function so the architecture suite can assert the rules without a server.
 */
export function requiredPermissions(
  module: BackendModule,
  method: string,
  path: string,
): PermissionId[] {
  const needed = new Set<PermissionId>();
  for (const rule of module.permissions ?? []) {
    if (ruleMatches(rule, method, path)) needed.add(rule.permission);
  }
  return [...needed];
}

export function requireModuleAccess(module: BackendModule) {
  const productModule = productModuleForBackendId(module.id);
  const isCore = productModule?.core === true;
  const allowedRoles = module.access?.roles;
  const allowedUnits = module.access?.businessUnits;
  const constrainsUnits = allowedUnits !== undefined && allowedUnits.length < BUSINESS_UNITS.length;

  return async function moduleAccessGate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ message: "No autorizado" });
        return;
      }

      if (user.role === "superadmin") {
        next();
        return;
      }

      if (allowedRoles && !allowedRoles.includes(user.role)) {
        res.status(403).json({ message: "No tienes permiso para acceder a este módulo" });
        return;
      }

      // The business unit the caller is working in must be one this module serves.
      //
      // For `daycare` and `grooming` this is implied by the role check above and never fires.
      // It exists for an `admin`, who spans both units and narrows with `X-Business-Unit`:
      // asking for daycare occupancy while scoped to Peluquería used to return daycare data and
      // silently ignore the header. Refusing is more honest than answering out of scope.
      if (constrainsUnits) {
        if (!moduleServesUnits(module, getBusinessUnitScope(req))) {
          res.status(403).json({
            message: `Este módulo no pertenece a la unidad de negocio seleccionada`,
            code: "WRONG_BUSINESS_UNIT",
            businessUnits: allowedUnits,
          });
          return;
        }
      }

      // Permissions come last, so that a module the tenant has not bought is still reported as
      // MODULE_DISABLED: "ask your admin for access" is the wrong answer to "this was not sold".
      // An admin holds every permission, so this only ever refuses the operational roles.
      const missing =
        user.role === "admin"
          ? undefined
          : requiredPermissions(module, req.method, req.path).find(
              (permission) => !user.permissions?.includes(permission),
            );
      const refusePermission = (): void => {
        res.status(403).json({
          message: "No tienes permiso para realizar esta acción",
          code: "PERMISSION_DENIED",
          permission: missing,
        });
      };

      if (isCore) {
        if (missing) {
          refusePermission();
          return;
        }
        next();
        return;
      }

      if (!user.daycareId) {
        // requireAuth guarantees this for tenant roles; restated so a future change to the
        // token shape fails closed instead of skipping the entitlement check.
        res.status(403).json({ message: "Sesión inconsistente" });
        return;
      }

      if (!(await isBackendModuleEnabled(user.daycareId, module.id))) {
        res.status(403).json({
          message: "Módulo no habilitado para esta guardería",
          code: "MODULE_DISABLED",
          module: productModule?.id ?? module.id,
        });
        return;
      }

      if (missing) {
        refusePermission();
        return;
      }

      next();
    } catch (error) {
      // getBusinessUnitScope rejects a malformed header with a 400; that belongs to the caller,
      // not in the 500 handler.
      if (error instanceof AuthzError && handleAuthzError(res, error)) return;
      next(error);
    }
  };
}
