import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db";
import {
  JWT_SECRET,
  TOKEN_VERSION,
  handleAuthzError,
  normalizeBusinessUnit,
  normalizeUserRole,
  requireAuth,
} from "../middleware/auth";
import { loginLimiter } from "../middleware/security";
import { resolveDaycareScope } from "../core/tenancy/scope";
import { getEnabledProductModules } from "../platform/module-access";
import { PRODUCT_MODULES, TOGGLEABLE_PRODUCT_MODULES } from "../platform/product-modules";

export const authRouter = Router();

const CORE_PRODUCT_MODULE_IDS = PRODUCT_MODULES.filter((m) => m.core).map((m) => m.id);

const loginSchema = z.object({
  businessUnit: z.string().optional(),
  /** The daycare's slug. Required only when the username exists in more than one daycare. */
  daycare: z.string().min(1).max(40).optional(),
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Datos inválidos" });
    return;
  }

  const { businessUnit, daycare: daycareSlug, username, password } = parsed.data;

  /**
   * Resolving the account now that usernames are unique per daycare rather than globally.
   *
   * With a slug there is exactly one candidate. Without one, a username that is still unique
   * across the installation resolves on its own — which is what keeps every existing session,
   * client and test working, since in practice almost no username collides.
   *
   * Only when a username genuinely exists in more than one daycare is the slug demanded. That
   * response does reveal that the username is in use somewhere, which a wrong-password attempt
   * does not. The alternative — requiring a slug from every member of staff on every login —
   * costs every user something real to close a narrow oracle that is already behind the login
   * rate limiter, so this is a deliberate trade rather than an oversight.
   */
  let user: Awaited<ReturnType<typeof prisma.user.findFirst>> = null;

  if (daycareSlug) {
    const daycare = await prisma.daycare.findUnique({
      where: { slug: daycareSlug.trim().toLowerCase() },
      select: { id: true },
    });
    // An unknown slug reads as bad credentials: it must not confirm which daycares exist.
    if (daycare) {
      user = await prisma.user.findUnique({
        where: { daycareId_username: { daycareId: daycare.id, username } },
      });
    }
  } else {
    const candidates = await prisma.user.findMany({ where: { username }, take: 2 });
    if (candidates.length > 1) {
      res.status(400).json({
        message: "Este usuario existe en varias guarderías. Indica el identificador de la tuya.",
        code: "DAYCARE_REQUIRED",
      });
      return;
    }
    user = candidates[0] ?? null;
  }

  if (!user || !user.isActive || !bcrypt.compareSync(password, user.passwordHash)) {
    res.status(401).json({ message: "Credenciales incorrectas" });
    return;
  }

  const role = normalizeUserRole(user.role, user.businessUnit);
  if (!role) {
    res.status(403).json({ message: "Rol no autorizado" });
    return;
  }

  const requestedUnit = normalizeBusinessUnit(businessUnit);
  if (businessUnit && !requestedUnit) {
    res.status(400).json({ message: "businessUnit inválida" });
    return;
  }

  if (role === "superadmin") {
    // The platform account has no tenant and therefore no unit to select.
    if (user.daycareId) {
      res.status(403).json({ message: "Cuenta de plataforma inconsistente" });
      return;
    }
  } else {
    if (!user.daycareId) {
      res.status(403).json({ message: "Usuario sin guardería asignada" });
      return;
    }
    const daycare = await prisma.daycare.findUnique({
      where: { id: user.daycareId },
      select: { isActive: true },
    });
    if (!daycare?.isActive) {
      res.status(403).json({ message: "La guardería está desactivada" });
      return;
    }
    if (
      role !== "admin" &&
      requestedUnit &&
      requestedUnit !== normalizeBusinessUnit(user.businessUnit)
    ) {
      res.status(401).json({ message: "Credenciales incorrectas" });
      return;
    }
  }

  // Always emit the canonical unit so tokens and the client never carry legacy brand names.
  // "GLOBAL" is not a business unit and is preserved as-is.
  const emittedUnit = normalizeBusinessUnit(user.businessUnit) ?? user.businessUnit;

  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      businessUnit: emittedUnit,
      role,
      daycareId: user.daycareId,
      tv: TOKEN_VERSION,
    },
    JWT_SECRET,
    { expiresIn: "12h" },
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      businessUnit: emittedUnit,
      role,
      daycareId: user.daycareId,
    },
  });
});

/**
 * The session as the server sees it: who you are, which tenant you are in, and which product
 * modules you may reach. The frontend restores its session from localStorage today and never
 * re-validates it, so this is what lets navigation be gated by the server rather than by
 * whatever the browser happens to be holding.
 *
 * The auth module is mounted public (it is how a token is obtained), so this route applies
 * `requireAuth` itself.
 *
 * For a superadmin the answer depends on whether a tenant is pinned with `X-Daycare-Id`:
 * unpinned it reports full reach, pinned it reports that tenant's actual entitlements, so the
 * console shows what the daycare's own users see while supporting them. `fullAccess` stays true
 * either way, because the backend gate does not in fact restrict a superadmin.
 */
authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        businessUnit: true,
        isActive: true,
        daycareId: true,
      },
    });
    if (!user || !user.isActive) {
      res.status(401).json({ message: "Sesión no válida" });
      return;
    }

    const isSuperadmin = req.user!.role === "superadmin";
    const scope = resolveDaycareScope(req);
    const daycareId = scope.mode === "single" ? scope.daycareId : null;

    const daycare = daycareId
      ? await prisma.daycare.findUnique({
          where: { id: daycareId },
          select: {
            id: true,
            slug: true,
            name: true,
            legalName: true,
            timezone: true,
            units: true,
            isActive: true,
          },
        })
      : null;

    if (daycareId && !daycare) {
      res.status(404).json({ message: "Guardería no encontrada" });
      return;
    }
    if (!isSuperadmin && !daycare?.isActive) {
      res.status(403).json({ message: "La guardería está desactivada" });
      return;
    }

    let enabledModules: string[];
    if (isSuperadmin && !daycareId) {
      enabledModules = [...CORE_PRODUCT_MODULE_IDS, ...TOGGLEABLE_PRODUCT_MODULES.map((m) => m.id)];
    } else {
      const enabled = await getEnabledProductModules(daycareId!);
      enabledModules = [...CORE_PRODUCT_MODULE_IDS, ...[...enabled].sort()];
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: req.user!.role,
        businessUnit: normalizeBusinessUnit(user.businessUnit) ?? user.businessUnit,
        daycareId: user.daycareId,
      },
      daycare: daycare
        ? {
            ...daycare,
            unitList: daycare.units
              .split(",")
              .map((u) => u.trim())
              .filter(Boolean),
          }
        : null,
      enabledModules,
      units: daycare
        ? daycare.units
            .split(",")
            .map((u) => u.trim())
            .filter(Boolean)
        : [],
      // Effective, and read live by requireAuth: an admin and a superadmin hold all of them.
      permissions: req.user!.permissions,
      fullAccess: isSuperadmin,
    });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
