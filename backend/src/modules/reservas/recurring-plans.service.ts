import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { validateNoReservationConflicts, validateRoomCapacity } from "../../utils/validation";
import { getBusinessUnitTimezone } from "../../services/business-unit-settings";

const HORIZON_DAYS = 30;

type GenerationStats = {
  scannedPlans: number;
  evaluatedOccurrences: number;
  createdReservations: number;
  skippedExisting: number;
  failed: number;
};

function parsePetIds(petIds: string): string[] {
  return petIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseDaysOfWeek(daysOfWeek: string): Set<number> {
  return new Set(
    daysOfWeek
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  );
}

function parseTime(time: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`Hora inválida: ${time}`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function localDatePartsInTimezone(date: Date, timezone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { year, month, day };
}

function localDateTimeOffsetMs(utcDate: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(utcDate);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const second = Number(parts.find((p) => p.type === "second")?.value);
  return Date.UTC(year, month - 1, day, hour, minute, second) - utcDate.getTime();
}

function localDateTimeToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timezone: string
): Date {
  const targetMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0, 0);
  let guessMs = targetMs;
  for (let i = 0; i < 3; i += 1) {
    const offset = localDateTimeOffsetMs(new Date(guessMs), timezone);
    guessMs = targetMs - offset;
  }
  return new Date(guessMs);
}

function compareLocalDates(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function addOneLocalDay(d: { year: number; month: number; day: number }): { year: number; month: number; day: number } {
  const nextUtc = new Date(Date.UTC(d.year, d.month - 1, d.day + 1, 12, 0, 0, 0));
  return {
    year: nextUtc.getUTCFullYear(),
    month: nextUtc.getUTCMonth() + 1,
    day: nextUtc.getUTCDate(),
  };
}

function localDayNumber(d: { year: number; month: number; day: number }): number {
  const jsDay = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function toOccurrenceTimes(
  localDate: { year: number; month: number; day: number },
  startTime: string,
  endTime: string,
  timezone: string
) {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  const checkIn = localDateTimeToUtc({ ...localDate, ...start }, timezone);
  const checkOut = localDateTimeToUtc({ ...localDate, ...end }, timezone);
  return { checkIn, checkOut };
}

async function createReservationFromPlan(plan: {
  id: string;
  businessUnit: string;
  clientId: string;
  roomId: string | null;
  service: string;
  notes: string | null;
  petIds: string;
  startTime: string;
  endTime: string;
}, checkIn: Date, checkOut: Date) {
  if (!plan.roomId) {
    throw new Error("Plan sin sala asignada: no se puede generar reserva");
  }

  const petIds = parsePetIds(plan.petIds);
  if (petIds.length === 0) {
    throw new Error("Plan sin mascotas válidas");
  }

  const ownedPets = await prisma.pet.findMany({
    where: { id: { in: petIds }, clientId: plan.clientId },
    select: { id: true },
  });
  if (ownedPets.length !== petIds.length) {
    throw new Error("Plan contiene mascotas que no pertenecen al cliente");
  }

  const conflictValidation = await validateNoReservationConflicts(plan.roomId, checkIn, checkOut);
  if (!conflictValidation.valid) {
    throw new Error(conflictValidation.message || "Conflicto de horario");
  }

  const capacityValidation = await validateRoomCapacity(plan.roomId, checkIn, checkOut, petIds.length);
  if (!capacityValidation.valid) {
    throw new Error(capacityValidation.message || "Capacidad excedida");
  }

  await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.create({
      data: {
        businessUnit: plan.businessUnit,
        clientId: plan.clientId,
        roomId: plan.roomId,
        recurringPlanId: plan.id,
        service: plan.service,
        status: "PENDIENTE",
        checkIn,
        checkOut,
        notes: plan.notes,
        pets: { create: petIds.map((petId) => ({ petId })) },
      },
    });

    await tx.checkInOut.createMany({
      data: petIds.map((petId) => ({
        businessUnit: plan.businessUnit,
        petId,
        clientId: plan.clientId,
        roomId: plan.roomId!,
        reservationId: reservation.id,
        isActive: true,
      })),
    });
  });
}

