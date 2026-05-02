import { prisma } from "../db";

/**
 * Validates that all provided pet IDs belong to the specified client
 */
export async function validatePetOwnership(
  petIds: string[],
  clientId: string
): Promise<{ valid: boolean; message?: string }> {
  const pets = await prisma.pet.findMany({
    where: { id: { in: petIds }, clientId },
  });

  if (pets.length !== petIds.length) {
    return {
      valid: false,
      message: "Una o más mascotas no pertenecen a este cliente",
    };
  }

  return { valid: true };
}

/**
 * Validates that a room exists and belongs to the specified business unit
 */
export async function validateRoomExists(
  roomId: string,
  businessUnit?: string
): Promise<{ valid: boolean; room?: any; message?: string }> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });

  if (!room) {
    return {
      valid: false,
      message: "Sala no encontrada",
    };
  }

  if (businessUnit && room.businessUnit !== businessUnit) {
    return {
      valid: false,
      message: "No tienes acceso a esta sala",
    };
  }

  return { valid: true, room };
}

/**
 * Validates room capacity at a given check-in time
 * Counts current occupancy and checks if adding new pets exceeds capacity
 */
export async function validateRoomCapacity(
  roomId: string,
  checkInTime: Date,
  checkOutTime: Date,
  petCount: number,
  excludeReservationId?: string
): Promise<{ valid: boolean; availableCapacity?: number; message?: string }> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });

  if (!room) {
    return {
      valid: false,
      message: "Sala no encontrada",
    };
  }

  // Count active reservations that overlap with the given time period
  const occupancyReservations = await prisma.reservation.findMany({
    where: {
      roomId,
      id: excludeReservationId ? { not: excludeReservationId } : undefined,
      status: "ACTIVA",
      checkIn: { lte: checkInTime },
      checkOut: { gte: checkInTime },
    },
    include: { pets: true },
  });

  // Also count active check-in/outs that overlap with the given time period
  const occupancyCheckInOuts = await prisma.checkInOut.findMany({
    where: {
      roomId,
      businessUnit: room.businessUnit,
      checkInTime: { lte: checkOutTime },
      checkOutTime: { gte: checkInTime },
      isActive: true,
    },
  });

  const reservationPetCount = occupancyReservations.reduce(
    (sum, r) => sum + r.pets.length,
    0
  );
  const checkInOutCount = occupancyCheckInOuts.filter(
    (c: any) => c.checkOutTime === null || c.checkOutTime >= checkInTime
  ).length;

  const totalOccupancy = reservationPetCount + checkInOutCount + petCount;

  if (totalOccupancy > room.capacity) {
    const availableCapacity = room.capacity - reservationPetCount - checkInOutCount;
    return {
      valid: false,
      availableCapacity: Math.max(0, availableCapacity),
      message: `Capacidad de la sala excedida. Disponible: ${availableCapacity}/${room.capacity}`,
    };
  }

  return { valid: true, availableCapacity: room.capacity - totalOccupancy };
}

/**
 * Checks for conflicting reservations in a room during a time period
 */
export async function validateNoReservationConflicts(
  roomId: string,
  checkInTime: Date,
  checkOutTime: Date,
  excludeReservationId?: string
): Promise<{ valid: boolean; message?: string }> {
  const conflicts = await prisma.reservation.count({
    where: {
      roomId,
      id: excludeReservationId ? { not: excludeReservationId } : undefined,
      status: { not: "CANCELADA" },
      checkIn: { lt: checkOutTime },
      checkOut: { gt: checkInTime },
    },
  });

  if (conflicts > 0) {
    return {
      valid: false,
      message: "Conflicto de horario: la sala está ocupada en esas fechas",
    };
  }

  return { valid: true };
}
