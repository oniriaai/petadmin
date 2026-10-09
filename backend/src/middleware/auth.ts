import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { effectivePermissions } from "../core/tenancy/permissions";
import type { PermissionId } from "../core/tenancy/permissions";
import { getPrincipalStatus } from "../core/tenancy/principal";

export const BUSINESS_UNITS = ["DAYCARE", "GROOMING", "VETERINARY"] as const;
export type BusinessUnit = (typeof BUSINESS_UNITS)[number];
/**
 * `superadmin` is the platform (vendor) role. It is not a tenant role: a superadmin has no
 * daycare, and a tenant user can never hold it. The database enforces that invariant with the
 * `users_superadmin_untenanted` CHECK constraint.
 */
export type UserRole = "superadmin" | "admin" | "daycare" | "grooming" | "veterinary";

/** Roles the console and daycare-side user management may assign. Never includes superadmin. */
export const ASSIGNABLE_TENANT_ROLES = ["admin", "daycare", "grooming", "veterinary"] as const;
export type AssignableTenantRole = (typeof ASSIGNABLE_TENANT_ROLES)[number];

/**
 * Token version. Tokens issued before tenancy lack `daycareId`, and letting one through would
 * surface as a 500 deep inside a router instead of a clean 401. Bumping this invalidates them
 * without rotating JWT_SECRET.
 */
export const TOKEN_VERSION = 2;

/**
 * The signing and verification secret, read once.
 *
 * It used to be `process.env.JWT_SECRET ?? "change_me"` in two places -- here and in the login
 * route -- so a deployment that forgot to set it ran with a publicly known secret and forgeable
 * superadmin tokens. `assertSecureConfig()` in main.ts refuses to boot in that state outside
 * development; this constant makes sure there is only one place the value can come from.
 */
export const JWT_SECRET = process.env.JWT_SECRET ?? "change_me";
export const SESSION_COOKIE = "argos_session";

export function requestsCookieSession(req: Request): boolean {
  return req.headers["x-session-mode"] === "cookie";
}

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 12 * 60 * 60 * 1000,
  path: "/",
};

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: SESSION_COOKIE_OPTIONS.secure,
    path: "/",
  });
}

