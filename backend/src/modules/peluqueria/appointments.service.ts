import { prisma } from "../../db";
import { AuthzError, type BusinessUnit } from "../../middleware/auth";
import { localDayBoundsUtc } from "../../core/tenancy/local-time";
import { getUnitTimezone, getUnitVatPercent } from "../../core/tenancy/unit-settings";
import { DEFAULT_LIMIT } from "../../utils/pagination";
import { assertClientInTenant, assertPetsAlive } from "../../utils/validation";
import { DEFAULT_GROOMING_SERVICES } from "./services";

/**
 * The accounting/brand slot this module books under. Declared once here so the per-tenant
 * scoping work has a single place to replace with a request-derived value.
 */
export const PELUQUERIA_BUSINESS_UNIT: BusinessUnit = "GROOMING";

export interface CreateAppointmentDTO {
  daycareId: string;
  clientId: string;
  petIds: string[];
  serviceId?: string;
  serviceName?: string;
  startTime: string; // ISO String
  durationMinutes: number;
  notes?: string;
  basePrice?: number;
  vatPercent?: number;
  discountAmount?: number;
  advanceAmount?: number;
  paymentMethod?: string;
}

export interface UpdateAppointmentStatusDTO {
  status: "PENDIENTE" | "RECEPCIONADA" | "EN_PROCESO" | "LISTO" | "COMPLETADA" | "CANCELADA";
  notes?: string;
}

export interface CompleteAppointmentDTO {
  paymentMethod: string;
  amount?: number;
  notes?: string;
}

