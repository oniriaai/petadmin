import { prisma } from "../../db";
import type { BusinessUnit } from "../../middleware/auth";

/**
 * The accounting/brand slot this module books under. Declared once here so the per-tenant
 * scoping work has a single place to replace with a request-derived value.
 */
export const GUARDERIA_BUSINESS_UNIT: BusinessUnit = "DAYCARE";

export interface DaycareCheckInDTO {
  daycareId: string;
  petId: string;
  clientId: string;
  roomId: string;
  reservationId?: string;
  checkInTime?: string;
  performedByUserId?: string;
  notes?: string;
}

export interface DaycareCheckOutDTO {
  daycareId: string;
  checkInOutId: string;
  checkOutTime?: string;
  performedByUserId?: string;
  createIncome?: boolean;
  paymentMethod?: string;
  amount?: number;
  notes?: string;
}

export class DaycareAttendanceService {
  /**
   * Obtiene la ocupación en tiempo real por cada sala de Guardería (unidad de guardería)
   */
  static async getLiveOccupancy(daycareId: string) {
    const rooms = await prisma.room.findMany({
      where: { daycareId, businessUnit: GUARDERIA_BUSINESS_UNIT, isActive: true },
      include: {
        checkInOuts: {
          where: {
            isActive: true,
            checkInTime: { not: null },
            checkOutTime: null,
          },
          include: {
            pet: { select: { id: true, name: true, breed: true, species: true, photoUrl: true } },
            client: { select: { id: true, firstName: true, lastName: true, phone: true } },
          },
        },
      },
    });

    return rooms.map((room) => {
      const activeCount = room.checkInOuts.length;
      const available = Math.max(0, room.capacity - activeCount);
      const occupancyRate =
        room.capacity > 0 ? Math.min(100, Math.round((activeCount / room.capacity) * 100)) : 0;

      return {
        id: room.id,
        name: room.name,
        type: room.type,
        capacity: room.capacity,
        currentOccupancy: activeCount,
        availableSlots: available,
        occupancyRate,
        isFull: activeCount >= room.capacity,
        currentPets: room.checkInOuts.map((c) => ({
          checkInOutId: c.id,
          petId: c.pet.id,
          petName: c.pet.name,
          petBreed: c.pet.breed,
          petPhoto: c.pet.photoUrl,
          clientName: `${c.client.firstName} ${c.client.lastName}`,
          clientPhone: c.client.phone,
          checkInTime: c.checkInTime,
          notes: c.notes,
        })),
      };
    });
  }

