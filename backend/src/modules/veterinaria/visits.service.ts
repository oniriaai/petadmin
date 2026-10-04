import type { Prisma } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "../../db";
import { AuthzError, type BusinessUnit } from "../../middleware/auth";
import { isOwnKey, resolveObjectKey } from "../../core/storage/object-keys";
import { localDayBoundsUtc } from "../../core/tenancy/local-time";
import { getUnitTimezone, getUnitVatPercent } from "../../core/tenancy/unit-settings";
import { B2_ENDPOINT, BUCKET_NAME } from "../../lib/s3";
import {
  assertClientInTenant,
  assertVeterinarianInTenant,
  validateNoReservationConflicts,
  validateRoomExists,
} from "../../utils/validation";
import {
  VISIT_TYPE_LABELS,
  type VisitStatus,
  type chargeSchema,
  type closeVisitSchema,
  type createVisitSchema,
  type diagnosisSchema,
  type paymentSchema,
  type visitRecordSchema,
  type vitalsSchema,
} from "./schemas";

/** The accounting slot every clinic reservation and income is booked under. */
export const VETERINARIA_BUSINESS_UNIT: BusinessUnit = "VETERINARY";

const DEFAULT_VISIT_MINUTES = 30;
/** Statuses in which a visit no longer holds its slot. */
const RELEASED_STATUSES: VisitStatus[] = ["CANCELADA", "NO_ASISTIO"];
/** Statuses in which the clinical record and the bill are frozen. */
const LOCKED_STATUSES: VisitStatus[] = ["CERRADA", "CANCELADA", "NO_ASISTIO"];

const round2 = (value: number) => Math.round(value * 100) / 100;

export function parseDate(value: string, what: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AuthzError(400, `${what} inválida`);
  return date;
}