export class GroomingAppointmentsService {
  static async listAppointments(
    daycareId: string,
    query: { date?: string; status?: string; search?: string },
  ) {
    const where: any = {
      daycareId,
      businessUnit: PELUQUERIA_BUSINESS_UNIT,
    };

    if (query.status && query.status !== "ALL") {
      where.status = query.status;
    }

    if (query.date) {
      // The salon's day, not the server's: an evening appointment belongs to today's agenda.
      const timezone = await getUnitTimezone(daycareId, PELUQUERIA_BUSINESS_UNIT);
      const day = localDayBoundsUtc(query.date, timezone);
      if (!day) throw new AuthzError(400, "Fecha inválida");
      where.checkIn = { gte: day.start, lt: day.end };
    }

    if (query.search) {
      where.OR = [
        { client: { firstName: { contains: query.search, mode: "insensitive" } } },
        { client: { lastName: { contains: query.search, mode: "insensitive" } } },
        { pets: { some: { pet: { name: { contains: query.search, mode: "insensitive" } } } } },
      ];
    }

    const reservations = await prisma.reservation.findMany({
      where,
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true, whatsapp: true },
        },
        pets: {
          include: {
            pet: { select: { id: true, name: true, species: true, breed: true, photoUrl: true } },
          },
        },
        incomes: true,
      },
      // Newest first when the list has to be cut: without a date this is the salon's whole
      // history, and the appointments someone is looking for are the recent ones.
      orderBy: query.date ? { checkIn: "asc" } : [{ checkIn: "desc" }, { id: "desc" }],
      take: DEFAULT_LIMIT,
    });
    if (!query.date) reservations.reverse();

    return reservations.map((r) => {
      const checkInTime = r.checkIn ? new Date(r.checkIn).getTime() : 0;
      const checkOutTime = r.checkOut ? new Date(r.checkOut).getTime() : checkInTime;
      const duration = Math.max(15, Math.round((checkOutTime - checkInTime) / 60000));

      return {
        id: r.id,
        clientId: r.clientId,
        client: r.client,
        pets: r.pets.map((p) => p.pet),
        service: r.service,
        status: r.status,
        startTime: r.checkIn,
        endTime: r.checkOut,
        durationMinutes: duration,
        concept: r.concept,
        notes: r.notes,
        totalAmount: r.totalAmount,
        advanceAmount: r.advanceAmount,
        pendingAmount: r.pendingAmount,
        paymentMethod: r.paymentMethod,
        incomes: r.incomes,
        createdAt: r.createdAt,
      };
    });
  }

  static async getAppointment(daycareId: string, id: string) {
    const r = await prisma.reservation.findUnique({
      where: { id },
      include: {
        client: true,
        pets: { include: { pet: true } },
        incomes: true,
      },
    });

    if (!r || r.daycareId !== daycareId || r.businessUnit !== PELUQUERIA_BUSINESS_UNIT) {
      return null;
    }

    const checkInTime = r.checkIn ? new Date(r.checkIn).getTime() : 0;
    const checkOutTime = r.checkOut ? new Date(r.checkOut).getTime() : checkInTime;
    const duration = Math.max(15, Math.round((checkOutTime - checkInTime) / 60000));

    return {
      ...r,
      durationMinutes: duration,
    };
  }

  static async createAppointment(dto: CreateAppointmentDTO) {
    const {
      daycareId,
      clientId,
      petIds,
      serviceId,
      startTime,
      durationMinutes,
      notes,
      discountAmount = 0,
      advanceAmount = 0,
      paymentMethod = "EFECTIVO",
    } = dto;

    // The unit's configured rate, not a literal. Grooming appointments belong to GROOMING.
    const vatPercent = dto.vatPercent ?? (await getUnitVatPercent(daycareId, "GROOMING"));

    const matchedService = DEFAULT_GROOMING_SERVICES.find((s) => s.id === serviceId);
    const serviceName = dto.serviceName || matchedService?.name || "Servicio de Peluquería";
    const basePrice = dto.basePrice ?? matchedService?.basePrice ?? 20;

    const start = new Date(startTime);
    const end = new Date(start.getTime() + durationMinutes * 60000);

    const vatAmount = (basePrice - discountAmount) * (vatPercent / 100);
    const totalAmount = basePrice - discountAmount + vatAmount;
    const pendingAmount = totalAmount - advanceAmount;

    // The client must belong to THIS daycare. Both clientId and petIds arrive from the request
    // body, and checking only that the pets belong to the client let a tenant book an
    // appointment against another daycare's client and pets -- writing a reservation into its
    // own tenant that pointed at the other's records, and returning the other tenant's pet
    // names in `concept`.
    await assertClientInTenant(clientId, daycareId);

    const pets = await prisma.pet.findMany({
      where: { id: { in: petIds }, clientId, daycareId },
    });
    if (pets.length !== petIds.length) {
      throw new AuthzError(404, "Una o más mascotas seleccionadas no pertenecen a este cliente");
    }
    assertPetsAlive(pets);

    const petNames = pets.map((p) => p.name).join(", ");
    const concept = `${serviceName} - ${petNames}`;

    return await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.create({
        data: {
          daycareId,
          businessUnit: PELUQUERIA_BUSINESS_UNIT,
          clientId,
          service: serviceName,
          status: "PENDIENTE",
          checkIn: start,
          checkOut: end,
          concept,
          notes,
          paymentMethod,
          vatPercent,
          basePrice,
          discountAmount,
          advanceAmount,
          vatAmount,
          totalAmount,
          pendingAmount,
          pets: {
            create: petIds.map((petId) => ({ petId })),
          },
        },
        include: {
          client: true,
          pets: { include: { pet: true } },
        },
      });

      // If an advance was provided, record an initial Income for grooming
      if (advanceAmount > 0) {
        await tx.income.create({
          data: {
            daycareId,
            businessUnit: PELUQUERIA_BUSINESS_UNIT,
            reservationId: reservation.id,
            type: "ANTICIPO_PELUQUERIA",
            concept: `Anticipo: ${concept}`,
            amount: advanceAmount,
            vatPercent: 0,
            vatAmount: 0,
            total: advanceAmount,
            paymentMethod,
            invoiceStatus: "COBRADO",
            notes: "Anticipo de cita de peluquería",
          },
        });
      }

      return reservation;
    });
  }

  static async updateStatus(daycareId: string, id: string, dto: UpdateAppointmentStatusDTO) {
    const existing = await prisma.reservation.findUnique({
      where: { id },
      include: { client: true, pets: true },
    });
    if (
      !existing ||
      existing.daycareId !== daycareId ||
      existing.businessUnit !== PELUQUERIA_BUSINESS_UNIT
    ) {
      throw new Error("Cita de peluquería no encontrada");
    }

    return await prisma.reservation.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes
          ? `${existing.notes ? existing.notes + " | " : ""}${dto.notes}`
          : existing.notes,
      },
      include: { client: true, pets: { include: { pet: true } } },
    });
  }

  static async completeAndCollect(daycareId: string, id: string, dto: CompleteAppointmentDTO) {
    const existing = await prisma.reservation.findUnique({
      where: { id },
      include: { client: true, pets: { include: { pet: true } } },
    });
    if (
      !existing ||
      existing.daycareId !== daycareId ||
      existing.businessUnit !== PELUQUERIA_BUSINESS_UNIT
    ) {
      throw new Error("Cita de peluquería no encontrada");
    }

    const amountToCollect = dto.amount ?? existing.pendingAmount;

    return await prisma.$transaction(async (tx) => {
      // 1. Record Income for the grooming unit
      if (amountToCollect > 0) {
        await tx.income.create({
          data: {
            daycareId,
            businessUnit: PELUQUERIA_BUSINESS_UNIT,
            reservationId: existing.id,
            type: "PELUQUERIA",
            concept: `Cobro Cita: ${existing.concept || existing.service}`,
            amount: amountToCollect,
            vatPercent: 0,
            vatAmount: 0,
            total: amountToCollect,
            paymentMethod: dto.paymentMethod,
            invoiceStatus: "COBRADO",
            notes: dto.notes || "Cobro al finalizar servicio de peluquería",
          },
        });
      }

      // 2. Mark reservation completed
      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: "COMPLETADA",
          pendingAmount: Math.max(0, existing.pendingAmount - amountToCollect),
          advanceAmount: existing.advanceAmount + amountToCollect,
        },
        include: { client: true, pets: { include: { pet: true } }, incomes: true },
      });

      return updated;
    });
  }

  static async deleteAppointment(daycareId: string, id: string) {
    const existing = await prisma.reservation.findUnique({ where: { id } });
    if (
      !existing ||
      existing.daycareId !== daycareId ||
      existing.businessUnit !== PELUQUERIA_BUSINESS_UNIT
    ) {
      throw new Error("Cita de peluquería no encontrada");
    }

    return await prisma.reservation.delete({
      where: { id },
    });
  }
}
