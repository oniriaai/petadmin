import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../db";
import { CHANNELS, availableChannels } from "../../core/messaging";
import { buildScopeWhere, getRequiredDaycareId } from "../../core/tenancy/scope";
import { getBusinessUnitScope, handleAuthzError } from "../../middleware/auth";
import { readPage, sendPage } from "../../utils/pagination";
import { DEFAULT_DUE_DAYS, listDue, loadTenantContext, type DueReminder } from "./due.service";
import { sendManualReminder } from "./send.service";
import { REMINDER_KINDS } from "./templates";

export const recordatoriosRouter = Router();

const lastSendSelect = {
  id: true,
  sourceKey: true,
  status: true,
  channel: true,
  trigger: true,
  error: true,
  createdAt: true,
  sentAt: true,
} as const;

/**
 * What is due in the units the caller is working in, with the channel each reminder would use
 * and what was last sent about it.
 *
 * A bare array on purpose: the list is merged from reservations and the clinic's records and
 * filtered in memory, so a page of it would be short and its total would not match.
 */
recordatoriosRouter.get("/due", async (req, res) => {
  try {
    const daycareId = getRequiredDaycareId(req);
    const query = req.query as Record<string, string>;
    const kind = REMINDER_KINDS.find((candidate) => candidate === query.kind);
    if (query.kind && !kind) {
      res.status(400).json({ message: "Tipo de recordatorio inválido" });
      return;
    }
    const tenant = await loadTenantContext(daycareId);
    if (!tenant) {
      res.json([]);
      return;
    }

    const due: DueReminder[] = [];
    for (const unit of getBusinessUnitScope(req)) {
      due.push(
        ...(await listDue(tenant, unit, { days: Number(query.days) || DEFAULT_DUE_DAYS, kind })),
      );
    }

    const sends = due.length
      ? await prisma.reminderMessage.findMany({
          where: { daycareId, sourceKey: { in: due.map((item) => item.sourceKey) } },
          select: lastSendSelect,
          orderBy: { createdAt: "desc" },
        })
      : [];
    // Newest first, so the first one seen per key is the last thing that happened to it.
    const lastSend = new Map<string, (typeof sends)[number]>();
    for (const send of sends) {
      if (!lastSend.has(send.sourceKey)) lastSend.set(send.sourceKey, send);
    }

    res.json(
      due
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
        // `dedupeKey` is the job's own bookkeeping and stays here.
        .map(({ dedupeKey: _dedupeKey, ...item }) => ({
          ...item,
          lastSend: lastSend.get(item.sourceKey) ?? null,
        })),
    );
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

const sendSchema = z.object({
  sourceKey: z.string().min(3).max(120),
  channel: z.enum(CHANNELS).optional(),
});

/**
 * Sends one reminder now.
 *
 * The body names WHAT to remind about and, optionally, by which channel. Who receives it is
 * read from the tutor's own record after the key is resolved against the caller's tenant and
 * units, never taken from the request.
 */
recordatoriosRouter.post("/send", async (req, res) => {
  try {
    const daycareId = getRequiredDaycareId(req);
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      return;
    }
    const result = await sendManualReminder(daycareId, getBusinessUnitScope(req), {
      ...parsed.data,
      userId: req.user?.userId ?? null,
    });
    // A provider that refused the message is not an error of this request: the attempt was
    // made and logged, and the caller needs the reason to show it.
    res.status(result.outcome === "sent" ? 201 : 200).json(result);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

/** Everything sent, failed or skipped, newest first. */
recordatoriosRouter.get("/log", async (req, res) => {
  try {
    const query = req.query as Record<string, string>;
    const where: Record<string, unknown> = { ...buildScopeWhere(req) };
    if (query.status) where.status = query.status;
    const page = readPage(req);
    const [messages, total] = await Promise.all([
      prisma.reminderMessage.findMany({
        where,
        select: {
          id: true,
          businessUnit: true,
          kind: true,
          sourceKey: true,
          channel: true,
          recipient: true,
          status: true,
          trigger: true,
          attempts: true,
          error: true,
          createdAt: true,
          sentAt: true,
          client: { select: { id: true, firstName: true, lastName: true } },
          pet: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: page.skip,
        take: page.take,
      }),
      prisma.reminderMessage.count({ where }),
    ]);
    sendPage(res, page, messages, total);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

/**
 * Which channels this installation can send on. `simulated` means there is no provider behind
 * it and messages only reach the server log, which the screen has to say out loud.
 */
recordatoriosRouter.get("/channels", (_req, res) => {
  res.json(availableChannels());
});
