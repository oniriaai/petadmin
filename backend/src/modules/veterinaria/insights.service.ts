import { prisma } from "../../db";
import { AuthzError } from "../../middleware/auth";
import { listWards } from "./inpatient.service";
import { VETERINARIA_BUSINESS_UNIT, parseDate } from "./visits.service";

const DAY_MS = 86_400_000;
const DEFAULT_REMINDER_DAYS = 30;
const MAX_REMINDER_DAYS = 365;
/** Something overdue for longer than this is no longer a reminder, it is a lapsed patient. */
const OVERDUE_LIMIT_DAYS = 365;
const REMINDER_CAP = 500;
const DEFAULT_REPORT_DAYS = 30;
const TOP_DIAGNOSES = 10;

export const REMINDER_KINDS = ["VACUNA", "PREVENTIVO", "CONTROL", "LABORATORIO"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

const tutorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  whatsapp: true,
  email: true,
  isActive: true,
  reminderChannel: true,
} as const;

const patientSelect = { id: true, name: true, client: { select: tutorSelect } } as const;

/** Patients worth reminding: still with the clinic, and alive. */
const remindablePet = (daycareId: string) => ({ daycareId, isActive: true, deceasedAt: null });

export interface Reminder {
  id: string;
  kind: ReminderKind;
  dueAt: Date;
  overdue: boolean;
  label: string;
  /** What is due, on its own: the vaccine, the product, the reason or the test. */
  subject: string;
  pet: { id: string; name: string };
  client: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    isActive: boolean;
    reminderChannel: string | null;
  };
  visitId: string | null;
}

/** Keeps, per key, only the most recent row: a later dose supersedes the reminder of an earlier one. */
function latestBy<T extends { date: Date }>(rows: T[], key: (row: T) => string): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const current = latest.get(key(row));
    if (!current || row.date > current.date) latest.set(key(row), row);
  }
  return [...latest.values()];
}

/**
 * What the clinic should chase: vaccines and preventives coming due, follow-ups nobody booked,
 * and lab orders still without a result.
 *
 * Computed on every call from the records themselves. Nothing is stored, so there is no
 * reminder to go stale when a dose is given or a visit is booked.
 */
