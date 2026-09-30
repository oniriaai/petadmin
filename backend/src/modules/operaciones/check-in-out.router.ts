import { Router } from "express";
import { assertBusinessUnitAccess, getRequiredBusinessUnit, handleAuthzError } from "../../middleware/auth";
import { prisma } from "../../db";
import { assertRecordAccess, buildScopeWhere, getRequiredDaycareId } from "../../core/tenancy/scope";
import {
  createCheckInOutSchema,
  checkInSchema,
  checkOutSchema,
  updateNotesSchema,
} from "../../utils/schemas";
import {
  validatePetOwnership,
  validateRoomExists,
  validateRoomCapacity,
} from "../../utils/validation";

export const checkInOutRouter = Router();

/**
 * Helper to map Prisma CheckInOut to Frontend CheckInOutRecord
 */
function mapToFrontend(record: any) {
  let status: "PENDING" | "CHECKED_IN" | "CHECKED_OUT" = "PENDING";
  if (record.checkOutTime) status = "CHECKED_OUT";
  else if (record.checkInTime) status = "CHECKED_IN";

  return {
    id: record.id,
    petId: record.petId,
    petName: record.pet?.name || "Desconocido",
    clientId: record.clientId,
    clientName: record.client ? `${record.client.firstName} ${record.client.lastName}` : "Desconocido",
    roomId: record.roomId,
    roomName: record.room?.name,
    reservationId: record.reservationId,
    checkInTime: record.checkInTime?.toISOString(),
    checkOutTime: record.checkOutTime?.toISOString(),
    createdAt: record.createdAt?.toISOString(),
    status,
    notes: record.notes,
  };
}

/**
 * GET /api/v1/check-in-out
 * List check-in/out records for the list view (mapped for frontend)
 */
