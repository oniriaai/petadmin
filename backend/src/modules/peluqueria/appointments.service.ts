import { prisma } from "../../db";
import { DEFAULT_GROOMING_SERVICES } from "./services";

export interface CreateAppointmentDTO {
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
  static async listAppointments(query: { date?: string; status?: string; search?: string }) {
    const where: any = {
      businessUnit: "PETHIJOS",
    };

    if (query.status && query.status !== "ALL") {
      where.status = query.status;
    }

    if (query.date) {
      const start = new Date(query.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(query.date);
      end.setHours(23, 59, 59, 999);
      where.checkIn = { gte: start, lte: end };
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
        client: { select: { id: true, firstName: true, lastName: true, phone: true, whatsapp: true } },
        pets: { include: { pet: { select: { id: true, name: true, species: true, breed: true, photoUrl: true } } } },
        incomes: true,
      },
      orderBy: { checkIn: "asc" },
    });

    return reservations.map(r => {
      const checkInTime = r.checkIn ? new Date(r.checkIn).getTime() : 0;
      const checkOutTime = r.checkOut ? new Date(r.checkOut).getTime() : checkInTime;
      const duration = Math.max(15, Math.round((checkOutTime - checkInTime) / 60000));

      return {
        id: r.id,
        clientId: r.clientId,
        client: r.client,
        pets: r.pets.map(p => p.pet),
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

  static async getAppointment(id: string) {
    const r = await prisma.reservation.findUnique({
      where: { id },
      include: {
        client: true,
        pets: { include: { pet: true } },
        incomes: true,
      },
    });

    if (!r || r.businessUnit !== "PETHIJOS") {
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
      clientId,
      petIds,
      serviceId,
      startTime,
      durationMinutes,
      notes,
      vatPercent = 15,
      discountAmount = 0,
      advanceAmount = 0,
      paymentMethod = "EFECTIVO",
    } = dto;

    const matchedService = DEFAULT_GROOMING_SERVICES.find(s => s.id === serviceId);
    const serviceName = dto.serviceName || matchedService?.name || "Servicio de Peluquería";
    const basePrice = dto.basePrice ?? matchedService?.basePrice ?? 20;

    const start = new Date(startTime);
    const end = new Date(start.getTime() + durationMinutes * 60000);

    const vatAmount = (basePrice - discountAmount) * (vatPercent / 100);
    const totalAmount = basePrice - discountAmount + vatAmount;
    const pendingAmount = totalAmount - advanceAmount;

    // Validate pets belong to client
    const pets = await prisma.pet.findMany({
      where: { id: { in: petIds }, clientId },
    });
    if (pets.length !== petIds.length) {
      throw new Error("Una o más mascotas seleccionadas no pertenecen a este cliente");
    }

    const petNames = pets.map(p => p.name).join(", ");
    const concept = `${serviceName} - ${petNames}`;

    return await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.create({
        data: {
          businessUnit: "PETHIJOS",
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
            create: petIds.map(petId => ({ petId })),
          },
        },
        include: {
          client: true,
          pets: { include: { pet: true } },
        },
      });

      // If an advance was provided, record an initial Income for Pethijos
      if (advanceAmount > 0) {
        await tx.income.create({
          data: {
            businessUnit: "PETHIJOS",
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

  static async updateStatus(id: string, dto: UpdateAppointmentStatusDTO) {
    const existing = await prisma.reservation.findUnique({
      where: { id },
      include: { client: true, pets: true },
    });
    if (!existing || existing.businessUnit !== "PETHIJOS") {
      throw new Error("Cita de peluquería no encontrada");
    }

    return await prisma.reservation.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes ? `${existing.notes ? existing.notes + " | " : ""}${dto.notes}` : existing.notes,
      },
      include: { client: true, pets: { include: { pet: true } } },
    });
  }

  static async completeAndCollect(id: string, dto: CompleteAppointmentDTO) {
    const existing = await prisma.reservation.findUnique({
      where: { id },
      include: { client: true, pets: { include: { pet: true } } },
    });
    if (!existing || existing.businessUnit !== "PETHIJOS") {
      throw new Error("Cita de peluquería no encontrada");
    }

    const amountToCollect = dto.amount ?? existing.pendingAmount;

    return await prisma.$transaction(async (tx) => {
      // 1. Record Income for PETHIJOS unit
      if (amountToCollect > 0) {
        await tx.income.create({
          data: {
            businessUnit: "PETHIJOS",
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

  static async deleteAppointment(id: string) {
    const existing = await prisma.reservation.findUnique({ where: { id } });
    if (!existing || existing.businessUnit !== "PETHIJOS") {
      throw new Error("Cita de peluquería no encontrada");
    }

    return await prisma.reservation.delete({
      where: { id },
    });
  }
}
