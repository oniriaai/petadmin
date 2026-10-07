import { Router } from "express";
import { z } from "zod";
import { AuthzError, getRequiredBusinessUnit, handleAuthzError } from "../middleware/auth";
import { prisma } from "../db";
import { assertRecordAccess, buildScopeWhere, getRequiredDaycareId } from "../core/tenancy/scope";
import { readPage, sendPage } from "../utils/pagination";

export const payablesRouter = Router();

/**
 * `providerId` comes from the request body, so it is resolved against the caller's daycare
 * before it is stored: `GET /:id` returns the whole provider row, which made an unchecked id a
 * way to read another tenant's supplier.
 */
async function assertProviderInTenant(providerId: string, daycareId: string): Promise<void> {
  const provider = await prisma.provider.findFirst({
    where: { id: providerId, daycareId },
    select: { id: true },
  });
  if (!provider) throw new AuthzError(404, "Proveedor no encontrado");
}

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
  try {
    const { type, status, category } = req.query as Record<string, string>;
    const where: Record<string, unknown> = buildScopeWhere(req);
    if (type) where.type = type;
    if (status) where.status = status;
    if (category) where.category = category;
    const page = readPage(req);
    const [payables, total] = await Promise.all([
      prisma.payable.findMany({
        where,
        include: {
          provider: { select: { id: true, name: true } },
          payments: { orderBy: { date: "desc" } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: page.skip,
        take: page.take,
      }),
      prisma.payable.count({ where }),
    ]);
    sendPage(res, page, payables, total);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

payablesRouter.get("/:id", async (req, res) => {
  try {
    const p = await prisma.payable.findUnique({
      where: { id: req.params.id },
      include: { provider: true, payments: { orderBy: { date: "desc" } } },
    });
    if (!p) {
      res.status(404).json({ message: "Documento no encontrado" });
      return;
    }
    assertRecordAccess(req, p);
    res.json(p);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

payablesRouter.post("/", async (req, res) => {
  try {
    const bu = getRequiredBusinessUnit(req, req.body?.businessUnit);
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      return;
    }
    const { invoiceDate, dueDate, nextPayment, subtotal, vatPercent = 0, ...rest } = parsed.data;
    const vatAmount = subtotal * (vatPercent / 100);
    const total = subtotal + vatAmount;
    const daycareId = getRequiredDaycareId(req);
    if (rest.providerId) await assertProviderInTenant(rest.providerId, daycareId);
    const p = await prisma.payable.create({
      data: {
        ...rest,
        businessUnit: bu,
        daycareId,
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
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

payablesRouter.put("/:id", async (req, res) => {
  try {
    const parsed = schema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos" });
      return;
    }
    const { invoiceDate, dueDate, nextPayment, subtotal, vatPercent, ...rest } = parsed.data;

    const current = await prisma.payable.findUnique({ where: { id: req.params.id } });
    if (!current) {
      res.status(404).json({ message: "Documento no encontrado" });
      return;
    }
    assertRecordAccess(req, current);
    if (rest.providerId) await assertProviderInTenant(rest.providerId, current.daycareId);

    const sb = subtotal ?? current.subtotal;
    const vp = vatPercent ?? current.vatPercent;
    const vatAmount = sb * (vp / 100);
    const total = sb + vatAmount;
    const balance = total - current.paid;

    const p = await prisma.payable.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        subtotal: sb,
        vatPercent: vp,
        vatAmount,
        total,
        balance,
        invoiceDate:
          invoiceDate !== undefined ? (invoiceDate ? new Date(invoiceDate) : null) : undefined,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
        nextPayment:
          nextPayment !== undefined ? (nextPayment ? new Date(nextPayment) : null) : undefined,
      },
      include: { provider: { select: { id: true, name: true } } },
    });
    res.json(p);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

payablesRouter.delete("/:id", async (req, res) => {
  try {
    const current = await prisma.payable.findUnique({
      where: { id: req.params.id },
      select: { businessUnit: true, daycareId: true },
    });
    if (!current) {
      res.status(404).json({ message: "Documento no encontrado" });
      return;
    }
    assertRecordAccess(req, current);
    await prisma.payable.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  date: z.string().optional(),
  method: z.string().default("EFECTIVO"),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

payablesRouter.post("/:id/payments", async (req, res) => {
  try {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos" });
      return;
    }
    const { date, ...rest } = parsed.data;

    const payable = await prisma.payable.findUnique({ where: { id: req.params.id } });
    if (!payable) {
      res.status(404).json({ message: "Documento no encontrado" });
      return;
    }
    assertRecordAccess(req, payable);

    const payment = await prisma.payment.create({
      data: {
        payableId: req.params.id,
        date: date ? new Date(date) : new Date(),
        registeredBy: req.user!.username,
        ...rest,
      },
    });

    const newPaid = payable.paid + rest.amount;
    const newBalance = payable.total - newPaid;
    const newStatus = newBalance <= 0 ? "PAGADO" : "PARCIAL";

    await prisma.payable.update({
      where: { id: req.params.id },
      data: { paid: newPaid, balance: Math.max(0, newBalance), status: newStatus },
    });

    res.status(201).json(payment);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

payablesRouter.delete("/:id/payments/:pid", async (req, res) => {
  try {
    const payable = await prisma.payable.findUnique({ where: { id: req.params.id } });
    if (!payable) {
      res.status(404).json({ message: "Documento no encontrado" });
      return;
    }
    assertRecordAccess(req, payable);
    // The payment must belong to THIS payable. Without the payableId check, deleting a payment
    // by id adjusted the balance of whichever payable was named in the path.
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.pid, payableId: payable.id },
    });
    if (!payment) {
      res.status(404).json({ message: "Pago no encontrado" });
      return;
    }
    await prisma.payment.delete({ where: { id: req.params.pid } });
    if (payable) {
      const newPaid = payable.paid - payment.amount;
      const newBalance = payable.total - newPaid;
      const newStatus = newBalance <= 0 ? "PAGADO" : newPaid > 0 ? "PARCIAL" : "PENDIENTE";
      await prisma.payable.update({
        where: { id: req.params.id },
        data: { paid: Math.max(0, newPaid), balance: Math.max(0, newBalance), status: newStatus },
      });
    }
    res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