export async function listReminders(
  daycareId: string,
  query: { kind?: string; days?: string },
): Promise<Reminder[]> {
  const days = Math.min(
    MAX_REMINDER_DAYS,
    Math.max(0, Number(query.days) || DEFAULT_REMINDER_DAYS),
  );
  const kind = REMINDER_KINDS.find((candidate) => candidate === query.kind);
  if (query.kind && !kind) throw new AuthzError(400, "Tipo de recordatorio inválido");
  const wants = (candidate: ReminderKind) => !kind || kind === candidate;

  const now = new Date();
  const horizon = new Date(now.getTime() + days * DAY_MS);
  const floor = new Date(now.getTime() - OVERDUE_LIMIT_DAYS * DAY_MS);
  const due = (date: Date) => date >= floor && date <= horizon;
  const pet = remindablePet(daycareId);

  const [vaccinations, preventives, followUps, labOrders] = await Promise.all([
    wants("VACUNA")
      ? prisma.petVaccination.findMany({
          // Every dated dose is read, not only the due ones: a newer dose of the same vaccine
          // is what cancels an older reminder.
          where: { pet, date: { gte: new Date(floor.getTime() - OVERDUE_LIMIT_DAYS * DAY_MS) } },
          select: {
            id: true,
            name: true,
            date: true,
            nextDue: true,
            vetVisitId: true,
            pet: { select: patientSelect },
          },
        })
      : [],
    wants("PREVENTIVO")
      ? prisma.vetPreventive.findMany({
          where: {
            daycareId,
            pet,
            date: { gte: new Date(floor.getTime() - OVERDUE_LIMIT_DAYS * DAY_MS) },
          },
          select: {
            id: true,
            kind: true,
            product: true,
            date: true,
            nextDue: true,
            visitId: true,
            pet: { select: patientSelect },
          },
        })
      : [],
    wants("CONTROL")
      ? prisma.vetVisit.findMany({
          where: {
            daycareId,
            pet,
            status: { notIn: ["CANCELADA", "NO_ASISTIO"] },
            followUpDate: { gte: floor, lte: horizon },
          },
          select: {
            id: true,
            petId: true,
            followUpDate: true,
            createdAt: true,
            reason: true,
            pet: { select: patientSelect },
          },
        })
      : [],
    wants("LABORATORIO")
      ? prisma.vetLabOrder.findMany({
          where: { daycareId, status: { not: "RESULTADO" } },
          select: {
            id: true,
            test: true,
            requestedAt: true,
            visitId: true,
            pet: { select: patientSelect },
          },
        })
      : [],
  ]);

  // A follow-up is settled once the patient has any later visit on the books.
  const lastVisit = followUps.length
    ? await prisma.vetVisit.groupBy({
        by: ["petId"],
        where: {
          daycareId,
          petId: { in: [...new Set(followUps.map((visit) => visit.petId))] },
          status: { notIn: ["CANCELADA", "NO_ASISTIO"] },
        },
        _max: { createdAt: true },
      })
    : [];
  const lastVisitAt = new Map(lastVisit.map((row) => [row.petId, row._max.createdAt]));

  const patient = (row: { pet: { id: string; name: string; client: Reminder["client"] } }) => ({
    pet: { id: row.pet.id, name: row.pet.name },
    client: row.pet.client,
  });
  const reminders: Reminder[] = [];

  for (const row of latestBy(vaccinations, (v) => `${v.pet.id}:${v.name.trim().toLowerCase()}`)) {
    if (!row.nextDue || !due(row.nextDue)) continue;
    reminders.push({
      id: `VACUNA:${row.id}`,
      kind: "VACUNA",
      dueAt: row.nextDue,
      overdue: row.nextDue < now,
      label: `Refuerzo de ${row.name}`,
      subject: row.name,
      visitId: row.vetVisitId,
      ...patient(row),
    });
  }
  for (const row of latestBy(preventives, (p) => `${p.pet.id}:${p.kind}`)) {
    if (!row.nextDue || !due(row.nextDue)) continue;
    reminders.push({
      id: `PREVENTIVO:${row.id}`,
      kind: "PREVENTIVO",
      dueAt: row.nextDue,
      overdue: row.nextDue < now,
      label: `Próxima dosis de ${row.product}`,
      subject: row.product,
      visitId: row.visitId,
      ...patient(row),
    });
  }
  for (const row of followUps) {
    const latest = lastVisitAt.get(row.petId);
    if (!row.followUpDate || (latest && latest > row.createdAt)) continue;
    reminders.push({
      id: `CONTROL:${row.id}`,
      kind: "CONTROL",
      dueAt: row.followUpDate,
      overdue: row.followUpDate < now,
      label: row.reason ? `Control: ${row.reason}` : "Control pendiente",
      subject: row.reason ?? "",
      visitId: row.id,
      ...patient(row),
    });
  }
  for (const row of labOrders) {
    reminders.push({
      id: `LABORATORIO:${row.id}`,
      kind: "LABORATORIO",
      dueAt: row.requestedAt,
      // An order is late from the moment it is requested: the tutor is waiting on it.
      overdue: true,
      label: `Resultado pendiente: ${row.test}`,
      subject: row.test,
      visitId: row.visitId,
      ...patient(row),
    });
  }

  return reminders
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, REMINDER_CAP);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The clinic's own figures for a period. Lives here rather than in `informes` so a tenant with
 * the clinic but without that module still sees how the clinic is doing.
 */
