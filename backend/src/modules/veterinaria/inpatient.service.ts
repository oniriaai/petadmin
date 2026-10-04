import { Prisma } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "../../db";
import { AuthzError } from "../../middleware/auth";
import type {
  admissionSchema,
  dischargeSchema,
  treatmentDoseSchema,
  treatmentOrderSchema,
  vitalsSchema,
} from "./schemas";
import {
  VETERINARIA_BUSINESS_UNIT,
  assertEditable,
  parseDate,
  requireVisit,
} from "./visits.service";

const HOSPITAL_ROOM_TYPE = "hospital";
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** How many past doses of each order travel with a stay: enough for the ward sheet. */
const RECENT_DOSES = 20;
const RECENT_VITALS = 20;

const hospitalizationInclude = {
  pet: {
    select: {
      id: true,
      name: true,
      species: true,
      breed: true,
      sex: true,
      birthdate: true,
      weight: true,
      allergies: true,
      photoUrl: true,
    },
  },
  room: { select: { id: true, name: true } },
  visit: {
    select: {
      id: true,
      status: true,
      client: {
        select: { id: true, firstName: true, lastName: true, phone: true, whatsapp: true },
      },
      veterinarian: { select: { id: true, name: true, licenseNumber: true } },
    },
  },
  orders: {
    orderBy: { createdAt: "asc" },
    include: {
      administrations: {
        orderBy: { scheduledAt: "desc" },
        take: RECENT_DOSES,
        include: { administeredBy: { select: { id: true, name: true } } },
      },
    },
  },
  vitals: { orderBy: { takenAt: "desc" }, take: RECENT_VITALS },
} satisfies Prisma.VetHospitalizationInclude;

type HospitalizationRow = Prisma.VetHospitalizationGetPayload<{
  include: typeof hospitalizationInclude;
}>;

interface OrderSchedule {
  isActive: boolean;
  everyHours: number | null;
  startAt: Date;
  endAt: Date | null;
}

/**
 * When an order's next dose falls, or null when nothing more is due.
 *
 * Doses are not generated ahead of time. The next slot is the last recorded one plus the
 * interval, so a late dose does not silently shift every later one.
 */
function nextDueAt(order: OrderSchedule, latest: { scheduledAt: Date } | undefined): Date | null {
  if (!order.isActive) return null;
  if (!latest) return order.startAt;
  if (!order.everyHours) return null;
  const next = new Date(latest.scheduledAt.getTime() + order.everyHours * HOUR_MS);
  return order.endAt && next > order.endAt ? null : next;
}

function withSchedule(stay: HospitalizationRow) {
  return {
    ...stay,
    orders: stay.orders.map((order) => ({
      ...order,
      // Newest first, so the head of the list is the last slot signed for.
      nextDueAt: stay.status === "INGRESADO" ? nextDueAt(order, order.administrations[0]) : null,
    })),
  };
}

