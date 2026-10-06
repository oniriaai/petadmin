import type { Request } from "express";

import { prisma } from "../../db";

export type PlatformAction =
  | "daycare.create"
  | "daycare.update"
  | "module.toggle"
  | "user.provision"
  | "user.update"
  | "daycare.export"
  | "daycare.delete"
  | "daycare.signup"
  | "subscription.update";

export interface AuditInput {
  action: PlatformAction;
  daycareId?: string | null;
  targetType?: string;
  targetId?: string;
  detail?: unknown;
}

/**
 * Appends a console action to the audit trail.
 *
 * Deliberately never throws: an audit write failing must not roll back or 500 a change the
 * operator already made and can see took effect. A missing line is a smaller problem than a
 * console that reports failure for a successful write.
 */
export async function recordAudit(req: Request | null, input: AuditInput): Promise<void> {
  try {
    await prisma.platformAuditLog.create({
      data: {
        // No request: the system acted on its own (a visitor's signup, the billing job).
        actorUserId: req ? (req.user?.userId ?? "unknown") : "system",
        actorUsername: req ? (req.user?.username ?? "unknown") : "system",
        action: input.action,
        daycareId: input.daycareId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        detail: input.detail === undefined ? null : JSON.stringify(input.detail),
      },
    });
  } catch (error) {
    console.error("No se pudo registrar la auditoría de plataforma", error);
  }
}

export async function listAudit(options: { daycareId?: string; limit?: number } = {}) {
  const take = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows = await prisma.platformAuditLog.findMany({
    where: options.daycareId ? { daycareId: options.daycareId } : undefined,
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((row) => ({
    ...row,
    detail: row.detail ? safeParse(row.detail) : null,
  }));
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