export async function generateRecurringReservations(referenceDate = new Date()): Promise<GenerationStats> {
  const stats: GenerationStats = {
    scannedPlans: 0,
    evaluatedOccurrences: 0,
    createdReservations: 0,
    skippedExisting: 0,
    failed: 0,
  };

  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + HORIZON_DAYS);
  end.setHours(23, 59, 59, 999);

  const plans = await prisma.recurringPlan.findMany({
    where: {
      isActive: true,
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: {
      id: true,
      businessUnit: true,
      clientId: true,
      roomId: true,
      service: true,
      notes: true,
      petIds: true,
      daysOfWeek: true,
      startDate: true,
      endDate: true,
      startTime: true,
      endTime: true,
    },
  });

  stats.scannedPlans = plans.length;

  for (const plan of plans) {
    const planDays = parseDaysOfWeek(plan.daysOfWeek);
    if (planDays.size === 0) {
      continue;
    }

    const timezone = await getBusinessUnitTimezone(plan.businessUnit);
    const windowStartUtc = new Date(Math.max(plan.startDate.getTime(), start.getTime()));
    const windowEndUtc = new Date(Math.min(plan.endDate.getTime(), end.getTime()));
    const localStart = localDatePartsInTimezone(windowStartUtc, timezone);
    const localEnd = localDatePartsInTimezone(windowEndUtc, timezone);

    for (let localDay = localStart; compareLocalDates(localDay, localEnd) <= 0; localDay = addOneLocalDay(localDay)) {
      if (!planDays.has(localDayNumber(localDay))) {
        continue;
      }

      const { checkIn, checkOut } = toOccurrenceTimes(localDay, plan.startTime, plan.endTime, timezone);
      if (checkOut <= checkIn) {
        stats.failed += 1;
        continue;
      }
      stats.evaluatedOccurrences += 1;

      try {
        await createReservationFromPlan(plan, checkIn, checkOut);
        stats.createdReservations += 1;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          stats.skippedExisting += 1;
        } else {
          stats.failed += 1;
        }
      }
    }
  }

  return stats;
}

export async function syncFuturePendingReservationsForPlan(planId: string): Promise<number> {
  const plan = await prisma.recurringPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      businessUnit: true,
      clientId: true,
      roomId: true,
      service: true,
      notes: true,
      petIds: true,
      startTime: true,
      endTime: true,
    },
  });
  if (!plan) return 0;

  const petIds = parsePetIds(plan.petIds);
  const now = new Date();

  const reservations = await prisma.reservation.findMany({
    where: {
      recurringPlanId: plan.id,
      status: "PENDIENTE",
      checkIn: { gte: now },
    },
    select: { id: true, businessUnit: true, checkIn: true, checkOut: true },
  });

  for (const reservation of reservations) {
    await prisma.$transaction(async (tx) => {
      const timezone = await getBusinessUnitTimezone(plan.businessUnit);
      if (!reservation.checkIn) return;
      const localDay = localDatePartsInTimezone(reservation.checkIn, timezone);
      const { checkIn, checkOut } = toOccurrenceTimes(localDay, plan.startTime, plan.endTime, timezone);
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          clientId: plan.clientId,
          roomId: plan.roomId,
          service: plan.service,
          notes: plan.notes,
          checkIn,
          checkOut,
        },
      });

      await tx.reservationPet.deleteMany({ where: { reservationId: reservation.id } });
      await tx.reservationPet.createMany({
        data: petIds.map((petId) => ({ reservationId: reservation.id, petId })),
      });

      await tx.checkInOut.updateMany({
        where: { reservationId: reservation.id },
        data: { isActive: false },
      });

      if (plan.roomId) {
        await tx.checkInOut.createMany({
          data: petIds.map((petId) => ({
            businessUnit: reservation.businessUnit,
            petId,
            clientId: plan.clientId,
            roomId: plan.roomId!,
            reservationId: reservation.id,
            isActive: true,
          })),
        });
      }
    });
  }

  return reservations.length;
}

export async function cancelFuturePendingReservationsForPlan(planId: string): Promise<number> {
  const now = new Date();

  const futurePending = await prisma.reservation.findMany({
    where: {
      recurringPlanId: planId,
      status: "PENDIENTE",
      checkIn: { gte: now },
    },
    select: { id: true },
  });

  if (futurePending.length === 0) return 0;

  const reservationIds = futurePending.map((r) => r.id);

  await prisma.$transaction([
    prisma.reservation.updateMany({
      where: { id: { in: reservationIds } },
      data: { status: "CANCELADA" },
    }),
    prisma.checkInOut.updateMany({
      where: { reservationId: { in: reservationIds } },
      data: { isActive: false },
    }),
  ]);

  return reservationIds.length;
}

export function startRecurringPlansScheduler() {
  const run = async () => {
    try {
      const stats = await generateRecurringReservations();
      console.log("[recurring-plans] generation", stats);
    } catch (error) {
      console.error("[recurring-plans] generation failed", error);
    }
  };

  // Run once on startup, then every 24h.
  void run();
  const interval = setInterval(() => {
    void run();
  }, 24 * 60 * 60 * 1000);

  return interval;
}
