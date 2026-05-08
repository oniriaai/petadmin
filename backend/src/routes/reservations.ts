import { Router } from "express";
import { z } from "zod";
import { assertBusinessUnitAccess, buildBusinessUnitWhere, getRequiredBusinessUnit, handleAuthzError, requireAuth } from "../middleware/auth";
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
  try {
  const { status, date, search } = req.query as Record<string, string>;

  const where: Record<string, unknown> = buildBusinessUnitWhere(req);
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
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

reservationsRouter.get("/:id", async (req, res) => {
  try {
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
  assertBusinessUnitAccess(req, r.businessUnit);
  res.json(r);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

reservationsRouter.post("/", async (req, res) => {
  try {
  const parsed = reservationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() }); return; }
  const bu = getRequiredBusinessUnit(req, req.body?.businessUnit);
  const { petIds, checkIn, checkOut, roomId, clientId, vatPercent = 15, basePrice = 0, discountAmount = 0, advanceAmount = 0, ...rest } = parsed.data;

  // Validate all pets belong to the client
  const pets = await prisma.pet.findMany({
    where: { id: { in: petIds }, clientId },
  });
  if (pets.length !== petIds.length) {
    res.status(400).json({ message: "Una o más mascotas no pertenecen a este cliente" });
    return;
  }

  // Validate room capacity and conflicts if room is specified
  if (roomId && checkIn && checkOut) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) { res.status(404).json({ message: "Sala no encontrada" }); return; }
    if (room.businessUnit !== bu) { res.status(400).json({ message: "La sala no pertenece a la unidad seleccionada" }); return; }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    // Check for conflicts (overlapping reservations)
    const conflicts = await prisma.reservation.count({
      where: {
        roomId,
        status: { not: "CANCELADA" },
        checkIn: { lt: checkOutDate },
        checkOut: { gt: checkInDate },
      },
    });
    if (conflicts > 0) {
      res.status(400).json({ message: "Conflicto de horario: la sala está ocupada en esas fechas" });
      return;
    }

    // Check capacity at check-in time (count total pets in active reservations at that moment)
    const occupancyReservations = await prisma.reservation.findMany({
      where: {
        roomId,
        status: "ACTIVA",
        checkIn: { lte: checkInDate },
        checkOut: { gte: checkInDate },
      },
      include: { pets: true },
    });
    const occupancy = occupancyReservations.reduce((sum, r) => sum + r.pets.length, 0) + petIds.length;
    if (occupancy > room.capacity) {
      res.status(400).json({ message: `Capacidad de la sala excedida. Disponible: ${room.capacity - occupancy + petIds.length}/${room.capacity}` });
      return;
    }
  }

  const vatAmount = (basePrice - discountAmount) * (vatPercent / 100);
  const totalAmount = basePrice - discountAmount + vatAmount;
  const pendingAmount = totalAmount - advanceAmount;

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      // Create reservation
      const res = await tx.reservation.create({
        data: {
          ...rest,
          businessUnit: bu,
          clientId,
          roomId: roomId || null,
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

      // Create CheckInOut records for each pet
      await Promise.all(
        petIds.map(petId =>
          tx.checkInOut.create({
            data: {
              petId,
              clientId,
              roomId: roomId || '',
              reservationId: res.id,
              businessUnit: bu,
              isActive: true,
            },
          })
        )
      );

      return res;
    });
    res.status(201).json(reservation);
  } catch (error) {
    console.error("Error creating reservation with CheckInOut:", error);
    res.status(500).json({ message: "Error creando reserva" });
  }
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

reservationsRouter.put("/:id", async (req, res) => {
  try {
  const parsed = reservationSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const { petIds, checkIn, checkOut, roomId, clientId, basePrice, vatPercent, discountAmount, advanceAmount, ...rest } = parsed.data;

  const current = await prisma.reservation.findUnique({ where: { id: req.params.id }, include: { pets: true } });
  if (!current) { res.status(404).json({ message: "Reserva no encontrada" }); return; }
  assertBusinessUnitAccess(req, current.businessUnit);

  // Validate pets belong to client if changing
  if (petIds && clientId) {
    const pets = await prisma.pet.findMany({
      where: { id: { in: petIds }, clientId },
    });
    if (pets.length !== petIds.length) {
      res.status(400).json({ message: "Una o más mascotas no pertenecen a este cliente" });
      return;
    }
  } else if (petIds && !clientId) {
    const pets = await prisma.pet.findMany({
      where: { id: { in: petIds }, clientId: current.clientId },
    });
    if (pets.length !== petIds.length) {
      res.status(400).json({ message: "Una o más mascotas no pertenecen a este cliente" });
      return;
    }
  }

  // Validate room capacity and conflicts if room is being changed
  const newRoomId = roomId ?? current.roomId;
  const newCheckIn = checkIn ? new Date(checkIn) : current.checkIn;
  const newCheckOut = checkOut ? new Date(checkOut) : current.checkOut;

  if (newRoomId && newCheckIn && newCheckOut) {
    const room = await prisma.room.findUnique({ where: { id: newRoomId } });
    if (!room) { res.status(404).json({ message: "Sala no encontrada" }); return; }
    if (room.businessUnit !== current.businessUnit) { res.status(400).json({ message: "La sala no pertenece a la unidad de la reserva" }); return; }

    // Check for conflicts with other reservations (exclude current)
    const conflicts = await prisma.reservation.count({
      where: {
        roomId: newRoomId,
        id: { not: req.params.id },
        status: { not: "CANCELADA" },
        checkIn: { lt: newCheckOut },
        checkOut: { gt: newCheckIn },
      },
    });
    if (conflicts > 0) {
      res.status(400).json({ message: "Conflicto de horario: la sala está ocupada en esas fechas" });
      return;
    }

    // Check capacity at check-in time (count total pets in active reservations, excluding current reservation)
    const newPetIds = petIds || (current.pets?.map(p => p.petId) ?? []);
    const occupancyReservations = await prisma.reservation.findMany({
      where: {
        roomId: newRoomId,
        id: { not: req.params.id },
        status: "ACTIVA",
        checkIn: { lte: newCheckIn },
        checkOut: { gte: newCheckIn },
      },
      include: { pets: true },
    });
    const occupancy = occupancyReservations.reduce((sum, r) => sum + r.pets.length, 0) + newPetIds.length;
    if (occupancy > room.capacity) {
      res.status(400).json({ message: `Capacidad de la sala excedida. Disponible: ${room.capacity - occupancy + newPetIds.length}/${room.capacity}` });
      return;
    }
  }

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
    roomId: roomId !== undefined ? (roomId || null) : undefined,
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
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

reservationsRouter.post("/:id/checkin", async (req, res) => {
  try {
  const reservation = await prisma.reservation.findUnique({
    where: { id: req.params.id },
    include: { pets: { include: { pet: true } }, room: true },
  });
  if (!reservation) { res.status(404).json({ message: "Reserva no encontrada" }); return; }
  assertBusinessUnitAccess(req, reservation.businessUnit);

  const checkInTime = req.body.time ? new Date(req.body.time) : new Date();

  // Validate room capacity at check-in time if room is assigned
  if (reservation.roomId && reservation.room) {
    const occupancy = await prisma.reservation.count({
      where: {
        roomId: reservation.roomId,
        status: "ACTIVA",
        checkIn: { lte: checkInTime },
        checkOut: { gte: checkInTime },
      },
    });
    if (occupancy >= reservation.room.capacity) {
      res.status(400).json({
        message: `Capacidad de la sala excedida. La sala está a capacidad máxima (${reservation.room.capacity}/${reservation.room.capacity}).`,
      });
      return;
    }
  }

  const r = await prisma.reservation.update({
    where: { id: req.params.id },
    data: { status: "ACTIVA", checkIn: checkInTime },
    include: { client: true, room: true, pets: { include: { pet: true } } },
  });

  // Update linked CheckInOut records
  await prisma.checkInOut.updateMany({
    where: { reservationId: req.params.id },
    data: { checkInTime },
  });

  res.json(r);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

reservationsRouter.post("/:id/checkout", async (req, res) => {
  try {
  const { time, createIncome, paymentMethod } = req.body;
  const checkOutTime = time ? new Date(time) : new Date();

  const current = await prisma.reservation.findUnique({ where: { id: req.params.id }, select: { businessUnit: true } });
  if (!current) { res.status(404).json({ message: "Reserva no encontrada" }); return; }
  assertBusinessUnitAccess(req, current.businessUnit);

  const r = await prisma.reservation.update({
    where: { id: req.params.id },
    data: { status: "COMPLETADA", checkOut: checkOutTime },
    include: { client: true },
  });

  // Update linked CheckInOut records
  await prisma.checkInOut.updateMany({
    where: { reservationId: req.params.id },
    data: { checkOutTime },
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
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

reservationsRouter.patch("/:id/status", async (req, res) => {
  try {
  const { status } = req.body;
  const current = await prisma.reservation.findUnique({ where: { id: req.params.id }, select: { businessUnit: true } });
  if (!current) { res.status(404).json({ message: "Reserva no encontrada" }); return; }
  assertBusinessUnitAccess(req, current.businessUnit);
  const r = await prisma.reservation.update({ where: { id: req.params.id }, data: { status } });
  res.json(r);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

reservationsRouter.delete("/:id", async (req, res) => {
  try {
  const current = await prisma.reservation.findUnique({ where: { id: req.params.id }, select: { businessUnit: true } });
  if (!current) { res.status(404).json({ message: "Reserva no encontrada" }); return; }
  assertBusinessUnitAccess(req, current.businessUnit);
  await prisma.reservation.update({ where: { id: req.params.id }, data: { status: "CANCELADA" } });
  res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
