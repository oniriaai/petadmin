import { Router } from "express";
import { z } from "zod";
import { assertBusinessUnitAccess, buildBusinessUnitWhere, getRequiredBusinessUnit, handleAuthzError, requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const roomsRouter = Router();
roomsRouter.use(requireAuth);

const schema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1),
  type: z.string(),
  isActive: z.boolean().optional(),
});

roomsRouter.get("/", async (req, res) => {
  try {
  const { status } = req.query as Record<string, string>;

  const where: Record<string, unknown> = buildBusinessUnitWhere(req);
  if (status === "active") where.isActive = true;
  else if (status === "inactive") where.isActive = false;

  const rooms = await prisma.room.findMany({
    where,
    orderBy: { name: "asc" },
  });

  // Calculate current occupancy for each room (based on number of pets)
  const now = new Date();
  const roomsWithOccupancy = await Promise.all(
    rooms.map(async (room) => {
      const activeReservations = await prisma.reservation.findMany({
        where: {
          roomId: room.id,
          status: "ACTIVA",
          checkIn: { lte: now },
          checkOut: { gte: now },
        },
        include: { pets: true },
      });
      const totalPets = activeReservations.reduce((sum, r) => sum + r.pets.length, 0);
      return {
        ...room,
        currentOccupancy: totalPets,
        availableCapacity: room.capacity - totalPets,
      };
    })
  );

  res.json(roomsWithOccupancy);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

roomsRouter.get("/:id", async (req, res) => {
  try {
  const room = await prisma.room.findUnique({
    where: { id: req.params.id },
    include: {
      reservations: {
        where: { status: { in: ["ACTIVA", "PENDIENTE"] } },
        select: { id: true, checkIn: true, checkOut: true, status: true },
      },
    },
  });
  if (!room) { res.status(404).json({ message: "Sala no encontrada" }); return; }
  assertBusinessUnitAccess(req, room.businessUnit);
  res.json(room);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

roomsRouter.post("/", async (req, res) => {
  try {
  const bu = getRequiredBusinessUnit(req, req.body?.businessUnit);
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const room = await prisma.room.create({ data: { ...parsed.data, businessUnit: bu } });
  res.status(201).json(room);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

roomsRouter.put("/:id", async (req, res) => {
  try {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }

  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room) { res.status(404).json({ message: "Sala no encontrada" }); return; }
  assertBusinessUnitAccess(req, room.businessUnit);

  const updated = await prisma.room.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(updated);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

roomsRouter.delete("/:id", async (req, res) => {
  try {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room) { res.status(404).json({ message: "Sala no encontrada" }); return; }
  assertBusinessUnitAccess(req, room.businessUnit);

  // Soft delete by marking as inactive
  await prisma.room.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
