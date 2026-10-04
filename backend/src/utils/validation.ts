import { prisma } from "../db";
import { AuthzError } from "../middleware/auth";

/**
 * Validates that all provided pet IDs belong to the specified client **of this daycare**.
 *
 * `daycareId` is required, not optional. Without it this checked only pet-belongs-to-client,
 * and both the client and the pets came from the request body: a tenant could pass another
 * daycare's clientId and petIds, pass the check (they do belong to each other), and have a
 * reservation written into its own tenant pointing at the other's records — which also echoed
 * the other tenant's pet names back in the response concept.
 */
export async function validatePetOwnership(
  petIds: string[],
  clientId: string,
  daycareId: string,
): Promise<{ valid: boolean; message?: string }> {
  const pets = await prisma.pet.findMany({
    where: { id: { in: petIds }, clientId, daycareId },
  });

  if (pets.length !== petIds.length) {
    return {
      valid: false,
      message: "Una o más mascotas no pertenecen a este cliente",
    };
  }

  const deceased = pets.find((pet) => pet.deceasedAt);
  if (deceased) {
    return { valid: false, message: deceasedPetMessage(deceased.name) };
  }

  return { valid: true };
}

function deceasedPetMessage(name: string): string {
  return `${name} figura como fallecida en la historia clínica`;
}

/**
 * Refuses to book a pet the clinic has recorded as deceased.
 *
 * Takes the rows the caller already resolved against the tenant, so it adds no query.
 */
export function assertPetsAlive(pets: { name: string; deceasedAt: Date | null }[]): void {
  const deceased = pets.find((pet) => pet.deceasedAt);
  if (deceased) throw new AuthzError(409, deceasedPetMessage(deceased.name));
}

/**
 * Resolves a client that must belong to this daycare, or refuses.
 *
 * A 404 rather than a 403, matching the rule the rest of the product follows: another tenant's
 * record reads as absent rather than as forbidden, so the response does not confirm it exists.
 */
export async function assertClientInTenant(clientId: string, daycareId: string): Promise<void> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, daycareId },
    select: { id: true },
  });
  if (!client) {
    throw new AuthzError(404, "Cliente no encontrado");
  }
}

/**
 * Resolves a veterinarian that must belong to this daycare, or refuses with the same 404 a
 * foreign client gets.
 */
export async function assertVeterinarianInTenant(
  veterinarianId: string,
  daycareId: string,
): Promise<void> {
  const veterinarian = await prisma.veterinarian.findFirst({
    where: { id: veterinarianId, daycareId },
    select: { id: true },
  });
  if (!veterinarian) {
    throw new AuthzError(404, "Veterinario no encontrado");
  }
}

/**
 * Validates that a room exists, belongs to THIS daycare, and serves the given business unit.
 *
 * `daycareId` is required. The room was previously looked up by id alone and checked only
 * against `businessUnit` — but every daycare has a DAYCARE and/or GROOMING unit, so a tenant
 * could pass another daycare's roomId, pass this check, and go on to book into that room and
 * have its capacity computed from the other tenant's occupancy.
 */
export async function validateRoomExists(
  roomId: string,
  daycareId: string,
  businessUnit?: string,
): Promise<{ valid: boolean; room?: any; message?: string }> {
  const room = await prisma.room.findFirst({
    where: { id: roomId, daycareId },
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
  daycareId: string,
  checkInTime: Date,
  checkOutTime: Date,
  petCount: number,
  excludeReservationId?: string,
): Promise<{ valid: boolean; availableCapacity?: number; message?: string }> {
  const room = await prisma.room.findFirst({
    where: { id: roomId, daycareId },
  });

  if (!room) {
    return {
      valid: false,
      message: "Sala no encontrada",
    };
  }

  // Count active reservations that overlap with the given time period
  // Occupancy is counted within the tenant. Without `daycareId` a room id shared across
  // tenants (or simply the wrong tenant's room) would mix another daycare's stays into this
  // one's capacity maths, which the product treats as a hard physical limit.
  const occupancyReservations = await prisma.reservation.findMany({
    where: {
      daycareId,
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
      daycareId,
      roomId,
      businessUnit: room.businessUnit,
      checkInTime: { lte: checkOutTime },
      checkOutTime: { gte: checkInTime },
      isActive: true,
    },
  });

  const reservationPetCount = occupancyReservations.reduce((sum, r) => sum + r.pets.length, 0);
  const checkInOutCount = occupancyCheckInOuts.filter(
    (c: any) => c.checkOutTime === null || c.checkOutTime >= checkInTime,
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
  daycareId: string,
  checkInTime: Date,
  checkOutTime: Date,
  excludeReservationId?: string,
): Promise<{ valid: boolean; message?: string }> {
  const conflicts = await prisma.reservation.count({
    where: {
      daycareId,
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
