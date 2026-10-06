import { prisma } from "../../db";

export const DEFAULT_TIMEZONE = "America/Guayaquil";
/** Ecuador's standard VAT. The rate new reservations and appointments use when unconfigured. */
export const DEFAULT_VAT_PERCENT = 15;

export interface UnitSettings {
  timezone: string;
  vatPercent: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { expiresAt: number; value: UnitSettings }>();

const keyFor = (daycareId: string, businessUnit: string) => `${daycareId}:${businessUnit}`;

/**
 * Settings for one business-unit slot of one daycare.
 *
 * Settings are per tenant: the unique key is (daycareId, businessUnit), so this needs both.
 * Missing values fall back to defaults rather than throwing — an unconfigured unit must not stop
 * reservation generation or pricing.
 *
 * Memoised briefly because this sits on the write path of every reservation and appointment, and
 * on every occurrence the scheduler evaluates. `invalidateUnitSettings` is called when the
 * settings screen writes.
 */
export async function getUnitSettings(
  daycareId: string,
  businessUnit: string,
): Promise<UnitSettings> {
  const key = keyFor(daycareId, businessUnit);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const setting = await prisma.businessUnitSetting.findUnique({
    where: { daycareId_businessUnit: { daycareId, businessUnit } },
    select: { timezone: true, vatPercent: true },
  });

  const value: UnitSettings = {
    timezone: setting?.timezone || DEFAULT_TIMEZONE,
    vatPercent: setting?.vatPercent ?? DEFAULT_VAT_PERCENT,
  };
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function getUnitTimezone(daycareId: string, businessUnit: string): Promise<string> {
  return (await getUnitSettings(daycareId, businessUnit)).timezone;
}

/** The unit's default VAT, used when a request does not state one explicitly. */
export async function getUnitVatPercent(daycareId: string, businessUnit: string): Promise<number> {
  return (await getUnitSettings(daycareId, businessUnit)).vatPercent;
}

export const REMINDER_CHANNELS = ["WHATSAPP", "EMAIL"] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];
export const DEFAULT_REMINDER_LEAD_DAYS = 7;

/** How one unit sends reminders to tutors. */
export interface UnitReminderSettings {
  /** Whether the scheduled job sends for this unit. Manual sending does not depend on it. */
  auto: boolean;
  channels: ReminderChannel[];
  defaultChannel: ReminderChannel;
  leadDays: number;
  contactPhone: string | null;
  contactEmail: string | null;
}

export const reminderSettingsSelect = {
  remindersAuto: true,
  reminderChannels: true,
  reminderDefaultChannel: true,
  reminderLeadDays: true,
  contactPhone: true,
  contactEmail: true,
} as const;

/**
 * Reminder settings from a stored row, or the defaults for a unit that has none. Automatic
 * sending is off by default: these messages reach real people.
 */
export function toReminderSettings(
  row?: {
    remindersAuto: boolean;
    reminderChannels: string[];
    reminderDefaultChannel: string;
    reminderLeadDays: number;
    contactPhone: string | null;
    contactEmail: string | null;
  } | null,
): UnitReminderSettings {
  const known = (value: string): value is ReminderChannel =>
    (REMINDER_CHANNELS as readonly string[]).includes(value);
  const channels = row ? row.reminderChannels.filter(known) : [...REMINDER_CHANNELS];
  const stored = row?.reminderDefaultChannel ?? "WHATSAPP";
  return {
    auto: row?.remindersAuto ?? false,
    channels,
    defaultChannel:
      known(stored) && channels.includes(stored) ? stored : (channels[0] ?? "WHATSAPP"),
    leadDays: row?.reminderLeadDays ?? DEFAULT_REMINDER_LEAD_DAYS,
    contactPhone: row?.contactPhone ?? null,
    contactEmail: row?.contactEmail ?? null,
  };
}

/** Not cached: it is read when a reminder is listed or sent, never on a request's hot path. */
export async function getUnitReminderSettings(
  daycareId: string,
  businessUnit: string,
): Promise<UnitReminderSettings> {
  const row = await prisma.businessUnitSetting.findUnique({
    where: { daycareId_businessUnit: { daycareId, businessUnit } },
    select: reminderSettingsSelect,
  });
  return toReminderSettings(row);
}

export function invalidateUnitSettings(daycareId: string, businessUnit?: string): void {
  if (businessUnit) {
    cache.delete(keyFor(daycareId, businessUnit));
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${daycareId}:`)) cache.delete(key);
  }
}
