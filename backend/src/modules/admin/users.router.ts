import { Router } from "express";
import { z } from "zod";

import { ASSIGNABLE_TENANT_ROLES, handleAuthzError } from "../../middleware/auth";
import { getRequiredDaycareId } from "../../core/tenancy/scope";
import { invalidatePrincipal } from "../../core/tenancy/principal";
import { listTenantUsers, provisionUser, updateUser } from "../platform-admin/daycares.service";

/**
 * A daycare administering its own staff.
 *
 * Until now the vendor console was the ONLY way to create a user or reset a password, so every
 * staff change at every client — a new receptionist, a forgotten password, someone leaving —
 * was a support request to the vendor. Tolerable with two customers; the dominant support cost
 * with twenty.
 *
 * The logic is not reimplemented. `provisionUser` and `updateUser` from the console's service
 * already enforce what matters (the role must fit a unit the daycare bought, the business unit
 * is derived from the role rather than accepted, the last active admin cannot be locked out,
 * and a user is only editable through its own daycare), so this is a tenant-scoped wrapper
 * over them.
 *
 * Two things make it safe to expose:
 *   - the daycare always comes from `getRequiredDaycareId(req)`, never from the path or body,
 *     so an admin cannot name another tenant;
 *   - `ASSIGNABLE_TENANT_ROLES` excludes `superadmin`, so the vendor role is not requestable
 *     through this surface any more than through the console's.
 */
export const usersRouter = Router();

const createSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Usuario inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  name: z.string().min(1).max(120),
  role: z.enum(ASSIGNABLE_TENANT_ROLES),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(ASSIGNABLE_TENANT_ROLES).optional(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional(),
  isActive: z.boolean().optional(),
});

function fail(res: import("express").Response, error: unknown): void {
  if (handleAuthzError(res, error)) return;
  console.error(error);
  res.status(500).json({ message: "Error interno del servidor" });
}

usersRouter.get("/", async (req, res) => {
  try {
    res.json(await listTenantUsers(getRequiredDaycareId(req)));
  } catch (error) {
    fail(res, error);
  }
});

usersRouter.post("/", async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      return;
    }
    const user = await provisionUser(getRequiredDaycareId(req), parsed.data);
    res.status(201).json(user);
  } catch (error) {
    fail(res, error);
  }
});

usersRouter.patch("/:id", async (req, res) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      return;
    }

    const daycareId = getRequiredDaycareId(req);

    // An admin must not be able to deactivate or demote itself: it would be locking itself out
    // mid-request, and the last-admin guard below cannot see the difference between "someone
    // else" and "me". Changing one's own name or password is fine.
    const isSelf = req.params.id === req.user?.userId;
    if (
      isSelf &&
      (parsed.data.isActive === false || (parsed.data.role && parsed.data.role !== "admin"))
    ) {
      res.status(409).json({
        message: "No puedes desactivar ni cambiar el rol de tu propia cuenta",
        code: "SELF_DEMOTION",
      });
      return;
    }

    const user = await updateUser(daycareId, req.params.id, parsed.data);
    // A deactivation or password reset must bite on the next request, not when the token
    // expires up to 12h later.
    invalidatePrincipal(user.id);
    res.json(user);
  } catch (error) {
    fail(res, error);
  }
});