export async function listHospitalizations(
  daycareId: string,
  query: { status?: string; petId?: string },
  page: { skip: number; take: number },
) {
  const where: Prisma.VetHospitalizationWhereInput = { daycareId };
  if (query.status !== "ALL") where.status = query.status || "INGRESADO";
  if (query.petId) where.petId = query.petId;

  const [rows, total] = await Promise.all([
    prisma.vetHospitalization.findMany({
      where,
      include: hospitalizationInclude,
      orderBy: [{ admittedAt: "desc" }, { id: "asc" }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.vetHospitalization.count({ where }),
  ]);
  return { items: rows.map(withSchedule), total };
}

/** The clinic's wards with how many of their cages are taken. */
export async function listWards(daycareId: string) {
  const [rooms, occupied] = await Promise.all([
    prisma.room.findMany({
      where: {
        daycareId,
        businessUnit: VETERINARIA_BUSINESS_UNIT,
        type: HOSPITAL_ROOM_TYPE,
        isActive: true,
      },
      select: { id: true, name: true, capacity: true },
      orderBy: { name: "asc" },
    }),
    prisma.vetHospitalization.groupBy({
      by: ["roomId"],
      where: { daycareId, status: "INGRESADO" },
      _count: { _all: true },
    }),
  ]);
  const taken = new Map(occupied.map((row) => [row.roomId, row._count._all]));
  return rooms.map((room) => ({ ...room, occupied: taken.get(room.id) ?? 0 }));
}

export async function getHospitalization(daycareId: string, id: string) {
  const stay = await prisma.vetHospitalization.findFirst({
    where: { id, daycareId },
    include: hospitalizationInclude,
  });
  if (!stay) throw new AuthzError(404, "Hospitalización no encontrada");
  return withSchedule(stay);
}

/** An admitted stay, tenant-scoped. Ward writes start here. */
async function requireActiveStay(daycareId: string, id: string) {
  const stay = await prisma.vetHospitalization.findFirst({
    where: { id, daycareId },
    select: { id: true, status: true, petId: true, visitId: true, admittedAt: true },
  });
  if (!stay) throw new AuthzError(404, "Hospitalización no encontrada");
  if (stay.status !== "INGRESADO") {
    throw new AuthzError(409, "El paciente ya recibió el alta");
  }
  return stay;
}

export async function admit(
  daycareId: string,
  visitId: string,
  dto: z.infer<typeof admissionSchema>,
) {
  const visit = await requireVisit(daycareId, visitId);
  assertEditable(visit);

  // The room id arrives in the body: tenant, unit and kind are all checked before it is used.
  const room = await prisma.room.findFirst({
    where: { id: dto.roomId, daycareId, businessUnit: VETERINARIA_BUSINESS_UNIT, isActive: true },
    select: { id: true, type: true, capacity: true },
  });
  if (!room) throw new AuthzError(404, "Sala no encontrada");
  if (room.type !== HOSPITAL_ROOM_TYPE) {
    throw new AuthzError(400, "La sala elegida no es de hospitalización");
  }

  const admittedAt = dto.admittedAt ? parseDate(dto.admittedAt, "Fecha de ingreso") : new Date();

  const stay = await prisma.$transaction(async (tx) => {
    // Serialises admissions into this room, so two of them cannot both take the last cage.
    await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${room.id} FOR UPDATE`;

    const alreadyIn = await tx.vetHospitalization.count({
      where: { daycareId, petId: visit.petId, status: "INGRESADO" },
    });
    if (alreadyIn > 0) throw new AuthzError(409, "El paciente ya está hospitalizado");

    const occupied = await tx.vetHospitalization.count({
      where: { daycareId, roomId: room.id, status: "INGRESADO" },
    });
    if (occupied >= room.capacity) {
      throw new AuthzError(409, `La sala está completa (${occupied}/${room.capacity})`);
    }

    return tx.vetHospitalization.create({
      data: {
        daycareId,
        visitId: visit.id,
        petId: visit.petId,
        roomId: room.id,
        reason: dto.reason,
        dailyRate: dto.dailyRate,
        admittedAt,
      },
      select: { id: true },
    });
  });

  return getHospitalization(daycareId, stay.id);
}

/**
 * Discharges a patient and bills the stay on the visit it was admitted from.
 *
 * A started day counts as a day, and a stay of any length is at least one.
 */
export async function discharge(
  daycareId: string,
  id: string,
  dto: z.infer<typeof dischargeSchema>,
) {
  const stay = await prisma.vetHospitalization.findFirst({
    where: { id, daycareId },
    include: { visit: { select: { id: true, status: true } } },
  });
  if (!stay) throw new AuthzError(404, "Hospitalización no encontrada");

  const dischargedAt = dto.dischargedAt ? parseDate(dto.dischargedAt, "Fecha de alta") : new Date();
  if (dischargedAt < stay.admittedAt) {
    throw new AuthzError(400, "El alta no puede ser anterior al ingreso");
  }
  const days = Math.max(
    1,
    Math.ceil((dischargedAt.getTime() - stay.admittedAt.getTime()) / DAY_MS),
  );

  await prisma.$transaction(async (tx) => {
    // Conditional on the status so two simultaneous discharges cannot both bill the stay.
    const claimed = await tx.vetHospitalization.updateMany({
      where: { id: stay.id, daycareId, status: "INGRESADO" },
      data: {
        status: "ALTA",
        dischargedAt,
        dischargeSummary: dto.dischargeSummary,
        homeCareInstructions: dto.homeCareInstructions,
      },
    });
    if (claimed.count === 0) throw new AuthzError(409, "El paciente ya recibió el alta");

    await tx.vetTreatmentOrder.updateMany({
      where: { hospitalizationId: stay.id, daycareId, isActive: true },
      data: { isActive: false, endAt: dischargedAt },
    });

    if (stay.dailyRate > 0) {
      assertEditable(stay.visit);
      await tx.vetVisitCharge.create({
        data: {
          daycareId,
          visitId: stay.visitId,
          description: `Hospitalización (${days} ${days === 1 ? "día" : "días"})`,
          quantity: days,
          unitPrice: stay.dailyRate,
        },
      });
    }
  });

  return getHospitalization(daycareId, stay.id);
}

export async function addWardVitals(
  daycareId: string,
  id: string,
  dto: z.infer<typeof vitalsSchema>,
) {
  const stay = await requireActiveStay(daycareId, id);
  const { takenAt, ...measurements } = dto;
  const [vitals] = await prisma.$transaction([
    prisma.vetVitals.create({
      data: {
        ...measurements,
        daycareId,
        petId: stay.petId,
        visitId: stay.visitId,
        hospitalizationId: stay.id,
        ...(takenAt ? { takenAt: parseDate(takenAt, "Fecha de la toma") } : {}),
      },
    }),
    ...(dto.weightKg !== undefined
      ? [prisma.pet.update({ where: { id: stay.petId }, data: { weight: dto.weightKg } })]
      : []),
  ]);
  return vitals;
}

export async function addTreatmentOrder(
  daycareId: string,
  id: string,
  dto: z.infer<typeof treatmentOrderSchema>,
) {
  const stay = await requireActiveStay(daycareId, id);
  const { startAt, endAt, ...rest } = dto;
  const start = startAt ? parseDate(startAt, "Inicio") : new Date();
  const end = endAt ? parseDate(endAt, "Fin") : null;
  if (end && end < start) throw new AuthzError(400, "El fin no puede ser anterior al inicio");

  return prisma.vetTreatmentOrder.create({
    data: { ...rest, daycareId, hospitalizationId: stay.id, startAt: start, endAt: end },
  });
}

export async function stopTreatmentOrder(daycareId: string, orderId: string) {
  const { count } = await prisma.vetTreatmentOrder.updateMany({
    where: { id: orderId, daycareId, isActive: true },
    data: { isActive: false, endAt: new Date() },
  });
  if (count === 0) throw new AuthzError(404, "Indicación no encontrada o ya suspendida");
}

/** Signs for one dose of an order: given now, or skipped with a reason. */
export async function recordDose(
  daycareId: string,
  orderId: string,
  userId: string | undefined,
  dto: z.infer<typeof treatmentDoseSchema>,
) {
  const order = await prisma.vetTreatmentOrder.findFirst({
    where: { id: orderId, daycareId },
    include: {
      hospitalization: { select: { id: true, status: true } },
      administrations: { orderBy: { scheduledAt: "desc" }, take: 1 },
    },
  });
  if (!order) throw new AuthzError(404, "Indicación no encontrada");
  if (order.hospitalization.status !== "INGRESADO") {
    throw new AuthzError(409, "El paciente ya recibió el alta");
  }
  if (!order.isActive) throw new AuthzError(409, "La indicación está suspendida");

  const due = nextDueAt(order, order.administrations[0]);
  const scheduledAt = dto.scheduledAt ? parseDate(dto.scheduledAt, "Hora de la dosis") : due;
  if (!scheduledAt) throw new AuthzError(409, "La indicación no tiene más dosis pendientes");

  const skipped = Boolean(dto.skippedReason);
  try {
    return await prisma.vetTreatmentAdministration.create({
      data: {
        daycareId,
        orderId: order.id,
        hospitalizationId: order.hospitalizationId,
        scheduledAt,
        administeredAt: skipped ? null : new Date(),
        administeredByUserId: userId ?? null,
        skippedReason: dto.skippedReason,
        notes: dto.notes,
      },
    });
  } catch (error) {
    // The (order, slot) pair is unique: whoever signs second is told, not double-counted.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AuthzError(409, "Esa dosis ya fue registrada");
    }
    throw error;
  }
}