const visitListInclude = {
  pet: { select: { id: true, name: true, species: true, breed: true, photoUrl: true } },
  client: { select: { id: true, firstName: true, lastName: true, phone: true, whatsapp: true } },
  veterinarian: { select: { id: true, name: true } },
  reservation: {
    select: {
      id: true,
      checkIn: true,
      checkOut: true,
      service: true,
      totalAmount: true,
      pendingAmount: true,
      room: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.VetVisitInclude;

const visitDetailInclude = {
  pet: {
    select: {
      id: true,
      name: true,
      species: true,
      breed: true,
      sex: true,
      birthdate: true,
      weight: true,
      isNeutered: true,
      allergies: true,
      chronicConditions: true,
      bloodType: true,
      microchip: true,
      photoUrl: true,
      deceasedAt: true,
    },
  },
  client: {
    select: { id: true, firstName: true, lastName: true, phone: true, whatsapp: true, email: true },
  },
  veterinarian: { select: { id: true, name: true, licenseNumber: true } },
  reservation: { include: { room: { select: { id: true, name: true } }, incomes: true } },
  vitals: { orderBy: { takenAt: "desc" } },
  diagnoses: { orderBy: { createdAt: "asc" } },
  charges: { orderBy: { createdAt: "asc" } },
  documents: { orderBy: { uploadedAt: "desc" } },
  vaccinations: { orderBy: { date: "desc" } },
  preventives: { orderBy: { date: "desc" } },
  prescriptions: {
    orderBy: { issuedAt: "asc" },
    include: {
      items: { include: { inventoryItem: { select: { id: true, name: true, unit: true } } } },
    },
  },
  hospitalizations: {
    orderBy: { admittedAt: "desc" },
    include: { room: { select: { id: true, name: true } } },
  },
  procedures: {
    orderBy: { createdAt: "asc" },
    include: { veterinarian: { select: { id: true, name: true } } },
  },
  labOrders: { orderBy: { requestedAt: "asc" }, include: { values: true } },
  consents: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.VetVisitInclude;

export interface VisitListQuery {
  date?: string;
  from?: string;
  to?: string;
  veterinarianId?: string;
  status?: string;
  petId?: string;
  search?: string;
}

export async function listVisits(
  daycareId: string,
  query: VisitListQuery,
  page: { skip: number; take: number },
) {
  const where: Prisma.VetVisitWhereInput = { daycareId };

  if (query.status && query.status !== "ALL") where.status = query.status;
  if (query.veterinarianId) where.veterinarianId = query.veterinarianId;
  if (query.petId) where.petId = query.petId;

  if (query.date) {
    // The clinic's day, not the server's: a 20:00 consultation belongs to today's agenda.
    const timezone = await getUnitTimezone(daycareId, VETERINARIA_BUSINESS_UNIT);
    const day = localDayBoundsUtc(query.date, timezone);
    if (!day) throw new AuthzError(400, "Fecha inválida");
    where.reservation = { checkIn: { gte: day.start, lt: day.end } };
  } else if (query.from || query.to) {
    where.reservation = {
      checkIn: {
        ...(query.from ? { gte: parseDate(query.from, "Fecha inicial") } : {}),
        ...(query.to ? { lte: parseDate(query.to, "Fecha final") } : {}),
      },
    };
  }

  if (query.search) {
    const contains = { contains: query.search, mode: "insensitive" as const };
    where.OR = [
      { pet: { name: contains } },
      { client: { firstName: contains } },
      { client: { lastName: contains } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.vetVisit.findMany({
      where,
      include: visitListInclude,
      orderBy: [{ reservation: { checkIn: "asc" } }, { id: "asc" }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.vetVisit.count({ where }),
  ]);
  return { items, total };
}

export async function getVisit(daycareId: string, id: string) {
  const visit = await prisma.vetVisit.findFirst({
    where: { id, daycareId },
    include: visitDetailInclude,
  });
  if (!visit) throw new AuthzError(404, "Consulta no encontrada");
  return visit;
}

/** The visit's state, tenant-scoped. Every write below starts here. */
export async function requireVisit(daycareId: string, id: string) {
  const visit = await prisma.vetVisit.findFirst({
    where: { id, daycareId },
    select: { id: true, status: true, petId: true, reservationId: true, veterinarianId: true },
  });
  if (!visit) throw new AuthzError(404, "Consulta no encontrada");
  return visit;
}

export function assertEditable(visit: { status: string }) {
  if (LOCKED_STATUSES.includes(visit.status as VisitStatus)) {
    throw new AuthzError(409, "La consulta está cerrada o cancelada y ya no se puede modificar");
  }
}

/**
 * A visit cannot be closed, cancelled or deleted from under a patient who is still on the ward
 * or on the table: the stay is billed on this visit at discharge.
 */
async function assertNoOpenInpatientWork(daycareId: string, visitId: string) {
  const [admitted, underway] = await Promise.all([
    prisma.vetHospitalization.count({ where: { daycareId, visitId, status: "INGRESADO" } }),
    prisma.vetProcedure.count({ where: { daycareId, visitId, status: "EN_CURSO" } }),
  ]);
  if (admitted > 0) {
    throw new AuthzError(409, "El paciente sigue hospitalizado: registra el alta primero");
  }
  if (underway > 0) {
    throw new AuthzError(409, "Hay un procedimiento en curso: finalízalo primero");
  }
}

/** A veterinarian cannot be in two consultations at once. */
async function assertVeterinarianFree(
  db: Prisma.TransactionClient,
  daycareId: string,
  veterinarianId: string,
  start: Date,
  end: Date,
) {
  const overlapping = await db.vetVisit.count({
    where: {
      daycareId,
      veterinarianId,
      status: { notIn: [...LOCKED_STATUSES] },
      reservation: { checkIn: { lt: end }, checkOut: { gt: start } },
    },
  });
  if (overlapping > 0) {
    throw new AuthzError(409, "El veterinario ya tiene una consulta en ese horario");
  }
}

export async function createVisit(daycareId: string, dto: z.infer<typeof createVisitSchema>) {
  // Every id below arrives in the request body. Each is resolved against this daycare before
  // it is written as a foreign key.
  await assertClientInTenant(dto.clientId, daycareId);

  const pet = await prisma.pet.findFirst({
    where: { id: dto.petId, clientId: dto.clientId, daycareId, isActive: true },
    select: { id: true, name: true, deceasedAt: true },
  });
  if (!pet) throw new AuthzError(404, "Paciente no encontrado para ese tutor");
  if (pet.deceasedAt) throw new AuthzError(409, "El paciente figura como fallecido");

  const service = dto.serviceId
    ? await prisma.vetService.findFirst({
        where: { id: dto.serviceId, daycareId, isActive: true },
      })
    : null;
  if (dto.serviceId && !service) throw new AuthzError(404, "Servicio no encontrado");

  const start = dto.startTime ? parseDate(dto.startTime, "Fecha y hora") : new Date();
  const minutes = dto.durationMinutes ?? service?.durationMinutes ?? DEFAULT_VISIT_MINUTES;
  const end = new Date(start.getTime() + minutes * 60000);

  // An emergency is seen regardless of what the agenda says; anything else respects it.
  const mustFitAgenda = dto.triage !== "URGENCIA";

  if (dto.veterinarianId) await assertVeterinarianInTenant(dto.veterinarianId, daycareId);

  if (dto.roomId) {
    const room = await validateRoomExists(dto.roomId, daycareId, VETERINARIA_BUSINESS_UNIT);
    if (!room.valid) throw new AuthzError(404, "Sala no encontrada");
  }

  const vatPercent = await getUnitVatPercent(daycareId, VETERINARIA_BUSINESS_UNIT);
  const serviceName = service?.name ?? VISIT_TYPE_LABELS[dto.type];

  return prisma.$transaction(async (tx) => {
    // Availability is checked behind a lock on the veterinarian and the room, both verified
    // against this daycare above: two bookings for the same slot queue up here, and the second
    // sees the first. Always in this order, so two bookings cannot deadlock each other.
    if (mustFitAgenda && dto.veterinarianId) {
      await tx.$queryRaw`SELECT id FROM veterinarians WHERE id = ${dto.veterinarianId} FOR UPDATE`;
      await assertVeterinarianFree(tx, daycareId, dto.veterinarianId, start, end);
    }
    if (mustFitAgenda && dto.roomId) {
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${dto.roomId} FOR UPDATE`;
      const free = await validateNoReservationConflicts(
        dto.roomId,
        daycareId,
        start,
        end,
        undefined,
        tx,
      );
      if (!free.valid) throw new AuthzError(409, free.message ?? "La sala está ocupada");
    }

    const reservation = await tx.reservation.create({
      data: {
        daycareId,
        businessUnit: VETERINARIA_BUSINESS_UNIT,
        clientId: dto.clientId,
        roomId: dto.roomId ?? null,
        service: serviceName,
        status: "PENDIENTE",
        checkIn: start,
        checkOut: end,
        concept: `${serviceName} - ${pet.name}`,
        notes: dto.notes,
        vatPercent,
        pets: { create: [{ petId: pet.id }] },
      },
      select: { id: true },
    });

    const visit = await tx.vetVisit.create({
      data: {
        daycareId,
        reservationId: reservation.id,
        petId: pet.id,
        clientId: dto.clientId,
        veterinarianId: dto.veterinarianId ?? null,
        type: dto.type,
        triage: dto.triage,
        // A walk-in is already in the waiting room.
        status: dto.startTime ? "PROGRAMADA" : "EN_ESPERA",
        reason: dto.reason,
        ...(service
          ? {
              charges: {
                create: [
                  {
                    daycareId,
                    vetServiceId: service.id,
                    description: service.name,
                    quantity: 1,
                    unitPrice: service.basePrice,
                  },
                ],
              },
            }
          : {}),
      },
      include: visitListInclude,
    });

    return visit;
  });
}

export async function updateVisitStatus(daycareId: string, id: string, status: VisitStatus) {
  const visit = await requireVisit(daycareId, id);
  if (visit.status === "CERRADA") {
    throw new AuthzError(409, "Una consulta cerrada no puede cambiar de estado");
  }

  const released = RELEASED_STATUSES.includes(status);
  if (released) await assertNoOpenInpatientWork(daycareId, visit.id);
  const [updated] = await prisma.$transaction([
    prisma.vetVisit.update({
      where: { id: visit.id },
      data: { status },
      include: visitListInclude,
    }),
    // The reservation is what occupies the room and the calendar, so it follows the visit.
    prisma.reservation.update({
      where: { id: visit.reservationId },
      data: { status: released ? "CANCELADA" : "PENDIENTE" },
    }),
  ]);
  return updated;
}

export async function updateVisitRecord(
  daycareId: string,
  id: string,
  dto: z.infer<typeof visitRecordSchema>,
) {
  const visit = await requireVisit(daycareId, id);
  assertEditable(visit);

  if (dto.veterinarianId) await assertVeterinarianInTenant(dto.veterinarianId, daycareId);

  const { followUpDate, ...rest } = dto;
  return prisma.vetVisit.update({
    where: { id: visit.id },
    data: {
      ...rest,
      ...(followUpDate !== undefined
        ? { followUpDate: followUpDate ? parseDate(followUpDate, "Fecha de control") : null }
        : {}),
    },
    include: visitDetailInclude,
  });
}

export async function deleteVisit(daycareId: string, id: string) {
  const visit = await requireVisit(daycareId, id);
  if (visit.status === "CERRADA") {
    throw new AuthzError(409, "Una consulta cerrada forma parte de la historia clínica");
  }
  await assertNoOpenInpatientWork(daycareId, visit.id);
  // The visit, its vitals, diagnoses and charges cascade from the reservation.
  await prisma.reservation.delete({ where: { id: visit.reservationId } });
}

export async function addVitals(daycareId: string, id: string, dto: z.infer<typeof vitalsSchema>) {
  const visit = await requireVisit(daycareId, id);
  assertEditable(visit);

  const { takenAt, ...measurements } = dto;
  const [vitals] = await prisma.$transaction([
    prisma.vetVitals.create({
      data: {
        ...measurements,
        daycareId,
        petId: visit.petId,
        visitId: visit.id,
        ...(takenAt ? { takenAt: parseDate(takenAt, "Fecha de la toma") } : {}),
      },
    }),
    // The pet's profile carries its latest known weight, which dosing relies on.
    ...(dto.weightKg !== undefined
      ? [prisma.pet.update({ where: { id: visit.petId }, data: { weight: dto.weightKg } })]
      : []),
  ]);
  return vitals;
}

export async function addDiagnosis(
  daycareId: string,
  id: string,
  dto: z.infer<typeof diagnosisSchema>,
) {
  const visit = await requireVisit(daycareId, id);
  assertEditable(visit);
  return prisma.vetDiagnosis.create({
    data: { ...dto, daycareId, visitId: visit.id, petId: visit.petId },
  });
}

export async function addCharge(daycareId: string, id: string, dto: z.infer<typeof chargeSchema>) {
  const visit = await requireVisit(daycareId, id);
  assertEditable(visit);

  const service = dto.vetServiceId
    ? await prisma.vetService.findFirst({ where: { id: dto.vetServiceId, daycareId } })
    : null;
  if (dto.vetServiceId && !service) throw new AuthzError(404, "Servicio no encontrado");

  const item = dto.inventoryItemId
    ? await prisma.inventoryItem.findFirst({
        where: {
          id: dto.inventoryItemId,
          daycareId,
          businessUnit: VETERINARIA_BUSINESS_UNIT,
          isActive: true,
        },
        select: { id: true, name: true },
      })
    : null;
  if (dto.inventoryItemId && !item) throw new AuthzError(404, "Artículo no encontrado");

  const description = dto.description || service?.name || item?.name;
  if (!description) throw new AuthzError(400, "Indica un servicio, un artículo o una descripción");

  return prisma.vetVisitCharge.create({
    data: {
      daycareId,
      visitId: visit.id,
      vetServiceId: service?.id ?? null,
      inventoryItemId: item?.id ?? null,
      description,
      quantity: dto.quantity,
      unitPrice: dto.unitPrice ?? service?.basePrice ?? 0,
    },
  });
}

type VisitChild = "vetVitals" | "vetDiagnosis" | "vetVisitCharge";

/** Removes one vitals, diagnosis or charge row of an editable visit. */
export async function removeVisitChild(
  daycareId: string,
  visitId: string,
  model: VisitChild,
  childId: string,
) {
  const visit = await requireVisit(daycareId, visitId);
  assertEditable(visit);

  const where = { id: childId, visitId: visit.id, daycareId };
  const { count } =
    model === "vetVitals"
      ? await prisma.vetVitals.deleteMany({ where })
      : model === "vetDiagnosis"
        ? await prisma.vetDiagnosis.deleteMany({ where })
        : await prisma.vetVisitCharge.deleteMany({ where });
  if (count === 0) throw new AuthzError(404, "Registro no encontrado");
}

/**
 * Closes a visit: freezes the record, writes the totals onto its reservation and records what
 * was collected.
 *
 * The income is written here regardless of whether the daycare bought `finanzas`: only the
 * finance API and UI are gated, never the books.
 */
export async function closeVisit(
  daycareId: string,
  id: string,
  userId: string | undefined,
  dto: z.infer<typeof closeVisitSchema>,
) {
  const visit = await prisma.vetVisit.findFirst({
    where: { id, daycareId },
    include: { charges: true, reservation: { select: { vatPercent: true, concept: true } } },
  });
  if (!visit) throw new AuthzError(404, "Consulta no encontrada");
  assertEditable(visit);
  await assertNoOpenInpatientWork(daycareId, visit.id);

  const basePrice = round2(
    visit.charges.reduce((sum, charge) => sum + charge.quantity * charge.unitPrice, 0),
  );
  if (dto.discountAmount > basePrice) {
    throw new AuthzError(400, "El descuento no puede superar el subtotal");
  }
  const vatAmount = round2((basePrice - dto.discountAmount) * (visit.reservation.vatPercent / 100));
  const totalAmount = round2(basePrice - dto.discountAmount + vatAmount);
  const amountPaid = round2(dto.amountPaid ?? totalAmount);
  if (amountPaid > totalAmount) {
    throw new AuthzError(400, "El cobro no puede superar el total de la consulta");
  }

  await prisma.$transaction(async (tx) => {
    // Conditional on the status so two simultaneous closes cannot both record an income.
    const claimed = await tx.vetVisit.updateMany({
      where: { id: visit.id, daycareId, status: { notIn: [...LOCKED_STATUSES] } },
      data: { status: "CERRADA", closedAt: new Date(), closedByUserId: userId ?? null },
    });
    if (claimed.count === 0) throw new AuthzError(409, "La consulta ya fue cerrada");

    await tx.reservation.update({
      where: { id: visit.reservationId },
      data: {
        status: "COMPLETADA",
        basePrice,
        discountAmount: dto.discountAmount,
        vatAmount,
        totalAmount,
        advanceAmount: amountPaid,
        pendingAmount: round2(totalAmount - amountPaid),
        paymentMethod: dto.paymentMethod,
      },
    });

    if (amountPaid > 0) {
      await tx.income.create({
        data: {
          daycareId,
          businessUnit: VETERINARIA_BUSINESS_UNIT,
          reservationId: visit.reservationId,
          type: "VETERINARIA",
          concept: `Cobro consulta: ${visit.reservation.concept ?? "Veterinaria"}`,
          amount: amountPaid,
          vatPercent: 0,
          vatAmount: 0,
          total: amountPaid,
          paymentMethod: dto.paymentMethod,
          invoiceStatus: "COBRADO",
          notes: dto.notes || "Cobro al cerrar la consulta veterinaria",
        },
      });
    }
  });

  return getVisit(daycareId, visit.id);
}

/** Collects against the balance a closed visit was left with. */
export async function recordPayment(
  daycareId: string,
  id: string,
  dto: z.infer<typeof paymentSchema>,
) {
  const visit = await prisma.vetVisit.findFirst({
    where: { id, daycareId },
    select: { id: true, status: true, reservationId: true, reservation: true },
  });
  if (!visit) throw new AuthzError(404, "Consulta no encontrada");
  if (visit.status !== "CERRADA") {
    throw new AuthzError(409, "Solo se registran abonos sobre una consulta cerrada");
  }
  const amount = round2(dto.amount);
  if (amount > round2(visit.reservation.pendingAmount)) {
    throw new AuthzError(400, "El abono supera el saldo pendiente");
  }

  await prisma.$transaction(async (tx) => {
    // Conditional on the balance, so two abonos cannot both draw down the same saldo.
    const claimed = await tx.reservation.updateMany({
      where: { id: visit.reservationId, daycareId, pendingAmount: { gte: amount - 0.005 } },
      data: { pendingAmount: { decrement: amount }, advanceAmount: { increment: amount } },
    });
    if (claimed.count === 0) throw new AuthzError(409, "El saldo pendiente cambió");

    await tx.income.create({
      data: {
        daycareId,
        businessUnit: VETERINARIA_BUSINESS_UNIT,
        reservationId: visit.reservationId,
        type: "VETERINARIA",
        concept: `Abono consulta: ${visit.reservation.concept ?? "Veterinaria"}`,
        amount,
        vatPercent: 0,
        vatAmount: 0,
        total: amount,
        paymentMethod: dto.paymentMethod,
        invoiceStatus: "COBRADO",
        notes: dto.notes || "Abono de consulta veterinaria",
      },
    });
  });

  return getVisit(daycareId, visit.id);
}

export async function addDocument(
  daycareId: string,
  id: string,
  dto: { type: string; name: string; filePath?: string },
) {
  const visit = await requireVisit(daycareId, id);

  // The path is a reference this tenant writes, and a reference is what authorizes deleting the
  // object behind it: it must resolve to a key under this daycare's own prefix.
  let filePath: string | undefined;
  if (dto.filePath) {
    const key = resolveObjectKey(dto.filePath, BUCKET_NAME ?? "", B2_ENDPOINT);
    if (!key || !isOwnKey(key, daycareId)) {
      throw new AuthzError(400, "La ruta del archivo no pertenece a esta guardería");
    }
    filePath = key;
  }

  return prisma.petDocument.create({
    data: { type: dto.type, name: dto.name, filePath, petId: visit.petId, vetVisitId: visit.id },
  });
}