checkInOutRouter.get("/", async (req, res) => {
  try {
    const buWhere = buildScopeWhere(req);
    const { search } = req.query as Record<string, string>;

    const where: any = {
      ...buWhere,
      isActive: true,
    };

    if (search) {
      where.OR = [
        { pet: { name: { contains: search, mode: "insensitive" } } },
        { client: { firstName: { contains: search, mode: "insensitive" } } },
        { client: { lastName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const records = await prisma.checkInOut.findMany({
      where,
      include: {
        pet: { select: { id: true, name: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        room: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return res.json(records.map(mapToFrontend));
  } catch (error) {
    console.error("Error fetching check-in/out list:", error);
    return res.status(500).json({ message: "Error fetching list" });
  }
});

/**
 * POST /api/v1/check-in-out
 * Create a standalone CheckInOut record(s) for ad-hoc visits
 */
checkInOutRouter.post("/", async (req, res) => {
  try {
    const parsed = createCheckInOutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Datos inválidos",
        errors: parsed.error.flatten(),
      });
    }

    const bu = getRequiredBusinessUnit(req, req.body?.businessUnit);
    const { petId, petIds, clientId, roomId, reservationId, notes, checkInNow } = parsed.data;

    // Normalize to an array of pet IDs
    const finalPetIds = petIds && petIds.length > 0 ? petIds : (petId ? [petId] : []);
    
    if (finalPetIds.length === 0) {
      return res.status(400).json({ message: "Se requiere al menos una mascota" });
    }

    // Validate pet ownership
    const petOwnershipValidation = await validatePetOwnership(finalPetIds, clientId);
    if (!petOwnershipValidation.valid) {
      return res.status(400).json({ message: petOwnershipValidation.message });
    }

    // Validate room exists and belongs to business unit
    const roomValidation = await validateRoomExists(roomId, bu);
    if (!roomValidation.valid) {
      return res.status(400).json({ message: roomValidation.message });
    }

    const checkInTime = checkInNow ? new Date() : null;
    const daycareId = getRequiredDaycareId(req);

    // Create CheckInOut records in batch
    const createdRecords = await Promise.all(
      finalPetIds.map(id => 
        prisma.checkInOut.create({
          data: {
            petId: id,
            clientId,
            roomId,
            businessUnit: bu,
            daycareId,
            reservationId: reservationId || null,
            notes: notes || null,
            checkInTime,
            isActive: true,
          },
          include: {
            pet: { select: { id: true, name: true, species: true } },
            client: { select: { id: true, firstName: true, lastName: true } },
            room: { select: { id: true, name: true } },
          },
        })
      )
    );

    // If only one pet was requested, return a single object for backward compatibility (optional)
    // but the frontend api.ts seems to expect an array for .create
    // Let's return the first one if only one was sent, or the whole array.
    // Actually, checkInOutApi.create in frontend/src/lib/api.ts expects CheckInOutRecord[]
    return res.status(201).json(createdRecords.map(mapToFrontend));
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error("Error creating CheckInOut:", error);
    return res.status(500).json({ message: "Error creating check-in/out record" });
  }
});

/**
 * POST /api/v1/check-in-out/:id/check-in
 * Register a check-in by updating the CheckInOut record with check-in time
 */
checkInOutRouter.post("/:id/check-in", async (req, res) => {
  try {
    const parsed = checkInSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Datos inválidos",
        errors: parsed.error.flatten(),
      });
    }

    const { checkInTime: checkInTimeStr, performedByUserId, notes } = parsed.data;
    const checkInTime = checkInTimeStr ? new Date(checkInTimeStr) : new Date();

    // Get existing CheckInOut record
    const checkInOut = await prisma.checkInOut.findUnique({
      where: { id: req.params.id },
      include: { room: true, reservation: true },
    });

    if (!checkInOut) {
      return res.status(404).json({ message: "Registro de check-in/out no encontrado" });
    }

    // Verify business unit access
    assertRecordAccess(req, checkInOut);

    // Validate: no prior checkInTime
    if (checkInOut.checkInTime) {
      return res.status(400).json({ message: "Ya hay un check-in registrado para este registro" });
    }

    // Validate room capacity at check-in time
    if (checkInOut.room) {
      const capacityValidation = await validateRoomCapacity(
        checkInOut.roomId,
        checkInTime,
        checkInOut.checkOutTime || checkInTime,
        1
      );
      if (!capacityValidation.valid) {
        return res.status(400).json({ message: capacityValidation.message });
      }
    }

    // Update with check-in time
    const updated = await prisma.checkInOut.update({
      where: { id: req.params.id },
      data: {
        checkInTime,
        performedByUserId: performedByUserId || null,
        notes: notes || checkInOut.notes,
      },
      include: {
        pet: { select: { id: true, name: true, species: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        room: { select: { id: true, name: true } },
        performedByUser: { select: { id: true, name: true } },
      },
    });

    return res.json(mapToFrontend(updated));
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error("Error during check-in:", error);
    return res.status(500).json({ message: "Error registering check-in" });
  }
});

/**
 * POST /api/v1/check-in-out/:id/check-out
 * Register a check-out by updating the CheckInOut record with check-out time
 */
checkInOutRouter.post("/:id/check-out", async (req, res) => {
  try {
    const parsed = checkOutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Datos inválidos",
        errors: parsed.error.flatten(),
      });
    }

    const { checkOutTime: checkOutTimeStr, performedByUserId, notes } = parsed.data;
    const checkOutTime = checkOutTimeStr ? new Date(checkOutTimeStr) : new Date();

    // Get existing CheckInOut record
    const checkInOut = await prisma.checkInOut.findUnique({
      where: { id: req.params.id },
    });

    if (!checkInOut) {
      return res.status(404).json({ message: "Registro de check-in/out no encontrado" });
    }

    // Verify business unit access
    assertRecordAccess(req, checkInOut);

    // Validate: must have a checkInTime before checking out
    if (!checkInOut.checkInTime) {
      return res.status(400).json({ message: "Debe haber un check-in registrado antes del check-out" });
    }

    // Validate: checkOutTime > checkInTime
    if (checkOutTime < checkInOut.checkInTime) {
      return res.status(400).json({ message: "La hora de salida debe ser posterior a la hora de entrada" });
    }

    // Validate: no prior checkOutTime (only allow first check-out)
    if (checkInOut.checkOutTime) {
      return res.status(400).json({ message: "Ya hay un check-out registrado para este registro" });
    }

    // Update with check-out time
    const updated = await prisma.checkInOut.update({
      where: { id: req.params.id },
      data: {
        checkOutTime,
        performedByUserId: performedByUserId || null,
        notes: notes || checkInOut.notes,
      },
      include: {
        pet: { select: { id: true, name: true, species: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        room: { select: { id: true, name: true } },
        performedByUser: { select: { id: true, name: true } },
      },
    });

    return res.json(mapToFrontend(updated));
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error("Error during check-out:", error);
    return res.status(500).json({ message: "Error registering check-out" });
  }
});

/**
 * GET /api/v1/check-in-out/active
 * List currently checked-in pets (where checkOutTime is null)
 */
checkInOutRouter.get("/active", async (req, res) => {
  try {
    const buWhere = buildScopeWhere(req);
    const { roomId } = req.query as Record<string, string>;

    const where: Record<string, unknown> = {
      ...buWhere,
      checkInTime: { not: null },
      checkOutTime: null,
      isActive: true,
    };

    if (roomId) {
      where.roomId = roomId;
    }

    const active = await prisma.checkInOut.findMany({
      where,
      include: {
        pet: { select: { id: true, name: true, species: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        room: { select: { id: true, name: true } },
        reservation: { select: { id: true, service: true } },
        performedByUser: { select: { id: true, name: true } },
      },
      orderBy: { checkInTime: "asc" },
    });

    return res.json(active);
  } catch (error) {
    console.error("Error fetching active check-ins:", error);
    return res.status(500).json({ message: "Error fetching active check-ins" });
  }
});

/**
 * GET /api/v1/check-in-out/history
 * Query check-in/out history with filters
 */
checkInOutRouter.get("/history", async (req, res) => {
  try {
    const buWhere = buildScopeWhere(req);
    const {
      clientId, petId, roomId, reservationId, startDate, endDate,
      skip, take, offset, limit 
    } = req.query as Record<string, string>;

    const finalSkip = parseInt(offset || skip || "0");
    const finalTake = parseInt(limit || take || "50");

    const where: Record<string, unknown> = {
      ...buWhere,
      isActive: true,
    };

    if (clientId) where.clientId = clientId;
    if (petId) where.petId = petId;
    if (roomId) where.roomId = roomId;
    if (reservationId) where.reservationId = reservationId;

    if (startDate || endDate) {
      where.checkInTime = {};
      if (startDate) {
        (where.checkInTime as Record<string, any>).gte = new Date(startDate);
      }
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        (where.checkInTime as Record<string, any>).lte = endDateObj;
      }
    }

    const [checkInOuts, total] = await Promise.all([
      prisma.checkInOut.findMany({
        where,
        include: {
          pet: { select: { id: true, name: true, species: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
          room: { select: { id: true, name: true } },
          reservation: { select: { id: true, service: true } },
          performedByUser: { select: { id: true, name: true } },
        },
        orderBy: { checkInTime: "desc" },
        skip: finalSkip,
        take: finalTake,
      }),
      prisma.checkInOut.count({ where }),
    ]);

    return res.json({
      data: checkInOuts.map(mapToFrontend),
      pagination: {
        total,
        skip: finalSkip,
        take: finalTake,
      },
    });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error("Error fetching check-in/out history:", error);
    return res.status(500).json({ message: "Error fetching history" });
  }
});

/**
 * PUT /api/v1/check-in-out/:id/notes
 * Update notes on a CheckInOut record
 */
checkInOutRouter.put("/:id/notes", async (req, res) => {
  try {
    const parsed = updateNotesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Datos inválidos",
        errors: parsed.error.flatten(),
      });
    }

    const { notes } = parsed.data;

    // Get existing CheckInOut record
    const checkInOut = await prisma.checkInOut.findUnique({
      where: { id: req.params.id },
    });

    if (!checkInOut) {
      return res.status(404).json({ message: "Registro de check-in/out no encontrado" });
    }

    // Verify business unit access
    assertRecordAccess(req, checkInOut);

    // Update notes
    const updated = await prisma.checkInOut.update({
      where: { id: req.params.id },
      data: { notes },
      include: {
        pet: { select: { id: true, name: true, species: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        room: { select: { id: true, name: true } },
      },
    });

    return res.json(updated);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error("Error updating notes:", error);
    return res.status(500).json({ message: "Error updating notes" });
  }
});

/**
 * GET /api/v1/check-in-out/:id
 * Get a specific CheckInOut record
 */
checkInOutRouter.get("/:id", async (req, res) => {
  try {
    const checkInOut = await prisma.checkInOut.findUnique({
      where: { id: req.params.id },
      include: {
        pet: true,
        client: true,
        room: true,
        reservation: true,
        performedByUser: { select: { id: true, name: true } },
      },
    });

    if (!checkInOut) {
      return res.status(404).json({ message: "Registro de check-in/out no encontrado" });
    }

    // Verify business unit access
    assertRecordAccess(req, checkInOut);

    return res.json(checkInOut);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error("Error fetching CheckInOut:", error);
    return res.status(500).json({ message: "Error fetching record" });
  }
});
