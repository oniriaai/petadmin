import { Router } from "express";
import { z } from "zod";
import { getRequiredBusinessUnit, handleAuthzError } from "../../middleware/auth";
import { prisma } from "../../db";
import { assertRecordAccess, buildScopeWhere, getRequiredDaycareId } from "../../core/tenancy/scope";
import { withVerifiedScope } from "../../core/tenancy/guard";

export const roomsRouter = Router();

const schema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1),
  type: z.string(),
  isActive: z.boolean().optional(),
});

roomsRouter.get("/", async (req, res) => {
  try {
  const { status } = req.query as Record<string, string>;

  const where: Record<string, unknown> = buildScopeWhere(req);
  if (status === "active") where.isActive = true;
  else if (status === "inactive") where.isActive = false;

  const rooms = await prisma.room.findMany({
    where,
    orderBy: { name: "asc" },
  });

  // Calculate current occupancy for each room based on active check-ins or active reservations.
  // For rooms with physical check-in tracking (daycare), prefer CheckInOut records.
  // For all rooms, also count reservations in any "in-progress" status for the modular architecture.
  const ACTIVE_STATUSES = ["ACTIVA", "RECEPCIONADA", "EN_PROCESO"];
  const now = new Date();
  const roomsWithOccupancy = await Promise.all(
    rooms.map(async (room) => {
      // Primary: count via active CheckInOut records (most accurate for daycare)
      const activeCheckIns = await withVerifiedScope(
        "room.id comes from the tenant-scoped findMany above",
        () =>
          prisma.checkInOut.count({
            where: {
              roomId: room.id,
              isActive: true,
              checkOutTime: null,
            },
          }),
      );

      // Fallback / supplement: count via active reservation pets (covers peluquería kanban flow
      // where check-in records may not be created per-pet but reservation status is set directly)
      const activeReservations = await withVerifiedScope(
        "room.id comes from the tenant-scoped findMany above",
        () =>
          prisma.reservation.findMany({
            where: {
              roomId: room.id,
              status: { in: ACTIVE_STATUSES },
              checkIn: { lte: now },
              checkOut: { gte: now },
            },
            include: { pets: true },
          }),
      );
      const reservationPets = activeReservations.reduce((sum, r) => sum + r.pets.length, 0);

      // Use the higher of the two counts to avoid double-counting when both sources exist
      const totalPets = Math.max(activeCheckIns, reservationPets);
      return {
        ...room,
        currentOccupancy: totalPets,
        availableCapacity: Math.max(0, room.capacity - totalPets),
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
  assertRecordAccess(req, room);
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
  const room = await prisma.room.create({ data: { ...parsed.data, businessUnit: bu, daycareId: getRequiredDaycareId(req) } });
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
  assertRecordAccess(req, room);

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
  assertRecordAccess(req, room);

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
