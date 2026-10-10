import { Router, type Request } from "express";
import { z } from "zod";
import { AuthzError, getRequiredBusinessUnit, handleAuthzError } from "../middleware/auth";
import { prisma } from "../db";
import { assertRecordAccess, buildScopeWhere, getRequiredDaycareId } from "../core/tenancy/scope";
import { readPage, sendPage } from "../utils/pagination";
import { parseFormDate, rangeWhere, readRange, requestTimezone } from "../utils/period";

export const incomesRouter = Router();

/**
 * `reservationId` comes from the request body, so it is resolved against the caller's daycare
 * before it is stored: the list returns the linked reservation with its tutor's name.
 */
async function assertReservationInTenant(reservationId: string, daycareId: string): Promise<void> {
  const reservation = await prisma.reservation.findFirst({
    where: { id: reservationId, daycareId },
    select: { id: true },
  });
  if (!reservation) throw new AuthzError(404, "Reserva no encontrada");
}

const schema = z.object({
  reservationId: z.string().optional(),
  type: z.string().default("RESERVA"),
  concept: z.string().min(1),
  amount: z.number().min(0),
  vatPercent: z.number().min(0).default(0),
  paymentMethod: z.string().default("EFECTIVO"),
  invoiceNumber: z.string().optional(),
  invoiceStatus: z.string().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

/** The filters of the income ledger, shared by the list, its totals and the Excel export. */
export async function buildIncomeWhere(req: Request): Promise<Record<string, unknown>> {
  const { type, status, paymentMethod, q } = req.query as Record<string, string>;
  const where: Record<string, unknown> = buildScopeWhere(req);
  if (type) where.type = type;
  if (status) where.invoiceStatus = status;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (q?.trim()) where.concept = { contains: q.trim(), mode: "insensitive" };
  const date = rangeWhere(readRange(req, await requestTimezone(req)));
  if (date) where.date = date;
  return where;
}

incomesRouter.get("/summary", async (req, res) => {
  try {
    const totals = await prisma.income.aggregate({
      where: await buildIncomeWhere(req),
      _sum: { total: true, vatAmount: true },
      _count: true,
    });
    res.json({
      total: totals._sum.total ?? 0,
      vat: totals._sum.vatAmount ?? 0,
      count: totals._count,
    });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

incomesRouter.get("/", async (req, res) => {
  try {
    const where = await buildIncomeWhere(req);
    // The ledger grows forever, so this is the clearest case for a bounded read. `id` breaks
    // ties on `date` so a page boundary cannot show or skip the same row twice.
    const page = readPage(req);
    const [incomes, total] = await Promise.all([
      prisma.income.findMany({
        where,
        include: {
          reservation: {
            select: {
              id: true,
              service: true,
              client: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        skip: page.skip,
        take: page.take,
      }),
      prisma.income.count({ where }),
    ]);
    sendPage(res, page, incomes, total);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

incomesRouter.post("/", async (req, res) => {
  try {
    const bu = getRequiredBusinessUnit(req, req.body?.businessUnit);
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos" });
      return;
    }
    const { date, amount, vatPercent = 0, ...rest } = parsed.data;
    const vatAmount = amount * (vatPercent / 100);
    const total = amount + vatAmount;
    const daycareId = getRequiredDaycareId(req);
    if (rest.reservationId) await assertReservationInTenant(rest.reservationId, daycareId);
    const income = await prisma.income.create({
      data: {
        ...rest,
        businessUnit: bu,
        daycareId,
        amount,
        vatPercent,
        vatAmount,
        total,
        date: date ? parseFormDate(date, await requestTimezone(req)) : new Date(),
      },
    });
    res.status(201).json(income);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

incomesRouter.put("/:id", async (req, res) => {
  try {
    const parsed = schema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos" });
      return;
    }
    const { date, amount, vatPercent, ...rest } = parsed.data;
    const current = await prisma.income.findUnique({ where: { id: req.params.id } });
    if (!current) {
      res.status(404).json({ message: "Ingreso no encontrado" });
      return;
    }
    assertRecordAccess(req, current);
    if (rest.reservationId) await assertReservationInTenant(rest.reservationId, current.daycareId);
    const a = amount ?? current.amount;
    const vp = vatPercent ?? current.vatPercent;
    const vatAmount = a * (vp / 100);
    const total = a + vatAmount;
    const income = await prisma.income.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        amount: a,
        vatPercent: vp,
        vatAmount,
        total,
        date: date ? parseFormDate(date, await requestTimezone(req)) : undefined,
      },
    });
    res.json(income);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

incomesRouter.delete("/:id", async (req, res) => {
  try {
    const current = await prisma.income.findUnique({
      where: { id: req.params.id },
      select: { businessUnit: true, daycareId: true },
    });
    if (!current) {
      res.status(404).json({ message: "Ingreso no encontrado" });
      return;
    }
    assertRecordAccess(req, current);
    await prisma.income.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
