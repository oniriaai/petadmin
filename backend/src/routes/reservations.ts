import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const reservationsRouter = Router();
reservationsRouter.use(requireAuth);

const reservationSchema = z.object({
  clientId: z.string(),
  petIds: z.array(z.string()).min(1),
  roomId: z.string().optional(),
  service: z.string(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  needsTransport: z.boolean().optional(),
  transportType: z.string().optional(),
  transportAddress: z.string().optional(),
  concept: z.string().optional(),
  notes: z.string().optional(),
  label: z.string().optional(),
  paymentMethod: z.string().optional(),
  discountAmount: z.number().optional(),
  advanceAmount: z.number().optional(),
  basePrice: z.number().optional(),
  vatPercent: z.number().optional(),
});

reservationsRouter.get("/", async (req, res) => {
  const bu = req.user!.businessUnit;
  const { status, date, search } = req.query as Record<string, string>;

  const where: Record<string, unknown> = { businessUnit: bu };
  if (status) where.status = status;
  if (date) {
    const d = new Date(date);
    const end = new Date(date);
    d.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    where.checkIn = { gte: d, lte: end };
  }
  if (search) {
    where.client = { OR: [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
    ]};
  }

  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      client: { select: { id: true, firstName: true, lastName: true, phone: true, whatsapp: true } },
      pets: { include: { pet: { select: { id: true, name: true, species: true, breed: true } } } },
      room: { select: { id: true, name: true } },
    },
    orderBy: { checkIn: "asc" },
  });
  res.json(reservations);
});

reservationsRouter.get("/:id", async (req, res) => {
  const r = await prisma.reservation.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
      pets: { include: { pet: true } },
      room: true,
      incomes: true,
    },
  });
  if (!r) { res.status(404).json({ message: "Reserva no encontrada" }); return; }
  res.json(r);
});

reservationsRouter.post("/", async (req, res) => {
  const parsed = reservationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() }); return; }
  const bu = req.user!.businessUnit;
  const { petIds, checkIn, checkOut, vatPercent = 15, basePrice = 0, discountAmount = 0, advanceAmount = 0, ...rest } = parsed.data;

  const vatAmount = (basePrice - discountAmount) * (vatPercent / 100);
  const totalAmount = basePrice - discountAmount + vatAmount;
  const pendingAmount = totalAmount - advanceAmount;

  const reservation = await prisma.reservation.create({
    data: {
      ...rest,
      businessUnit: bu,
      checkIn: checkIn ? new Date(checkIn) : null,
      checkOut: checkOut ? new Date(checkOut) : null,
      vatPercent,
      basePrice,
      discountAmount,
      advanceAmount,
      vatAmount,
      totalAmount,
      pendingAmount,
      pets: { create: petIds.map(petId => ({ petId })) },
    },
    include: { client: true, pets: { include: { pet: true } }, room: true },
  });
  res.status(201).json(reservation);
});

reservationsRouter.put("/:id", async (req, res) => {
  const parsed = reservationSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const { petIds, checkIn, checkOut, basePrice, vatPercent, discountAmount, advanceAmount, ...rest } = parsed.data;

  const current = await prisma.reservation.findUnique({ where: { id: req.params.id } });
  if (!current) { res.status(404).json({ message: "Reserva no encontrada" }); return; }

  const bp = basePrice ?? current.basePrice;
  const vp = vatPercent ?? current.vatPercent;
  const da = discountAmount ?? current.discountAmount;
  const aa = advanceAmount ?? current.advanceAmount;
  const vatAmount = (bp - da) * (vp / 100);
  const totalAmount = bp - da + vatAmount;
  const pendingAmount = totalAmount - aa;

  const data: Record<string, unknown> = {
    ...rest,
    checkIn: checkIn ? new Date(checkIn) : undefined,
    checkOut: checkOut ? new Date(checkOut) : undefined,
    basePrice: bp, vatPercent: vp, discountAmount: da, advanceAmount: aa,
    vatAmount, totalAmount, pendingAmount,
  };

  if (petIds) {
    await prisma.reservationPet.deleteMany({ where: { reservationId: req.params.id } });
    data.pets = { create: petIds.map(petId => ({ petId })) };
  }

  const reservation = await prisma.reservation.update({
    where: { id: req.params.id },
    data,
    include: { client: true, pets: { include: { pet: true } }, room: true },
  });
  res.json(reservation);
});

reservationsRouter.post("/:id/checkin", async (req, res) => {
  const r = await prisma.reservation.update({
    where: { id: req.params.id },
    data: { status: "ACTIVA", checkIn: req.body.time ? new Date(req.body.time) : new Date() },
  });
  res.json(r);
});

reservationsRouter.post("/:id/checkout", async (req, res) => {
  const { time, createIncome, paymentMethod } = req.body;
  const r = await prisma.reservation.update({
    where: { id: req.params.id },
    data: { status: "COMPLETADA", checkOut: time ? new Date(time) : new Date() },
    include: { client: true },
  });
  if (createIncome) {
    await prisma.income.create({
      data: {
        businessUnit: r.businessUnit,
        reservationId: r.id,
        type: "RESERVA",
        concept: `Reserva ${r.service} - ${r.client.firstName} ${r.client.lastName}`,
        amount: r.totalAmount,
        vatPercent: r.vatPercent,
        vatAmount: r.vatAmount,
        total: r.totalAmount,
        paymentMethod: paymentMethod ?? r.paymentMethod ?? "EFECTIVO",
        invoiceStatus: "PENDIENTE",
      },
    });
  }
  res.json(r);
});

reservationsRouter.patch("/:id/status", async (req, res) => {
  const { status } = req.body;
  const r = await prisma.reservation.update({ where: { id: req.params.id }, data: { status } });
  res.json(r);
});

reservationsRouter.delete("/:id", async (req, res) => {
  await prisma.reservation.update({ where: { id: req.params.id }, data: { status: "CANCELADA" } });
  res.json({ ok: true });
});
