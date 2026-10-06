import type { Channel } from "../../core/messaging";

/**
 * Every word a tutor reads in a reminder, in one place.
 *
 * The voice is the brand's (BRAND.md): close, clear, honest, `tú`, at most one exclamation
 * mark and no emoji. Each message names the business first, because the tutor knows the
 * business and not the software, and is signed as sent with Argos Suite.
 *
 * WhatsApp only lets a business open a conversation with a template Meta has approved, so the
 * bodies below are exactly the texts registered there, `{{n}}` placeholders and all
 * (`docs/recordatorios.md`). Email and the on-screen preview fill in the same body, which is
 * what keeps the two channels saying the same thing.
 */

export const REMINDER_KINDS = ["CITA", "VACUNA", "PREVENTIVO", "CONTROL", "LABORATORIO"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  CITA: "Cita",
  VACUNA: "Vacuna",
  PREVENTIVO: "Preventivo",
  CONTROL: "Control",
  LABORATORIO: "Laboratorio",
};

export type TemplateId =
  "CITA" | "VACUNA_CLINICA" | "VACUNA_AVISO" | "PREVENTIVO" | "CONTROL" | "LABORATORIO";

export interface MessageTemplate {
  /** The template's name in Meta Business Manager. */
  name: string;
  body: string;
  /** What each `{{n}}` is, in order. Documentation for whoever registers the template. */
  params: readonly string[];
  /** A sample value per parameter, as Meta asks for when a template is submitted. */
  example: readonly string[];
}

export const WHATSAPP_FOOTER = "Enviado con Argos Suite. Este número no recibe respuestas.";
export const SIGNATURE = "Enviado con Argos Suite";

export const MESSAGE_TEMPLATES: Record<TemplateId, MessageTemplate> = {
  CITA: {
    name: "argos_recordatorio_cita",
    body: "Hola {{1}}, te escribimos de {{2}}. Te recordamos la {{3}} de {{4}} el {{5}} a las {{6}}. Si necesitas cambiarla, escríbenos {{7}}.",
    params: ["tutor", "negocio", "servicio", "mascota", "fecha", "hora", "contacto"],
    example: [
      "Ana",
      "Peluquería Canina Luna",
      "cita de peluquería",
      "Max",
      "miércoles 7 de octubre",
      "10:00",
      "al 099 123 4567",
    ],
  },
  VACUNA_CLINICA: {
    name: "argos_recordatorio_vacuna",
    body: "Hola {{1}}, te escribimos de {{2}}. {{3}} tiene pendiente el refuerzo de {{4}}, previsto para el {{5}}. Para agendar su cita, escríbenos {{6}}.",
    params: ["tutor", "negocio", "mascota", "vacuna", "fecha", "contacto"],
    example: [
      "Ana",
      "Clínica Veterinaria Sur",
      "Max",
      "Antirrábica",
      "12 de octubre",
      "al 099 123 4567",
    ],
  },
  VACUNA_AVISO: {
    name: "argos_aviso_vacuna",
    body: "Hola {{1}}, te escribimos de {{2}}. Según nuestra ficha, {{3}} tiene pendiente renovar la vacuna {{4}}, prevista para el {{5}}. Cuando la tenga al día, cuéntanos {{6}} y actualizamos su ficha.",
    params: ["tutor", "negocio", "mascota", "vacuna", "fecha", "contacto"],
    example: ["Ana", "Guardería Patitas", "Max", "Antirrábica", "12 de octubre", "al 099 123 4567"],
  },
  PREVENTIVO: {
    name: "argos_recordatorio_preventivo",
    body: "Hola {{1}}, te escribimos de {{2}}. {{3}} tiene pendiente su próxima dosis de {{4}}, prevista para el {{5}}. Para agendar su cita, escríbenos {{6}}.",
    params: ["tutor", "negocio", "mascota", "producto", "fecha", "contacto"],
    example: [
      "Ana",
      "Clínica Veterinaria Sur",
      "Max",
      "Bravecto",
      "12 de octubre",
      "al 099 123 4567",
    ],
  },
  CONTROL: {
    name: "argos_recordatorio_control",
    body: "Hola {{1}}, te escribimos de {{2}}. {{3}} tiene un control pendiente, previsto para el {{4}}. Para agendar su cita, escríbenos {{5}}.",
    params: ["tutor", "negocio", "mascota", "fecha", "contacto"],
    example: ["Ana", "Clínica Veterinaria Sur", "Max", "12 de octubre", "al 099 123 4567"],
  },
  LABORATORIO: {
    name: "argos_aviso_laboratorio",
    body: "Hola {{1}}, te escribimos de {{2}}. Seguimos a la espera del resultado de {{3}} de {{4}}. Te avisaremos en cuanto llegue.",
    params: ["tutor", "negocio", "examen", "mascota"],
    example: ["Ana", "Clínica Veterinaria Sur", "hemograma", "Max"],
  },
};

