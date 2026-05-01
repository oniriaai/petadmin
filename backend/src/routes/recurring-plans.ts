import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const recurringPlansRouter = Router();
recurringPlansRouter.use(requireAuth);

const recurringPlanSchema = z.object({
  clientId: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  daysOfWeek: z.string().min(1, "Selecciona al menos un día"),
  petIds: z.string().min(1, "Selecciona al menos una mascota"),
  service: z.string().default("GUARDERIA"),
  roomId: z.string().optional(),
  notes: z.string().optional(),
});

recurringPlansRouter.get("/", async (req, res) => {
  const bu = req.user!.businessUnit;
  const { status, clientId } = req.query as Record<string, string>;

  const where: Record<string, unknown> = { businessUnit: bu };
  if (status === "active") where.isActive = true;
  else if (status === "inactive") where.isActive = false;
  if (clientId) where.clientId = clientId;

  const plans = await prisma.recurringPlan.findMany({
    where,
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      room: { select: { id: true, name: true } },
      reservations: { select: { id: true, checkIn: true, checkOut: true, status: true } },
    },
    orderBy: { startDate: "desc" },
  });
  res.json(plans);
});

recurringPlansRouter.get("/:id", async (req, res) => {
  const plan = await prisma.recurringPlan.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
      room: true,
      reservations: { include: { pets: { include: { pet: true } }, client: true } },
    },
  });
  if (!plan) { res.status(404).json({ message: "Plan no encontrado" }); return; }
  res.json(plan);
});

recurringPlansRouter.post("/", async (req, res) => {
  const parsed = recurringPlanSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() }); return; }

  const bu = req.user!.businessUnit;
  const { clientId, startDate, endDate, daysOfWeek, petIds, service, roomId, notes } = parsed.data;

  // Verify client exists and belongs to business unit
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) { res.status(404).json({ message: "Cliente no encontrado" }); return; }

  // Verify room exists if provided
  if (roomId) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) { res.status(404).json({ message: "Sala no encontrada" }); return; }
  }

  const plan = await prisma.recurringPlan.create({
    data: {
      businessUnit: bu,
      clientId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      daysOfWeek,
      petIds,
      service,
      roomId: roomId || null,
      notes,
      isActive: true,
    },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      room: { select: { id: true, name: true } },
    },
  });
  res.status(201).json(plan);
});

recurringPlansRouter.put("/:id", async (req, res) => {
  const parsed = recurringPlanSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }

  const plan = await prisma.recurringPlan.findUnique({ where: { id: req.params.id } });
  if (!plan) { res.status(404).json({ message: "Plan no encontrado" }); return; }

  const { roomId, clientId, ...rest } = parsed.data;

  // Verify room exists if provided
  if (roomId) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) { res.status(404).json({ message: "Sala no encontrada" }); return; }
  }

  // Verify client exists if changing
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) { res.status(404).json({ message: "Cliente no encontrado" }); return; }
  }

  const updated = await prisma.recurringPlan.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(clientId && { clientId }),
      ...(roomId !== undefined && { roomId: roomId || null }),
    },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      room: { select: { id: true, name: true } },
      reservations: { select: { id: true, status: true } },
    },
  });
  res.json(updated);
});

recurringPlansRouter.patch("/:id/status", async (req, res) => {
  const { isActive } = req.body;
  const plan = await prisma.recurringPlan.update({
    where: { id: req.params.id },
    data: { isActive },
  });
  res.json(plan);
});

recurringPlansRouter.delete("/:id", async (req, res) => {
  // Soft delete by marking as inactive
  await prisma.recurringPlan.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ ok: true });
});
