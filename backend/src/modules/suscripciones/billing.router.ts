import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { getRequiredDaycareId } from "../../core/tenancy/scope";
import { handleAuthzError } from "../../middleware/auth";
import { logger } from "../../middleware/observability";
import { recordAudit } from "../platform-admin";
import {
  SUBSCRIPTION_STATUSES,
  confirmCheckout,
  getBillingState,
  getSubscriptionForConsole,
  removeCard,
  startCheckout,
  updateSubscriptionFromConsole,
} from "./billing.service";
import { BILLING_PERIODS } from "./plans";

/**
 * A daycare's own subscription: what it has, what it owes, and paying it.
 *
 * This is the one module a tenant with a lapsed subscription can still reach
 * (`platform/module-access.ts`), which is the point: it is where the suspension is lifted.
 */
export const billingRouter = Router();

function fail(res: Response, error: unknown): void {
  if (handleAuthzError(res, error)) return;
  logger.error({ err: error }, "[billing] error inesperado");
  res.status(500).json({ message: "Error interno del servidor" });
}

function invalid(res: Response, parsed: z.SafeParseError<unknown>): void {
  res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
}

billingRouter.get("/", async (req, res) => {
  try {
    res.json(await getBillingState(getRequiredDaycareId(req)));
  } catch (error) {
    fail(res, error);
  }
});

const checkoutSchema = z.object({
  planId: z.string().max(40).optional(),
  units: z.array(z.string().max(20)).max(3).optional(),
  period: z.enum(BILLING_PERIODS).optional(),
  saveCard: z.boolean().optional(),
});

billingRouter.post("/checkout", async (req, res) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);
    res.status(201).json(await startCheckout(getRequiredDaycareId(req), parsed.data));
  } catch (error) {
    fail(res, error);
  }
});

const confirmSchema = z.object({
  id: z.string().min(1).max(40),
  clientTransactionId: z.string().min(1).max(60),
  ctoken: z.string().max(400).nullish(),
});

billingRouter.post("/confirm", async (req, res) => {
  try {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);
    res.json(await confirmCheckout(getRequiredDaycareId(req), parsed.data));
  } catch (error) {
    fail(res, error);
  }
});

billingRouter.delete("/card", async (req, res) => {
  try {
    res.json(await removeCard(getRequiredDaycareId(req)));
  } catch (error) {
    fail(res, error);
  }
});

// --- the vendor's override ----------------------------------------------------
// Here and not under /platform so that everything that writes a subscription lives in the
// module that owns it. The registry lets a superadmin through the gate; this is the check that
// nobody else gets past, restated per route as the console's own router does.

function superadminOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "superadmin") {
    res.status(403).json({ message: "No tienes permiso para realizar esta acción" });
    return;
  }
  next();
}

billingRouter.get("/tenants/:daycareId", superadminOnly, async (req, res) => {
  try {
    res.json({ subscription: await getSubscriptionForConsole(req.params.daycareId) });
  } catch (error) {
    fail(res, error);
  }
});

const overrideSchema = z
  .object({
    status: z.enum(SUBSCRIPTION_STATUSES).optional(),
    trialEndsAt: z.coerce.date().optional(),
    currentPeriodEnd: z.coerce.date().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nada que cambiar");

billingRouter.patch("/tenants/:daycareId", superadminOnly, async (req, res) => {
  try {
    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);
    const subscription = await updateSubscriptionFromConsole(req.params.daycareId, parsed.data);
    await recordAudit(req, {
      action: "subscription.update",
      daycareId: req.params.daycareId,
      targetType: "subscription",
      targetId: req.params.daycareId,
      detail: parsed.data,
    });
    res.json({ subscription });
  } catch (error) {
    fail(res, error);
  }
});