function readCookie(raw: string | undefined, name: string): string | undefined {
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Transitional aliases for the pre-rename Kinderdog/Pethijos identifiers. Accepted on input
 * (un-migrated rows, JWTs issued before the rename, stale localStorage in the browser) but
 * never emitted. Safe to delete once no old token or session can still be in flight.
 */
const LEGACY_BUSINESS_UNITS: Record<string, BusinessUnit> = {
  KINDERDOG: "DAYCARE",
  PETHIJOS: "GROOMING",
};

const LEGACY_ROLES: Record<string, UserRole> = {
  kinderdog: "daycare",
  pethijos: "grooming",
};

/**
 * Signs a session for a user. The one place a token is minted, shared by the login route and by
 * the signup that ends with its new admin already signed in.
 */
export function issueSessionToken(user: {
  id: string;
  username: string;
  businessUnit: string;
  role: UserRole;
  daycareId: string | null;
  sessionEpoch: number;
}): string {
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    businessUnit: user.businessUnit,
    role: user.role,
    daycareId: user.daycareId,
    tv: TOKEN_VERSION,
    se: user.sessionEpoch,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

interface JwtPayload {
  userId: string;
  username: string;
  businessUnit: string;
  role: UserRole;
  /** null only for a superadmin. */
  daycareId: string | null;
  tv: number;
  /** The user's session epoch when the token was issued. Absent on older tokens: read as 0. */
  se?: number;
}

/** The token plus what `requireAuth` re-reads on every request. */
interface AuthenticatedUser extends JwtPayload {
  /** Effective permissions, read live so a grant or a revocation bites on the next request. */
  permissions: readonly PermissionId[];
  /** Read live too: the module gate answers 402 for everything but billing while this holds. */
  subscriptionSuspended?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

function isBusinessUnit(value: string): value is BusinessUnit {
  return BUSINESS_UNITS.includes(value as BusinessUnit);
}

/** Resolves a raw value to a business unit, accepting the legacy brand names. */
export function normalizeBusinessUnit(value: string | undefined | null): BusinessUnit | null {
  if (!value) return null;
  const candidate = value.trim().toUpperCase();
  if (isBusinessUnit(candidate)) return candidate;
  return LEGACY_BUSINESS_UNITS[candidate] ?? null;
}

export function normalizeUserRole(role: string, businessUnit: string): UserRole | null {
  const normalizedRole = role.trim().toLowerCase();
  if (normalizedRole === "superadmin") return "superadmin";
  if (normalizedRole === "admin") return "admin";
  if (normalizedRole === "daycare") return "daycare";
  if (normalizedRole === "grooming") return "grooming";
  if (normalizedRole === "veterinary") return "veterinary";
  const legacyRole = LEGACY_ROLES[normalizedRole];
  if (legacyRole) return legacyRole;
  if (normalizedRole === "owner") {
    if (businessUnit === "GLOBAL") return "admin";
    const unit = normalizeBusinessUnit(businessUnit);
    if (unit === "DAYCARE") return "daycare";
    if (unit === "GROOMING") return "grooming";
    if (unit === "VETERINARY") return "veterinary";
  }
  return null;
}

export class AuthzError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function readScopeBusinessUnit(req: Request): BusinessUnit | undefined {
  const headerRaw = req.headers["x-business-unit"];
  const headerValue = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  const queryValue =
    typeof req.query.businessUnit === "string" ? req.query.businessUnit : undefined;
  const raw = headerValue ?? queryValue;
  if (!raw) return undefined;
  const candidate = normalizeBusinessUnit(raw);
  if (!candidate) throw new AuthzError(400, "businessUnit inválida");
  return candidate;
}

/**
 * Roles that see every business unit rather than being pinned to one: a tenant `admin` across
 * its own daycare, and the platform `superadmin` across all of them. A superadmin's stored
 * `businessUnit` is "GLOBAL", which is not a unit at all, so without this it would fall through
 * to the per-user branch below and be refused on every unit-scoped route.
 */
function hasAllUnitsAccess(role: UserRole): boolean {
  return role === "admin" || role === "superadmin";
}

export function getBusinessUnitScope(req: Request): BusinessUnit[] {
  if (!req.user) throw new AuthzError(401, "No autorizado");
  if (hasAllUnitsAccess(req.user.role)) {
    const scoped = readScopeBusinessUnit(req);
    return scoped ? [scoped] : [...BUSINESS_UNITS];
  }
  const unit = normalizeBusinessUnit(req.user.businessUnit);
  if (!unit) {
    throw new AuthzError(403, "Unidad de negocio del usuario inválida");
  }
  return [unit];
}

export function getRequiredBusinessUnit(req: Request, bodyBusinessUnit?: unknown): BusinessUnit {
  if (!req.user) throw new AuthzError(401, "No autorizado");
  const bodyBu =
    typeof bodyBusinessUnit === "string" ? normalizeBusinessUnit(bodyBusinessUnit) : null;
  const scoped = readScopeBusinessUnit(req);

  if (hasAllUnitsAccess(req.user.role)) {
    const selected = bodyBu ?? scoped;
    if (!selected) throw new AuthzError(400, "Admin debe seleccionar una businessUnit");
    return selected;
  }

  const unit = normalizeBusinessUnit(req.user.businessUnit);
  if (!unit) {
    throw new AuthzError(403, "Unidad de negocio del usuario inválida");
  }
  if (bodyBu && bodyBu !== unit) {
    throw new AuthzError(403, "No autorizado para operar sobre esa unidad");
  }
  return unit;
}

export function assertBusinessUnitAccess(req: Request, businessUnit: string): void {
  const scope = getBusinessUnitScope(req);
  const unit = normalizeBusinessUnit(businessUnit);
  if (!unit || !scope.includes(unit)) {
    throw new AuthzError(403, "No tienes acceso a este registro");
  }
}

export function handleAuthzError(res: Response, error: unknown): boolean {
  if (error instanceof AuthzError) {
    res.status(error.status).json({ message: error.message });
    return true;
  }
  return false;
}

/**
 * Authenticates a request and confirms the account behind the token is still live.
 *
 * The token alone is not enough. It is stateless and valid for 12h, so a user deactivated by
 * the console — or a whole tenant suspended for non-payment — would keep working on every
 * route until it expired. `getPrincipalStatus` re-reads both, through a short-lived cache the
 * console invalidates on write.
 *
 * The three refusals are deliberately distinguishable: an expired or malformed token is a 401
 * (sign in again), a deactivated account is a 403 (signing in again will not help), and a
 * suspended tenant is a 403 naming the tenant so support can tell the two apart.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ")
    ? auth.slice(7)
    : readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!token) {
    res.status(401).json({ message: "No autorizado" });
    return;
  }

  let payload: Omit<JwtPayload, "role"> & { role: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as Omit<JwtPayload, "role"> & { role: string };
  } catch {
    res.status(401).json({ message: "Token inválido" });
    return;
  }

  try {
    // Reject pre-tenancy tokens explicitly rather than letting a missing daycareId fail later.
    if (payload.tv !== TOKEN_VERSION) {
      res.status(401).json({ message: "Sesión caducada, inicia sesión nuevamente" });
      return;
    }

    const role = normalizeUserRole(payload.role, payload.businessUnit);
    if (!role) {
      res.status(403).json({ message: "Rol no autorizado" });
      return;
    }

    const daycareId = payload.daycareId ?? null;
    // The tenant invariant, restated at the edge: a superadmin has no daycare and everyone
    // else must have one.
    if (role === "superadmin" ? daycareId !== null : daycareId === null) {
      res.status(403).json({ message: "Sesión inconsistente" });
      return;
    }

    const status = await getPrincipalStatus(payload.userId);
    if (!status) {
      // The token names a user that no longer exists.
      res.status(401).json({ message: "Sesión no válida" });
      return;
    }
    // A token minted before the user was moved between tenants must not keep its old scope.
    if (status.daycareId !== daycareId) {
      res.status(401).json({ message: "Sesión caducada, inicia sesión nuevamente" });
      return;
    }
    // Nor may one minted before a role change keep the old role: the role decides which
    // modules open and whether permissions apply at all, so a demoted admin would otherwise
    // hold everything until the token expired.
    if (normalizeUserRole(status.role, status.businessUnit) !== role) {
      res.status(401).json({ message: "Sesión caducada, inicia sesión nuevamente" });
      return;
    }
    // Nor one minted before the password was reset: a reset is how a stolen session is ended.
    if ((payload.se ?? 0) !== status.sessionEpoch) {
      res.status(401).json({ message: "Sesión caducada, inicia sesión nuevamente" });
      return;
    }
    if (!status.userActive) {
      res.status(403).json({ message: "Tu cuenta está desactivada", code: "USER_INACTIVE" });
      return;
    }
    if (!status.daycareActive) {
      res.status(403).json({ message: "La guardería está desactivada", code: "DAYCARE_INACTIVE" });
      return;
    }

    req.user = {
      ...payload,
      role,
      daycareId,
      permissions: effectivePermissions(role, status.permissions),
      subscriptionSuspended: status.subscriptionSuspended,
    };
    next();
  } catch (error) {
    // The status lookup touches the database, so it can fail for reasons that are not the
    // caller's fault. That is a 500, not a 401 -- answering "token inválido" to a database
    // outage would log every user out.
    next(error);
  }
}