  /**
   * Lista la asistencia programada y activa del día
   */
  static async getTodayAttendance(daycareId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Reservas de guardería para hoy
    const reservations = await prisma.reservation.findMany({
      where: {
        daycareId,
        businessUnit: GUARDERIA_BUSINESS_UNIT,
        checkIn: { gte: todayStart, lte: todayEnd },
        status: { not: "CANCELADA" },
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true } },
        pets: {
          include: { pet: { select: { id: true, name: true, breed: true, photoUrl: true } } },
        },
        room: { select: { id: true, name: true, capacity: true } },
        checkInOuts: { where: { isActive: true } },
      },
      orderBy: { checkIn: "asc" },
    });

    // 2. Check-ins activos (incluyendo ad-hoc sin reserva)
    const activeCheckIns = await prisma.checkInOut.findMany({
      where: {
        daycareId,
        businessUnit: GUARDERIA_BUSINESS_UNIT,
        isActive: true,
        checkInTime: { not: null },
        checkOutTime: null,
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true } },
        pet: { select: { id: true, name: true, breed: true, photoUrl: true } },
        room: { select: { id: true, name: true, capacity: true } },
        reservation: true,
      },
      orderBy: { checkInTime: "asc" },
    });

    return {
      reservations,
      activeCheckIns,
    };
  }

  /**
   * Registra check-in en sala de Guardería con validación estricta de cupo
   */
  static async registerCheckIn(dto: DaycareCheckInDTO) {
    const { daycareId, petId, clientId, roomId, reservationId, performedByUserId, notes } = dto;
    const checkInDate = dto.checkInTime ? new Date(dto.checkInTime) : new Date();

    // 1. Validar que la sala pertenezca a la unidad de guardería y esté activa
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });
    if (
      !room ||
      room.daycareId !== daycareId ||
      room.businessUnit !== GUARDERIA_BUSINESS_UNIT ||
      !room.isActive
    ) {
      throw new Error("Sala de guardería inválida o inactiva");
    }

    // 2. Validar que la mascota no esté ya en check-in activo
    const alreadyCheckedIn = await prisma.checkInOut.findFirst({
      where: {
        petId,
        daycareId,
        businessUnit: GUARDERIA_BUSINESS_UNIT,
        isActive: true,
        checkOutTime: null,
      },
    });
    if (alreadyCheckedIn) {
      throw new Error("La mascota ya tiene un check-in activo en guardería");
    }

    // 3. Validar capacidad actual de la sala
    const currentActiveInRoom = await prisma.checkInOut.count({
      where: {
        roomId,
        daycareId,
        businessUnit: GUARDERIA_BUSINESS_UNIT,
        isActive: true,
        checkOutTime: null,
      },
    });
    if (currentActiveInRoom >= room.capacity) {
      throw new Error(
        `La sala ${room.name} ha alcanzado su capacidad máxima (${room.capacity} mascotas)`,
      );
    }

    return await prisma.$transaction(async (tx) => {
      let checkInOutRecord;

      if (reservationId) {
        // Buscar si ya existe un registro de CheckInOut vinculado a esta reserva y mascota
        const existing = await tx.checkInOut.findFirst({
          where: { reservationId, petId },
        });

        if (existing) {
          checkInOutRecord = await tx.checkInOut.update({
            where: { id: existing.id },
            data: {
              checkInTime: checkInDate,
              roomId,
              performedByUserId,
              notes: notes || existing.notes,
              isActive: true,
            },
            include: { pet: true, room: true, client: true },
          });
        } else {
          checkInOutRecord = await tx.checkInOut.create({
            data: {
              petId,
              clientId,
              roomId,
              reservationId,
              daycareId,
              businessUnit: GUARDERIA_BUSINESS_UNIT,
              checkInTime: checkInDate,
              performedByUserId,
              notes,
              isActive: true,
            },
            include: { pet: true, room: true, client: true },
          });
        }

        // Marcar la reserva como ACTIVA si no lo estaba
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: "ACTIVA" },
        });
      } else {
        // Check-in directo (ad-hoc) sin reserva previa
        checkInOutRecord = await tx.checkInOut.create({
          data: {
            petId,
            clientId,
            roomId,
            daycareId,
            businessUnit: GUARDERIA_BUSINESS_UNIT,
            checkInTime: checkInDate,
            performedByUserId,
            notes,
            isActive: true,
          },
          include: { pet: true, room: true, client: true },
        });
      }

      return checkInOutRecord;
    });
  }

  /**
   * Registra check-out de Guardería con opción de cobro independiente
   */
  static async registerCheckOut(dto: DaycareCheckOutDTO) {
    const {
      daycareId,
      checkInOutId,
      performedByUserId,
      createIncome,
      paymentMethod = "EFECTIVO",
      notes,
    } = dto;
    const checkOutDate = dto.checkOutTime ? new Date(dto.checkOutTime) : new Date();

    const record = await prisma.checkInOut.findUnique({
      where: { id: checkInOutId },
      include: { pet: true, client: true, reservation: true },
    });

    if (
      !record ||
      record.daycareId !== daycareId ||
      record.businessUnit !== GUARDERIA_BUSINESS_UNIT
    ) {
      throw new Error("Registro de asistencia no encontrado en Guardería");
    }

    if (record.checkOutTime) {
      throw new Error("Esta estancia ya fue dada de baja (check-out realizado)");
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Marcar check-out en CheckInOut
      const updatedRecord = await tx.checkInOut.update({
        where: { id: checkInOutId },
        data: {
          checkOutTime: checkOutDate,
          performedByUserId: performedByUserId || record.performedByUserId,
          notes: notes ? `${record.notes ? record.notes + " | " : ""}${notes}` : record.notes,
        },
        include: { pet: true, room: true, client: true },
      });

      // 2. Si estaba vinculado a una reserva, comprobar si todas las mascotas hicieron checkout
      if (record.reservationId) {
        const remainingActive = await tx.checkInOut.count({
          where: {
            reservationId: record.reservationId,
            checkOutTime: null,
            isActive: true,
          },
        });

        if (remainingActive === 0) {
          await tx.reservation.update({
            where: { id: record.reservationId },
            data: { status: "COMPLETADA" },
          });
        }
      }

      // 3. Cobro independiente si se solicitó o si hay saldo pendiente
      if (createIncome) {
        const amount = dto.amount ?? (record.reservation?.pendingAmount || 20);
        if (amount > 0) {
          await tx.income.create({
            data: {
              daycareId,
              businessUnit: GUARDERIA_BUSINESS_UNIT,
              reservationId: record.reservationId || null,
              type: "GUARDERIA",
              concept: `Estancia Guardería: ${record.pet.name} (${record.client.firstName} ${record.client.lastName})`,
              amount,
              vatPercent: 0,
              vatAmount: 0,
              total: amount,
              paymentMethod,
              invoiceStatus: "COBRADO",
              notes: notes || "Cobro al check-out de guardería",
            },
          });

          if (record.reservationId) {
            await tx.reservation.update({
              where: { id: record.reservationId },
              data: {
                pendingAmount: Math.max(0, (record.reservation?.pendingAmount || 0) - amount),
                advanceAmount: (record.reservation?.advanceAmount || 0) + amount,
              },
            });
          }
        }
      }

      return updatedRecord;
    });
  }

  /**
   * Rutas de transporte para el día
   */
  static async getTodayTransport(daycareId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const transportReservations = await prisma.reservation.findMany({
      where: {
        daycareId,
        businessUnit: GUARDERIA_BUSINESS_UNIT,
        needsTransport: true,
        checkIn: { gte: todayStart, lte: todayEnd },
        status: { not: "CANCELADA" },
      },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true, address: true },
        },
        pets: { include: { pet: { select: { id: true, name: true, breed: true } } } },
      },
      orderBy: { checkIn: "asc" },
    });

    const recogidas = transportReservations.filter(
      (r) => r.transportType === "RECOGIDA" || !r.transportType,
    );
    const entregas = transportReservations.filter((r) => r.transportType === "ENTREGA");

    return {
      total: transportReservations.length,
      recogidas,
      entregas,
    };
  }
}
