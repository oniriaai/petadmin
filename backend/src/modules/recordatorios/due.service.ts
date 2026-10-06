import { prisma } from "../../db";
import { availableChannels, toE164, toEmailAddress, type Channel } from "../../core/messaging";
import { BUSINESS_UNITS, type BusinessUnit } from "../../middleware/auth";
import {
  getUnitReminderSettings,
  getUnitTimezone,
  type UnitReminderSettings,
} from "../../core/tenancy/unit-settings";
import { getEnabledProductModules } from "../../platform/module-access";
import { listReminders, type ClinicReminder } from "../veterinaria";
import { REMINDER_KINDS, joinNames, renderReminder, type ReminderKind } from "./templates";

const DAY_MS = 86_400_000;
export const DEFAULT_DUE_DAYS = 7;
export const MAX_DUE_DAYS = 90;
const DUE_CAP = 500;

/** A visit the tutor can still be reminded of: booked, and not yet started or called off. */
const UPCOMING_STATUSES = ["PENDIENTE", "CONFIRMADA", "PROGRAMADA"];

export interface Tutor {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  isActive: boolean;
  reminderChannel: string | null;
}

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

/** Where a reminder would go, or why it would go nowhere. */
export type ChannelDecision =
  | { channel: Channel; recipient: string; skipReason: null }
  | { channel: null; recipient: null; skipReason: string };

/** One thing a tutor should hear about, with the message already worded. */
export interface DueReminder {
  /** Stable for as long as the underlying record is: "CITA:<reservationId>", "VACUNA:<id>". */
  sourceKey: string;
  /** `sourceKey` plus the date it is about, so a rescheduled visit is reminded again. */
  dedupeKey: string;
  kind: ReminderKind;
  businessUnit: BusinessUnit;
  dueAt: Date;
  overdue: boolean;
  label: string;
  /** The vaccine, the product, the reason or the test, as the message names it. */
  subject: string;
  /** The first pet, for the link to its record; `petNames` is what the message says. */
  petId: string | null;
  petNames: string;
  client: Tutor;
  /** The channel the tutor's preference and the unit's settings resolve to. */
  channel: Channel | null;
  recipient: string | null;
  skipReason: string | null;
  /** Every channel this tutor can be reached on, for a send where staff pick one by hand. */
  alternatives: Channel[];
  /** The message as it would be sent on `channel` (on WhatsApp when there is none). */
  message: string;
}

export interface TenantContext {
  daycareId: string;
  name: string;
  units: BusinessUnit[];
  /** Whether the tenant runs a clinic, and so can give the vaccine it reminds about. */
  hasClinic: boolean;
  /** The one unit that sends vaccine and other health reminders. */
  healthUnit: BusinessUnit | null;
}

export function parseUnits(units: string): BusinessUnit[] {
  const owned = units.split(",").map((unit) => unit.trim().toUpperCase());
  return BUSINESS_UNITS.filter((unit) => owned.includes(unit));
}

/**
 * Who a tenant is, as far as reminders go.
 *
 * A pet belongs to the tenant and not to a unit, so its vaccines have to be reminded from
 * exactly one place or the tutor hears twice. That is the clinic when the tenant has one, which
 * also sends preventives, follow-ups and pending results; otherwise it is the tenant's first
 * unit, and all it can say is that the card needs renewing.
 */
export async function loadTenantContext(daycareId: string): Promise<TenantContext | null> {
  const daycare = await prisma.daycare.findUnique({
    where: { id: daycareId },
    select: { name: true, units: true, isActive: true },
  });
  if (!daycare || !daycare.isActive) return null;
  const units = parseUnits(daycare.units);
  const modules = await getEnabledProductModules(daycareId);
  const hasClinic = units.includes("VETERINARY") && modules.has("veterinaria");
  return {
    daycareId,
    name: daycare.name,
    units,
    hasClinic,
    healthUnit: hasClinic ? "VETERINARY" : (units[0] ?? null),
  };
}

/**
 * Picks the channel for one tutor.
 *
 * The tutor's own preference comes first and the unit's default second; whichever is missing its
 * contact gives way to the other, since a reminder by the second-best channel is better than
 * none. "NONE" is the tutor opting out and nothing overrides it.
 *
 * Pure, so the architecture suite can pin it without a database.
 */
