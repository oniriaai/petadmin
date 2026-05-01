import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
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
  const bu = req.user!.businessUnit;
  const { status } = req.query as Record<string, string>;

  const where: Record<string, unknown> = { businessUnit: bu };
  if (status === "active") where.isActive = true;
  else if (status === "inactive") where.isActive = false;

  const rooms = await prisma.room.findMany({
    where,
    orderBy: { name: "asc" },
  });

  // Calculate current occupancy for each room
  const now = new Date();
  const roomsWithOccupancy = await Promise.all(
    rooms.map(async (room) => {
      const activeReservations = await prisma.reservation.count({
        where: {
          roomId: room.id,
          status: "ACTIVA",
          checkIn: { lte: now },
          checkOut: { gte: now },
        },
      });
      return {
        ...room,
        currentOccupancy: activeReservations,
        availableCapacity: room.capacity - activeReservations,
      };
    })
  );

  res.json(roomsWithOccupancy);
});

roomsRouter.get("/:id", async (req, res) => {
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
  res.json(room);
});

roomsRouter.post("/", async (req, res) => {
  const bu = req.user!.businessUnit;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const room = await prisma.room.create({ data: { ...parsed.data, businessUnit: bu } });
  res.status(201).json(room);
});

roomsRouter.put("/:id", async (req, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }

  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room) { res.status(404).json({ message: "Sala no encontrada" }); return; }

  const updated = await prisma.room.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(updated);
});

roomsRouter.delete("/:id", async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room) { res.status(404).json({ message: "Sala no encontrada" }); return; }

  // Soft delete by marking as inactive
  await prisma.room.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ ok: true });
});
