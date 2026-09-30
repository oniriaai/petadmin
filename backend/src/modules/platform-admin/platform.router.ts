import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { ASSIGNABLE_TENANT_ROLES, BUSINESS_UNITS, handleAuthzError } from "../../middleware/auth";
import { PRODUCT_MODULES, TOGGLEABLE_PRODUCT_MODULES } from "../../platform/product-modules";
import { invalidate } from "../../platform/module-access";
import { listAudit, recordAudit } from "./audit.service";
import {
  createDaycare,
  getDaycare,
  getOverview,
  listDaycares,
  provisionUser,
  updateDaycare,
  updateUser,
} from "./daycares.service";
import { getEntitlementMatrix, setEntitlements } from "./entitlements.service";

export const platformRouter = Router();

/**
 * Second lock on the vendor console.
 *
 * The registry already mounts this module behind `requireModuleAccess`, whose `access.roles` is
 * `["superadmin"]`, so this check is redundant today — and it is kept anyway, unlike the
 * per-router `requireAuth` calls that were removed when the gate landed. Those were redundant
 * copies of a check that protects ordinary tenant data; this one protects the ability to create
 * tenants, provision users and rewrite entitlements. A single mistake in mount order should not
 * be enough to expose it.
 */
platformRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== "superadmin") {
    res.status(403).json({ message: "No tienes permiso para acceder a la consola de plataforma" });
    return;
  }
  next();
});

function fail(res: Response, error: unknown): void {
  if (handleAuthzError(res, error)) return;
  console.error(error);
  res.status(500).json({ message: "Error interno del servidor" });
}

function invalid(res: Response, parsed: z.SafeParseError<unknown>): void {
  res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
}

// --- catalog ----------------------------------------------------------------

platformRouter.get("/modules", (_req, res) => {
  res.json({
    modules: TOGGLEABLE_PRODUCT_MODULES.map((productModule) => ({
      id: productModule.id,
      label: productModule.label,
      description: productModule.description,
      requires: productModule.requires ?? [],
      backendModuleIds: productModule.backendModuleIds,
    })),
    // Shown as context in the console: what every daycare gets regardless of what it bought.
    core: PRODUCT_MODULES.filter((productModule) => productModule.core).map((productModule) => ({
      id: productModule.id,
      label: productModule.label,
      description: productModule.description,
      backendModuleIds: productModule.backendModuleIds,
    })),
    units: BUSINESS_UNITS,
    roles: ASSIGNABLE_TENANT_ROLES,
  });
});

platformRouter.get("/overview", async (_req, res) => {
  try {
    res.json(await getOverview());
  } catch (error) {
    fail(res, error);
  }
});

// --- daycares ---------------------------------------------------------------

platformRouter.get("/daycares", async (_req, res) => {
  try {
    res.json(await listDaycares());
  } catch (error) {
    fail(res, error);
  }
});

const slugSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "El identificador solo admite minúsculas, números y guiones");

const createSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(120),
  legalName: z.string().max(160).optional(),
  timezone: z.string().min(1).max(64).optional(),
  units: z.array(z.string()).min(1),
  modules: z.array(z.string()).optional(),
  admin: z.object({
    username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, "Usuario inválido"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    name: z.string().min(1).max(120),
  }),
});

platformRouter.post("/daycares", async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);

    const { daycare, admin } = await createDaycare(parsed.data);
    await recordAudit(req, {
      action: "daycare.create",
      daycareId: daycare.id,
      targetType: "daycare",
      targetId: daycare.id,
      detail: { slug: daycare.slug, units: daycare.units, modules: parsed.data.modules ?? "default", admin: admin.username },
    });
    res.status(201).json({ daycare, admin });
  } catch (error) {
    fail(res, error);
  }
});

platformRouter.get("/daycares/:id", async (req, res) => {
  try {
    const [daycare, entitlements, audit] = await Promise.all([
      getDaycare(req.params.id),
      getEntitlementMatrix(req.params.id),
      listAudit({ daycareId: req.params.id, limit: 20 }),
    ]);
    res.json({ ...daycare, entitlements, audit });
  } catch (error) {
    fail(res, error);
  }
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  legalName: z.string().max(160).nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
  units: z.array(z.string()).min(1).optional(),
  isActive: z.boolean().optional(),
});

platformRouter.patch("/daycares/:id", async (req, res) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);

    const daycare = await updateDaycare(req.params.id, parsed.data);
    await recordAudit(req, {
      action: "daycare.update",
      daycareId: daycare.id,
      targetType: "daycare",
      targetId: daycare.id,
      detail: parsed.data,
    });
    res.json(daycare);
  } catch (error) {
    fail(res, error);
  }
});

// --- entitlements -----------------------------------------------------------

platformRouter.get("/daycares/:id/modules", async (req, res) => {
  try {
    await getDaycare(req.params.id);
    res.json(await getEntitlementMatrix(req.params.id));
  } catch (error) {
    fail(res, error);
  }
});

const modulesSchema = z.object({
  modules: z.array(z.object({ moduleId: z.string().min(1), isEnabled: z.boolean() })).min(1),
});

platformRouter.put("/daycares/:id/modules", async (req, res) => {
  try {
    const parsed = modulesSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);

    await getDaycare(req.params.id);
    const entitlements = await setEntitlements(req.params.id, parsed.data.modules);
    await recordAudit(req, {
      action: "module.toggle",
      daycareId: req.params.id,
      targetType: "daycare",
      targetId: req.params.id,
      detail: parsed.data.modules,
    });
    res.json(entitlements);
  } catch (error) {
    fail(res, error);
  }
});

// --- users ------------------------------------------------------------------

const provisionSchema = z.object({
  username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, "Usuario inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  name: z.string().min(1).max(120),
  // `superadmin` is not a member of this enum, so it cannot be requested at all.
  role: z.enum(ASSIGNABLE_TENANT_ROLES),
});

platformRouter.post("/daycares/:id/users", async (req, res) => {
  try {
    const parsed = provisionSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);

    const user = await provisionUser(req.params.id, parsed.data);
    await recordAudit(req, {
      action: "user.provision",
      daycareId: req.params.id,
      targetType: "user",
      targetId: user.id,
      detail: { username: user.username, role: user.role },
    });
    res.status(201).json(user);
  } catch (error) {
    fail(res, error);
  }
});

const userUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(ASSIGNABLE_TENANT_ROLES).optional(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional(),
  isActive: z.boolean().optional(),
});

platformRouter.patch("/daycares/:id/users/:userId", async (req, res) => {
  try {
    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);

    const user = await updateUser(req.params.id, req.params.userId, parsed.data);
    await recordAudit(req, {
      action: "user.update",
      daycareId: req.params.id,
      targetType: "user",
      targetId: user.id,
      // Never log the password itself, only that one was set.
      detail: { ...parsed.data, password: parsed.data.password ? "(actualizada)" : undefined },
    });
    res.json(user);
  } catch (error) {
    fail(res, error);
  }
});

// --- audit ------------------------------------------------------------------

platformRouter.get("/audit", async (req, res) => {
  try {
    const { daycareId, limit } = req.query as Record<string, string>;
    res.json(await listAudit({ daycareId, limit: limit ? Number(limit) : undefined }));
  } catch (error) {
    fail(res, error);
  }
});

// --- cache ------------------------------------------------------------------

/**
 * Manual cache drop. The write endpoints already invalidate, so this exists for the case the
 * TTL makes awkward: entitlements changed in the database by hand, or by another instance.
 */
platformRouter.post("/daycares/:id/refresh", async (req, res) => {
  try {
    await getDaycare(req.params.id);
    invalidate(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});