export async function getClinicSummary(daycareId: string, query: { from?: string; to?: string }) {
  const to = query.to ? parseDate(query.to, "Fecha final") : new Date();
  const from = query.from
    ? parseDate(query.from, "Fecha inicial")
    : new Date(to.getTime() - DEFAULT_REPORT_DAYS * DAY_MS);
  if (from > to) throw new AuthzError(400, "La fecha inicial es posterior a la final");

  const attended = {
    daycareId,
    status: { notIn: ["CANCELADA", "NO_ASISTIO"] },
    reservation: { checkIn: { gte: from, lte: to } },
  };

  const [
    byType,
    byVeterinarian,
    missed,
    charges,
    collected,
    diagnoses,
    admissions,
    discharges,
    wards,
  ] = await Promise.all([
    prisma.vetVisit.groupBy({ by: ["type"], where: attended, _count: { _all: true } }),
    prisma.vetVisit.groupBy({ by: ["veterinarianId"], where: attended, _count: { _all: true } }),
    prisma.vetVisit.count({
      where: { daycareId, status: "NO_ASISTIO", reservation: { checkIn: { gte: from, lte: to } } },
    }),
    prisma.vetVisitCharge.findMany({
      where: { daycareId, visit: { status: "CERRADA", closedAt: { gte: from, lte: to } } },
      select: { quantity: true, unitPrice: true, vetService: { select: { category: true } } },
    }),
    prisma.income.aggregate({
      where: {
        daycareId,
        businessUnit: VETERINARIA_BUSINESS_UNIT,
        type: "VETERINARIA",
        date: { gte: from, lte: to },
      },
      _sum: { total: true },
    }),
    prisma.vetDiagnosis.groupBy({
      by: ["description"],
      where: { daycareId, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
      orderBy: { _count: { description: "desc" } },
      take: TOP_DIAGNOSES,
    }),
    prisma.vetHospitalization.count({ where: { daycareId, admittedAt: { gte: from, lte: to } } }),
    prisma.vetHospitalization.findMany({
      where: { daycareId, status: "ALTA", dischargedAt: { gte: from, lte: to } },
      select: { admittedAt: true, dischargedAt: true },
    }),
    listWards(daycareId),
  ]);

  const staffIds = byVeterinarian.flatMap((row) => row.veterinarianId ?? []);
  const staff = staffIds.length
    ? await prisma.veterinarian.findMany({
        where: { daycareId, id: { in: staffIds } },
        select: { id: true, name: true },
      })
    : [];
  const staffName = new Map(staff.map((vet) => [vet.id, vet.name]));

  const billed = new Map<string, number>();
  for (const charge of charges) {
    // A free-text or stock charge has no catalogue category of its own.
    const category = charge.vetService?.category ?? "OTRO";
    billed.set(category, (billed.get(category) ?? 0) + charge.quantity * charge.unitPrice);
  }

  const stayDays = discharges.map(
    (stay) =>
      ((stay.dischargedAt ?? stay.admittedAt).getTime() - stay.admittedAt.getTime()) / DAY_MS,
  );

  return {
    from,
    to,
    visits: {
      total: byType.reduce((sum, row) => sum + row._count._all, 0),
      missed,
      byType: byType
        .map((row) => ({ type: row.type, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      byVeterinarian: byVeterinarian
        .map((row) => ({
          veterinarianId: row.veterinarianId,
          name: row.veterinarianId ? (staffName.get(row.veterinarianId) ?? "—") : "Sin asignar",
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count),
    },
    revenue: {
      /** Charges of the visits closed in the period, before discounts and VAT. */
      billed: round2([...billed.values()].reduce((sum, amount) => sum + amount, 0)),
      byCategory: [...billed.entries()]
        .map(([category, amount]) => ({ category, amount: round2(amount) }))
        .sort((a, b) => b.amount - a.amount),
      /** What was actually paid into VETERINARY in the period. */
      collected: round2(collected._sum.total ?? 0),
    },
    topDiagnoses: diagnoses.map((row) => ({
      description: row.description,
      count: row._count._all,
    })),
    hospital: {
      admissions,
      discharges: discharges.length,
      averageStayDays: stayDays.length
        ? round2(stayDays.reduce((sum, value) => sum + value, 0) / stayDays.length)
        : null,
      wards,
    },
  };
}
