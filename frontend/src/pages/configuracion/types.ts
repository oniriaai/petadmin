import { ApiError } from "../../lib/api";
import type { BusinessUnit } from "../../modules/shared/contracts";
import type { ReminderChannel, UnitReminderSettings } from "../recordatorios/api";

export const REMINDER_CHANNELS: readonly ReminderChannel[] = ["WHATSAPP", "EMAIL"];

export interface UnitSetting {
  businessUnit: BusinessUnit;
  timezone: string;
  vatPercent: number;
  reminders: UnitReminderSettings;
  isConfigured: boolean;
  updatedAt: string | null;
}

export interface SettingsResponse {
  daycare: {
    id: string;
    slug: string;
    name: string;
    legalName: string | null;
    timezone: string;
    isActive: boolean;
  };
  units: UnitSetting[];
}

/** Numbers are kept as typed, so a field can be emptied on the way to a new value. */
export interface GeneralDraft {
  timezone: string;
  vatPercent: string;
}

export interface RemindersDraft {
  auto: boolean;
  channels: ReminderChannel[];
  defaultChannel: ReminderChannel;
  leadDays: string;
  contactPhone: string;
  contactEmail: string;
}

export type FieldErrors<D> = Partial<Record<keyof D, string>>;

export function generalDraftOf(unit: UnitSetting): GeneralDraft {
  return { timezone: unit.timezone, vatPercent: String(unit.vatPercent) };
}

export function validateGeneral(draft: GeneralDraft): FieldErrors<GeneralDraft> {
  const errors: FieldErrors<GeneralDraft> = {};
  const vat = Number(draft.vatPercent);
  if (draft.vatPercent.trim() === "" || !Number.isFinite(vat) || vat < 0 || vat > 100) {
    errors.vatPercent = "Escribe un porcentaje entre 0 y 100.";
  }
  if (draft.timezone.trim() === "") errors.timezone = "Elige una zona horaria.";
  return errors;
}

export function generalPayload(draft: GeneralDraft) {
  return { timezone: draft.timezone.trim(), vatPercent: Number(draft.vatPercent) };
}

export function remindersDraftOf(unit: UnitSetting): RemindersDraft {
  const { reminders } = unit;
  return {
    auto: reminders.auto,
    // In catalog order, so a draft compares equal to what the server stored.
    channels: REMINDER_CHANNELS.filter((channel) => reminders.channels.includes(channel)),
    defaultChannel: reminders.defaultChannel,
    leadDays: String(reminders.leadDays),
    contactPhone: reminders.contactPhone ?? "",
    contactEmail: reminders.contactEmail ?? "",
  };
}

export function validateReminders(draft: RemindersDraft): FieldErrors<RemindersDraft> {
  const errors: FieldErrors<RemindersDraft> = {};
  const days = Number(draft.leadDays);
  if (draft.leadDays.trim() === "" || !Number.isInteger(days) || days < 1 || days > 30) {
    errors.leadDays = "Escribe un número de días entre 1 y 30.";
  }
  const email = draft.contactEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.contactEmail = "Revisa el correo: le falta algo, como la @ o el dominio.";
  }
  return errors;
}

export function remindersPayload(draft: RemindersDraft) {
  return {
    reminders: {
      auto: draft.auto,
      channels: draft.channels,
      defaultChannel: draft.defaultChannel,
      leadDays: Number(draft.leadDays),
      contactPhone: draft.contactPhone.trim() || null,
      contactEmail: draft.contactEmail.trim() || null,
    },
  };
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
