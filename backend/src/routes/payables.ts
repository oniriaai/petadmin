import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const payablesRouter = Router();
payablesRouter.use(requireAuth);

const schema = z.object({
  providerId: z.string().optional(),
  type: z.enum(["GASTO", "COMPRA"]),
  category: z.string().min(1),
  description: z.string().min(1),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  subtotal: z.number().min(0),
  vatPercent: z.number().min(0).default(0),
  dueDate: z.string().optional(),
  nextPayment: z.string().optional(),
  isRecurring: z.boolean().optional(),
  notes: z.string().optional(),
});

payablesRouter.get("/", async (req, res) => {
  const bu = req.user!.businessUnit;
  const { type, status, category } = req.query as Record<string, string>;
  const where: Record<string, unknown> = { businessUnit: bu };
  if (type) where.type = type;
  if (status) where.status = status;
  if (category) where.category = category;
  const payables = await prisma.payable.findMany({
    where,
    include: { provider: { select: { id: true, name: true } }, payments: { orderBy: { date: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(payables);
});

payablesRouter.get("/:id", async (req, res) => {
  const p = await prisma.payable.findUnique({
    where: { id: req.params.id },
    include: { provider: true, payments: { orderBy: { date: "desc" } } },
  });
  if (!p) { res.status(404).json({ message: "Documento no encontrado" }); return; }
  res.json(p);
});

payablesRouter.post("/", async (req, res) => {
  const bu = req.user!.businessUnit;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() }); return; }
  const { invoiceDate, dueDate, nextPayment, subtotal, vatPercent = 0, ...rest } = parsed.data;
  const vatAmount = subtotal * (vatPercent / 100);
  const total = subtotal + vatAmount;
  const p = await prisma.payable.create({
    data: {
      ...rest,
      businessUnit: bu,
      subtotal,
      vatPercent,
      vatAmount,
      total,
      balance: total,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      nextPayment: nextPayment ? new Date(nextPayment) : null,
    },
    include: { provider: { select: { id: true, name: true } } },
  });
  res.status(201).json(p);
});

payablesRouter.put("/:id", async (req, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const { invoiceDate, dueDate, nextPayment, subtotal, vatPercent, ...rest } = parsed.data;

  const current = await prisma.payable.findUnique({ where: { id: req.params.id } });
  if (!current) { res.status(404).json({ message: "Documento no encontrado" }); return; }

  const sb = subtotal ?? current.subtotal;
  const vp = vatPercent ?? current.vatPercent;
  const vatAmount = sb * (vp / 100);
  const total = sb + vatAmount;
  const balance = total - current.paid;

  const p = await prisma.payable.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      subtotal: sb, vatPercent: vp, vatAmount, total, balance,
      invoiceDate: invoiceDate !== undefined ? (invoiceDate ? new Date(invoiceDate) : null) : undefined,
      dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
      nextPayment: nextPayment !== undefined ? (nextPayment ? new Date(nextPayment) : null) : undefined,
    },
    include: { provider: { select: { id: true, name: true } } },
  });
  res.json(p);
});

payablesRouter.delete("/:id", async (req, res) => {
  await prisma.payable.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  date: z.string().optional(),
  method: z.string().default("EFECTIVO"),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

payablesRouter.post("/:id/payments", async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const { date, ...rest } = parsed.data;

  const payable = await prisma.payable.findUnique({ where: { id: req.params.id } });
  if (!payable) { res.status(404).json({ message: "Documento no encontrado" }); return; }

  const payment = await prisma.payment.create({
    data: { payableId: req.params.id, date: date ? new Date(date) : new Date(), registeredBy: req.user!.username, ...rest },
  });

  const newPaid = payable.paid + rest.amount;
  const newBalance = payable.total - newPaid;
  const newStatus = newBalance <= 0 ? "PAGADO" : "PARCIAL";

  await prisma.payable.update({
    where: { id: req.params.id },
    data: { paid: newPaid, balance: Math.max(0, newBalance), status: newStatus },
  });

  res.status(201).json(payment);
});

payablesRouter.delete("/:id/payments/:pid", async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.pid } });
  if (!payment) { res.status(404).json({ message: "Pago no encontrado" }); return; }
  await prisma.payment.delete({ where: { id: req.params.pid } });
  const payable = await prisma.payable.findUnique({ where: { id: req.params.id } });
  if (payable) {
    const newPaid = payable.paid - payment.amount;
    const newBalance = payable.total - newPaid;
    const newStatus = newBalance <= 0 ? "PAGADO" : newPaid > 0 ? "PARCIAL" : "PENDIENTE";
    await prisma.payable.update({ where: { id: req.params.id }, data: { paid: Math.max(0, newPaid), balance: Math.max(0, newBalance), status: newStatus } });
  }
  res.json({ ok: true });
});