export function resolveChannel(
  client: Pick<Tutor, "phone" | "whatsapp" | "email" | "isActive" | "reminderChannel">,
  settings: Pick<UnitReminderSettings, "channels" | "defaultChannel">,
  usable: readonly Channel[],
  forced?: Channel,
): ChannelDecision {
  const skip = (skipReason: string): ChannelDecision => ({
    channel: null,
    recipient: null,
    skipReason,
  });
  if (!client.isActive) return skip("El tutor está inactivo");
  if (client.reminderChannel === "NONE") return skip("El tutor pidió no recibir recordatorios");

  const enabled = settings.channels.filter((channel) => usable.includes(channel));
  if (enabled.length === 0) return skip("No hay ningún canal de envío activo");

  const contact = (channel: Channel): string | null =>
    channel === "WHATSAPP" ? toE164(client.whatsapp || client.phone) : toEmailAddress(client.email);

  if (forced) {
    if (!enabled.includes(forced)) return skip("Ese canal no está activo para esta unidad");
    const recipient = contact(forced);
    return recipient
      ? { channel: forced, recipient, skipReason: null }
      : skip(
          forced === "WHATSAPP"
            ? "El tutor no tiene un número de WhatsApp válido"
            : "El tutor no tiene un correo válido",
        );
  }

  const preferred =
    client.reminderChannel === "WHATSAPP" || client.reminderChannel === "EMAIL"
      ? client.reminderChannel
      : settings.defaultChannel;
  const order = [preferred, ...enabled.filter((channel) => channel !== preferred)].filter(
    (channel) => enabled.includes(channel),
  );
  for (const channel of order) {
    const recipient = contact(channel);
    if (recipient) return { channel, recipient, skipReason: null };
  }
  return skip("El tutor no tiene WhatsApp ni correo válidos");
}

/** The channels this process can actually send on. */
export function usableChannels(): Channel[] {
  const modes = availableChannels();
  return (Object.keys(modes) as Channel[]).filter((channel) => modes[channel] !== null);
}

interface Candidate {
  sourceKey: string;
  kind: ReminderKind;
  dueAt: Date;
  overdue: boolean;
  label: string;
  subject: string;
  petId: string | null;
  petNames: string;
  client: Tutor;
}

async function appointmentCandidates(
  daycareId: string,
  businessUnit: BusinessUnit,
  range: { from: Date; to: Date },
  reservationId?: string,
): Promise<Candidate[]> {
  const reservations = await prisma.reservation.findMany({
    where: {
      daycareId,
      businessUnit,
      ...(reservationId ? { id: reservationId } : {}),
      status: { in: UPCOMING_STATUSES },
      checkIn: { gte: range.from, lt: range.to },
      // A dog on a plan comes every day; reminding its tutor every day would be noise.
      recurringPlanId: null,
    },
    select: {
      id: true,
      checkIn: true,
      service: true,
      client: { select: tutorSelect },
      pets: {
        select: { pet: { select: { id: true, name: true, isActive: true, deceasedAt: true } } },
      },
    },
    orderBy: [{ checkIn: "asc" }, { id: "asc" }],
    take: DUE_CAP,
  });

  const candidates: Candidate[] = [];
  for (const reservation of reservations) {
    if (!reservation.checkIn) continue;
    const pets = reservation.pets
      .map((row) => row.pet)
      .filter((pet) => pet.isActive && !pet.deceasedAt);
    // Every pet on the booking is gone: there is nobody to remind the tutor about.
    if (reservation.pets.length > 0 && pets.length === 0) continue;
    candidates.push({
      sourceKey: `CITA:${reservation.id}`,
      kind: "CITA",
      dueAt: reservation.checkIn,
      overdue: false,
      label: reservation.service,
      subject: reservation.service,
      petId: pets[0]?.id ?? null,
      petNames: joinNames(pets.map((pet) => pet.name)),
      client: reservation.client,
    });
  }
  return candidates;
}

function fromClinicReminder(reminder: ClinicReminder): Candidate {
  return {
    sourceKey: reminder.id,
    kind: reminder.kind,
    dueAt: reminder.dueAt,
    overdue: reminder.overdue,
    label: reminder.label,
    subject: reminder.subject,
    petId: reminder.pet.id,
    petNames: reminder.pet.name,
    client: reminder.client,
  };
}