/** How a visit is named to the tutor, by the unit it belongs to. Always feminine: "la ... de". */
const SERVICE_LABELS: Record<string, string> = {
  DAYCARE: "reserva de guardería",
  GROOMING: "cita de peluquería",
  VETERINARY: "consulta veterinaria",
};

export interface ReminderContent {
  kind: ReminderKind;
  businessUnit: string;
  /** The tutor's first name. */
  tutor: string;
  /** The tenant's name as its customers know it. */
  business: string;
  /** One pet, or several joined for reading ("Luna y Max"). */
  pets: string;
  /** The vaccine, the product or the test. Unused for an appointment or a follow-up. */
  subject: string;
  dueAt: Date;
  timezone: string;
  /** Whether the business can give the vaccine itself, or can only ask for the card. */
  hasClinic: boolean;
  contactPhone: string | null;
  contactEmail: string | null;
}

export interface RenderedReminder {
  template: MessageTemplate;
  params: string[];
  /** The body with its parameters filled in: the sentence the tutor reads on either channel. */
  text: string;
  subject: string;
  headline: string;
}

/** "Luna", "Luna y Max", "Luna, Max y Toby". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "tu mascota";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/**
 * A due date is stored as a calendar date at midnight UTC; an appointment is a real instant.
 * Reading the first in Guayaquil would put it on the evening before, so a value with no time of
 * day is formatted in UTC and everything else in the unit's zone.
 */
function zoneFor(date: Date, timezone: string): string {
  const dateOnly =
    date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
  return dateOnly ? "UTC" : timezone;
}

export function formatDay(date: Date, timezone: string, withWeekday = false): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: zoneFor(date, timezone),
    weekday: withWeekday ? "long" : undefined,
    day: "numeric",
    month: "long",
  })
    .format(date)
    .replace(",", "");
}

export function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** How the tutor reaches the business back. Never empty: a template parameter cannot be. */
function contactPhrase(content: ReminderContent, channel: Channel): string {
  if (channel === "EMAIL" && content.contactEmail) return "respondiendo a este correo";
  if (content.contactPhone) return `al ${content.contactPhone}`;
  if (content.contactEmail) return `a ${content.contactEmail}`;
  return "por nuestros canales de siempre";
}

export function fillTemplate(body: string, params: readonly string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_match, index: string) => params[Number(index) - 1] ?? "");
}

export function renderReminder(content: ReminderContent, channel: Channel): RenderedReminder {
  const contact = contactPhrase(content, channel);
  const day = formatDay(content.dueAt, content.timezone);
  const { tutor, business, pets, subject } = content;

  let id: TemplateId;
  let params: string[];
  let emailSubject: string;
  let headline: string;

  switch (content.kind) {
    case "CITA": {
      const service = SERVICE_LABELS[content.businessUnit] ?? "cita";
      id = "CITA";
      params = [
        tutor,
        business,
        service,
        pets,
        formatDay(content.dueAt, content.timezone, true),
        formatTime(content.dueAt, content.timezone),
        contact,
      ];
      emailSubject = `Recordatorio: ${service} de ${pets}`;
      headline = `La ${service} de ${pets} se acerca`;
      break;
    }
    case "VACUNA":
      id = content.hasClinic ? "VACUNA_CLINICA" : "VACUNA_AVISO";
      params = [tutor, business, pets, subject, day, contact];
      emailSubject = `${pets} tiene una vacuna por renovar`;
      headline = `Una vacuna de ${pets} está por renovarse`;
      break;
    case "PREVENTIVO":
      id = "PREVENTIVO";
      params = [tutor, business, pets, subject, day, contact];
      emailSubject = `${pets} tiene una dosis pendiente`;
      headline = `La próxima dosis de ${pets}`;
      break;
    case "CONTROL":
      id = "CONTROL";
      params = [tutor, business, pets, day, contact];
      emailSubject = `${pets} tiene un control pendiente`;
      headline = `El control de ${pets}`;
      break;
    case "LABORATORIO":
      id = "LABORATORIO";
      params = [tutor, business, subject, pets];
      emailSubject = `El resultado de ${pets} sigue en camino`;
      headline = `Seguimos pendientes del resultado de ${pets}`;
      break;
  }

  const template = MESSAGE_TEMPLATES[id];
  return {
    template,
    params,
    text: fillTemplate(template.body, params),
    subject: emailSubject,
    headline,
  };
}
