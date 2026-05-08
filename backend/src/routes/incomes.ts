import { Router } from "express";
import { z } from "zod";
import { assertBusinessUnitAccess, buildBusinessUnitWhere, getRequiredBusinessUnit, handleAuthzError, requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const incomesRouter = Router();
incomesRouter.use(requireAuth);

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

incomesRouter.get("/", async (req, res) => {
  try {
  const { type, status, from, to } = req.query as Record<string, string>;
  const where: Record<string, unknown> = buildBusinessUnitWhere(req);
  if (type) where.type = type;
  if (status) where.invoiceStatus = status;
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }
  const incomes = await prisma.income.findMany({
    where,
    include: { reservation: { select: { id: true, service: true, client: { select: { firstName: true, lastName: true } } } } },
    orderBy: { date: "desc" },
  });
  res.json(incomes);
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
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const { date, amount, vatPercent = 0, ...rest } = parsed.data;
  const vatAmount = amount * (vatPercent / 100);
  const total = amount + vatAmount;
  const income = await prisma.income.create({
    data: { ...rest, businessUnit: bu, amount, vatPercent, vatAmount, total, date: date ? new Date(date) : new Date() },
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
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const { date, amount, vatPercent, ...rest } = parsed.data;
  const current = await prisma.income.findUnique({ where: { id: req.params.id } });
  if (!current) { res.status(404).json({ message: "Ingreso no encontrado" }); return; }
  assertBusinessUnitAccess(req, current.businessUnit);
  const a = amount ?? current.amount;
  const vp = vatPercent ?? current.vatPercent;
  const vatAmount = a * (vp / 100);
  const total = a + vatAmount;
  const income = await prisma.income.update({
    where: { id: req.params.id },
    data: { ...rest, amount: a, vatPercent: vp, vatAmount, total, date: date ? new Date(date) : undefined },
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
  const current = await prisma.income.findUnique({ where: { id: req.params.id }, select: { businessUnit: true } });
  if (!current) { res.status(404).json({ message: "Ingreso no encontrado" }); return; }
  assertBusinessUnitAccess(req, current.businessUnit);
  await prisma.income.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
