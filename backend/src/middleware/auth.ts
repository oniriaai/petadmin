import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const BUSINESS_UNITS = ["KINDERDOG", "PETHIJOS"] as const;
export type BusinessUnit = (typeof BUSINESS_UNITS)[number];
export type UserRole = "admin" | "kinderdog" | "pethijos";

interface JwtPayload {
  userId: string;
  username: string;
  businessUnit: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

function isBusinessUnit(value: string): value is BusinessUnit {
  return BUSINESS_UNITS.includes(value as BusinessUnit);
}

export function normalizeUserRole(role: string, businessUnit: string): UserRole | null {
  const normalizedRole = role.trim().toLowerCase();
  if (normalizedRole === "admin") return "admin";
  if (normalizedRole === "kinderdog") return "kinderdog";
  if (normalizedRole === "pethijos") return "pethijos";
  if (normalizedRole === "owner") {
    if (businessUnit === "GLOBAL") return "admin";
    if (businessUnit === "KINDERDOG") return "kinderdog";
    if (businessUnit === "PETHIJOS") return "pethijos";
  }
  return null;
}

class AuthzError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function readScopeBusinessUnit(req: Request): BusinessUnit | undefined {
  const headerRaw = req.headers["x-business-unit"];
  const headerValue = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  const queryValue = typeof req.query.businessUnit === "string" ? req.query.businessUnit : undefined;
  const candidate = (headerValue ?? queryValue)?.toUpperCase();
  if (!candidate) return undefined;
  if (!isBusinessUnit(candidate)) throw new AuthzError(400, "businessUnit inválida");
  return candidate;
}

export function getBusinessUnitScope(req: Request): BusinessUnit[] {
  if (!req.user) throw new AuthzError(401, "No autorizado");
  if (req.user.role === "admin") {
    const scoped = readScopeBusinessUnit(req);
    return scoped ? [scoped] : [...BUSINESS_UNITS];
  }
  if (!isBusinessUnit(req.user.businessUnit)) {
    throw new AuthzError(403, "Unidad de negocio del usuario inválida");
  }
  return [req.user.businessUnit];
}

export function getRequiredBusinessUnit(req: Request, bodyBusinessUnit?: unknown): BusinessUnit {
  if (!req.user) throw new AuthzError(401, "No autorizado");
  const normalizedBodyBu = typeof bodyBusinessUnit === "string" ? bodyBusinessUnit.toUpperCase() : undefined;
  const bodyBu = normalizedBodyBu && isBusinessUnit(normalizedBodyBu) ? normalizedBodyBu : undefined;
  const scoped = readScopeBusinessUnit(req);

  if (req.user.role === "admin") {
    const selected = bodyBu ?? scoped;
    if (!selected) throw new AuthzError(400, "Admin debe seleccionar una businessUnit");
    return selected;
  }

  if (!isBusinessUnit(req.user.businessUnit)) {
    throw new AuthzError(403, "Unidad de negocio del usuario inválida");
  }
  if (bodyBu && bodyBu !== req.user.businessUnit) {
    throw new AuthzError(403, "No autorizado para operar sobre esa unidad");
  }
  return req.user.businessUnit;
}

export function buildBusinessUnitWhere(req: Request, field = "businessUnit"): Record<string, unknown> {
  const scope = getBusinessUnitScope(req);
  return scope.length === 1 ? { [field]: scope[0] } : { [field]: { in: scope } };
}

export function assertBusinessUnitAccess(req: Request, businessUnit: string): void {
  const scope = getBusinessUnitScope(req);
  if (!scope.includes(businessUnit as BusinessUnit)) {
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

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "No autorizado" });
    return;
  }
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? "change_me") as Omit<JwtPayload, "role"> & { role: string };
    const role = normalizeUserRole(payload.role, payload.businessUnit);
    if (!role) {
      res.status(403).json({ message: "Rol no autorizado" });
      return;
    }
    req.user = { ...payload, role };
    next();
  } catch {
    res.status(401).json({ message: "Token inválido" });
  }
}
