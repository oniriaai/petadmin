import { Router, type Response } from "express";
import { z } from "zod";

import { handleAuthzError } from "../../middleware/auth";
import { logger } from "../../middleware/observability";
import { signupLimiter } from "../../middleware/security";
import { BILLING_PERIODS } from "./plans";
import { confirmSignupPayment, getCatalog, startSignup, verifyTrialSignup } from "./signup.service";

/**
 * The public side of signing up. Mounted without authentication, like `auth`: these are the
 * requests of somebody who does not have an account yet.
 *
 * Nothing here trusts the browser with a price or with the outcome of a payment. The amount is
 * computed from the catalog, and a payment counts when PayPhone says so to this server.
 */
export const signupRouter = Router();

function fail(res: Response, error: unknown): void {
  if (handleAuthzError(res, error)) return;
  logger.error({ err: error }, "[signup] error inesperado");
  res.status(500).json({ message: "Error interno del servidor" });
}

function invalid(res: Response, parsed: z.SafeParseError<unknown>): void {
  res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
}

signupRouter.get("/plans", async (_req, res) => {
  try {
    res.json(await getCatalog());
  } catch (error) {
    fail(res, error);
  }
});

// The same rules the console applies to a daycare it creates by hand.
const intentSchema = z.object({
  kind: z.enum(["PAID", "TRIAL"]),
  planId: z.string().max(40).optional(),
  units: z.array(z.string().max(20)).max(3).optional(),
  period: z.enum(BILLING_PERIODS),
  businessName: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      "El identificador solo admite minúsculas, números y guiones",
    ),
  legalName: z.string().trim().max(160).optional(),
  taxId: z
    .string()
    .trim()
    .regex(/^\d{10}(\d{3})?$/, "Escribe la cédula (10 dígitos) o el RUC (13 dígitos)"),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email("El correo no es válido").max(160),
  adminName: z.string().trim().min(1).max(120),
  adminUsername: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Usuario inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
  saveCard: z.boolean().optional(),
  // Without this there is no contract to charge under, so it is not optional on the server.
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "Debes aceptar las condiciones del servicio" }),
  }),
});

signupRouter.post("/intents", signupLimiter, async (req, res) => {
  try {
    const parsed = intentSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);
    res.status(201).json(await startSignup(parsed.data));
  } catch (error) {
    fail(res, error);
  }
});

const confirmSchema = z.object({
  // PayPhone's own ids, straight from the return URL.
  id: z.string().min(1).max(40),
  clientTransactionId: z.string().min(1).max(60),
  ctoken: z.string().max(400).nullish(),
});

signupRouter.post("/confirm", async (req, res) => {
  try {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);
    res.json(await confirmSignupPayment(parsed.data));
  } catch (error) {
    fail(res, error);
  }
});

const verifySchema = z.object({ token: z.string().min(20).max(200) });

signupRouter.post("/verify", async (req, res) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);
    res.json(await verifyTrialSignup(parsed.data.token));
  } catch (error) {
    fail(res, error);
  }
});
