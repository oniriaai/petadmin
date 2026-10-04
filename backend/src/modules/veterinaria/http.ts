import type { Request, Response } from "express";
import type { z, ZodTypeAny } from "zod";

import { handleAuthzError } from "../../middleware/auth";

/** The tail of every handler's catch: a known refusal, or a 500 that never leaks the error. */
export function fail(res: Response, error: unknown): void {
  if (handleAuthzError(res, error)) return;
  console.error(error);
  res.status(500).json({ message: "Error interno del servidor" });
}

/** Parses the body, or answers 400 and returns null. */
export function parseBody<S extends ZodTypeAny>(
  schema: S,
  req: Request,
  res: Response,
): z.infer<S> | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
    return null;
  }
  return parsed.data;
}
