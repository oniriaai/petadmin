import { api } from "../../lib/api";
import type { BusinessUnit } from "../../modules/shared/contracts";

export type ReminderChannel = "WHATSAPP" | "EMAIL";
/** What a tutor asked for. Null follows the unit's default; NONE is "do not write to me". */
export type ReminderPreference = ReminderChannel | "NONE" | null;
export type ReminderKind = "CITA" | "VACUNA" | "PREVENTIVO" | "CONTROL" | "LABORATORIO";
export type ReminderStatus = "PENDIENTE" | "ENVIADO" | "FALLIDO" | "OMITIDO";

export const CHANNEL_LABELS: Record<ReminderChannel, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Correo",
};

export const KIND_LABELS: Record<ReminderKind, string> = {
  CITA: "Citas",
  VACUNA: "Vacunas",
  PREVENTIVO: "Preventivos",
  CONTROL: "Controles",
  LABORATORIO: "Laboratorio",
};

/** The same kinds in the singular, for the badge on one reminder. */
export const KIND_BADGES: Record<ReminderKind, string> = {
  CITA: "Cita",
  VACUNA: "Vacuna",
  PREVENTIVO: "Preventivo",
  CONTROL: "Control",
  LABORATORIO: "Laboratorio",
};

export const STATUS_LABELS: Record<ReminderStatus, string> = {
  PENDIENTE: "En curso",
  ENVIADO: "Enviado",
  FALLIDO: "No se envió",
  OMITIDO: "Omitido",
};

export interface LastSend {
  id: string;
  status: ReminderStatus;
  channel: ReminderChannel | null;
  trigger: "AUTO" | "MANUAL";
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface DueReminder {
  sourceKey: string;
  kind: ReminderKind;
  businessUnit: BusinessUnit;
  dueAt: string;
  overdue: boolean;
  label: string;
  petId: string | null;
  petNames: string;
  client: { id: string; firstName: string; lastName: string };
  /** The channel the tutor's preference and the unit's settings resolve to. */
  channel: ReminderChannel | null;
  recipient: string | null;
  /** Why nothing would be sent, when `channel` is null. */
  skipReason: string | null;
  alternatives: ReminderChannel[];
  message: string;
  lastSend: LastSend | null;
}

export interface SendResult {
  outcome: "sent" | "skipped" | "failed" | "duplicate";
  id: string | null;
  channel: ReminderChannel | null;
  recipient: string | null;
  reason: string | null;
}

export interface ReminderLogEntry {
  id: string;
  businessUnit: BusinessUnit;
  kind: ReminderKind;
  sourceKey: string;
  channel: ReminderChannel | null;
  recipient: string | null;
  status: ReminderStatus;
  trigger: "AUTO" | "MANUAL";
  attempts: number;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  client: { id: string; firstName: string; lastName: string } | null;
  pet: { id: string; name: string } | null;
}

export interface ReminderLogPage {
  items: ReminderLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** `simulated`: no provider behind the channel, so a send only reaches the server's log. */
export type ChannelMode = "live" | "simulated" | null;
export type ChannelAvailability = Record<ReminderChannel, ChannelMode>;

/** How one unit sends reminders. Mirrors `UnitReminderSettings` on the server. */
export interface UnitReminderSettings {
  auto: boolean;
  channels: ReminderChannel[];
  defaultChannel: ReminderChannel;
  leadDays: number;
  contactPhone: string | null;
  contactEmail: string | null;
}

export const remindersApi = {
  due: (params: { days?: string; kind?: string } = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
    ).toString();
    return api.get<DueReminder[]>(`/reminders/due${query ? `?${query}` : ""}`);
  },
  send: (sourceKey: string, channel?: ReminderChannel) =>
    api.post<SendResult>("/reminders/send", { sourceKey, ...(channel ? { channel } : {}) }),
  log: (page: number, pageSize = 25) =>
    api.get<ReminderLogPage>(`/reminders/log?page=${page}&pageSize=${pageSize}`),
  channels: () => api.get<ChannelAvailability>("/reminders/channels"),
};