export interface DueQuery {
  days?: number;
  kind?: ReminderKind;
  /** Narrow to one reminder: how a send re-derives what it was asked to send. */
  sourceKey?: string;
}

/**
 * What one unit of one tenant should remind its tutors about, each with its channel resolved
 * and its message written.
 *
 * Computed from the records on every call, like the clinic's own list: nothing is queued, so a
 * cancelled visit or a dose given in the meantime simply stops appearing.
 */
export async function listDue(
  tenant: TenantContext,
  businessUnit: BusinessUnit,
  query: DueQuery = {},
): Promise<DueReminder[]> {
  if (!tenant.units.includes(businessUnit)) return [];
  const days = Math.min(MAX_DUE_DAYS, Math.max(1, Math.floor(query.days ?? DEFAULT_DUE_DAYS)));
  const now = new Date();

  const [keyKind, keyId] = query.sourceKey ? query.sourceKey.split(":", 2) : [];
  const targetKind = REMINDER_KINDS.find((kind) => kind === keyKind);
  if (query.sourceKey && (!targetKind || !keyId)) return [];
  const wants = (kind: ReminderKind) =>
    (!query.kind || query.kind === kind) && (!targetKind || targetKind === kind);

  const candidates: Candidate[] = [];
  if (wants("CITA")) {
    candidates.push(
      ...(await appointmentCandidates(
        tenant.daycareId,
        businessUnit,
        // A single reservation is looked up wherever it is in the future, not only this week.
        { from: now, to: new Date(now.getTime() + (keyId ? MAX_DUE_DAYS : days) * DAY_MS) },
        targetKind === "CITA" ? keyId : undefined,
      )),
    );
  }

  if (businessUnit === tenant.healthUnit) {
    // Without a clinic the tenant has vaccination cards and nothing else to chase.
    const clinical: ReminderKind[] = tenant.hasClinic
      ? ["VACUNA", "PREVENTIVO", "CONTROL", "LABORATORIO"]
      : ["VACUNA"];
    for (const kind of clinical.filter(wants)) {
      const reminders = await listReminders(tenant.daycareId, {
        kind,
        days: String(query.sourceKey ? MAX_DUE_DAYS : days),
      });
      candidates.push(...reminders.map(fromClinicReminder));
    }
  }

  const selected = query.sourceKey
    ? candidates.filter((candidate) => candidate.sourceKey === query.sourceKey)
    : candidates;
  if (selected.length === 0) return [];

  const [settings, timezone] = await Promise.all([
    getUnitReminderSettings(tenant.daycareId, businessUnit),
    getUnitTimezone(tenant.daycareId, businessUnit),
  ]);
  const usable = usableChannels();

  return selected
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.sourceKey.localeCompare(b.sourceKey))
    .slice(0, DUE_CAP)
    .map((candidate) => {
      const decision = resolveChannel(candidate.client, settings, usable);
      return {
        sourceKey: candidate.sourceKey,
        dedupeKey: `${candidate.sourceKey}:${candidate.dueAt.toISOString()}`,
        kind: candidate.kind,
        businessUnit,
        dueAt: candidate.dueAt,
        overdue: candidate.overdue,
        label: candidate.label,
        subject: candidate.subject,
        petId: candidate.petId,
        petNames: candidate.petNames,
        client: candidate.client,
        ...decision,
        alternatives: settings.channels.filter(
          (channel) =>
            resolveChannel(candidate.client, settings, usable, channel).channel === channel,
        ),
        message: renderReminder(
          contentFor(tenant, businessUnit, candidate, settings, timezone),
          decision.channel ?? "WHATSAPP",
        ).text,
      };
    });
}

/** What the templates need to word one reminder. Shared by the preview and the send. */
export function contentFor(
  tenant: TenantContext,
  businessUnit: BusinessUnit,
  item: Pick<Candidate, "kind" | "dueAt" | "petNames" | "client"> & { subject?: string },
  settings: UnitReminderSettings,
  timezone: string,
) {
  return {
    kind: item.kind,
    businessUnit,
    tutor: item.client.firstName,
    business: tenant.name,
    pets: item.petNames,
    subject: item.subject ?? "",
    dueAt: item.dueAt,
    timezone,
    hasClinic: tenant.hasClinic,
    contactPhone: settings.contactPhone,
    contactEmail: settings.contactEmail,
  };
}
