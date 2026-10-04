import { z } from "zod";

export const VISIT_TYPES = [
  "CONSULTA",
  "CONTROL",
  "VACUNACION",
  "URGENCIA",
  "CIRUGIA",
  "HOSPITALIZACION",
] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  CONSULTA: "Consulta",
  CONTROL: "Control",
  VACUNACION: "Vacunación",
  URGENCIA: "Urgencia",
  CIRUGIA: "Cirugía",
  HOSPITALIZACION: "Hospitalización",
};

export const TRIAGE_LEVELS = ["NORMAL", "PRIORITARIA", "URGENCIA"] as const;

export const VISIT_STATUSES = [
  "PROGRAMADA",
  "EN_ESPERA",
  "EN_CONSULTA",
  "CERRADA",
  "CANCELADA",
  "NO_ASISTIO",
] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** Statuses a visit can be moved to by hand. `CERRADA` is only reached by closing it. */
export const SETTABLE_VISIT_STATUSES = [
  "PROGRAMADA",
  "EN_ESPERA",
  "EN_CONSULTA",
  "CANCELADA",
  "NO_ASISTIO",
] as const;

export const SERVICE_CATEGORIES = [
  "CONSULTA",
  "VACUNACION",
  "CIRUGIA",
  "LABORATORIO",
  "IMAGEN",
  "HOSPITALIZACION",
  "PROCEDIMIENTO",
  "OTRO",
] as const;

export const DIAGNOSIS_KINDS = ["PRESUNTIVO", "DEFINITIVO"] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const serviceSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(120),
  category: z.enum(SERVICE_CATEGORIES).default("CONSULTA"),
  durationMinutes: z.number().int().min(5).max(720).default(30),
  basePrice: z.number().min(0).default(0),
  description: optionalText(500),
  isActive: z.boolean().optional(),
});

export const staffSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(120),
  phone: optionalText(40),
  email: z.string().trim().email("Email inválido").optional().or(z.literal("")),
  clinic: optionalText(120),
  licenseNumber: optionalText(60),
  specialty: optionalText(120),
  isExternal: z.boolean().optional(),
  userId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createVisitSchema = z.object({
  clientId: z.string().min(1, "Tutor requerido"),
  petId: z.string().min(1, "Paciente requerido"),
  veterinarianId: z.string().min(1).optional(),
  roomId: z.string().min(1).optional(),
  serviceId: z.string().min(1).optional(),
  type: z.enum(VISIT_TYPES).default("CONSULTA"),
  triage: z.enum(TRIAGE_LEVELS).default("NORMAL"),
  reason: optionalText(1000),
  /** ISO date-time. Omitted for a walk-in, which starts now. */
  startTime: z.string().min(1).optional(),
  durationMinutes: z.number().int().min(5).max(720).optional(),
  notes: optionalText(1000),
});

export const visitStatusSchema = z.object({
  status: z.enum(SETTABLE_VISIT_STATUSES),
});

export const visitRecordSchema = z.object({
  veterinarianId: z.string().min(1).nullable().optional(),
  type: z.enum(VISIT_TYPES).optional(),
  triage: z.enum(TRIAGE_LEVELS).optional(),
  reason: optionalText(1000),
  anamnesis: optionalText(8000),
  physicalExam: optionalText(8000),
  assessment: optionalText(8000),
  plan: optionalText(8000),
  followUpDate: z.string().min(1).nullable().optional(),
});

export const vitalsSchema = z.object({
  takenAt: z.string().min(1).optional(),
  weightKg: z.number().positive().max(200).optional(),
  temperatureC: z.number().min(25).max(45).optional(),
  heartRate: z.number().int().min(0).max(400).optional(),
  respiratoryRate: z.number().int().min(0).max(300).optional(),
  mucousMembranes: optionalText(60),
  capillaryRefill: optionalText(60),
  bodyCondition: z.number().int().min(1).max(9).optional(),
  painScore: z.number().int().min(0).max(10).optional(),
  notes: optionalText(1000),
});

export const diagnosisSchema = z.object({
  description: z.string().trim().min(1, "Descripción requerida").max(500),
  code: optionalText(40),
  kind: z.enum(DIAGNOSIS_KINDS).default("PRESUNTIVO"),
  isChronic: z.boolean().default(false),
});

export const chargeSchema = z.object({
  vetServiceId: z.string().min(1).optional(),
  inventoryItemId: z.string().min(1).optional(),
  description: optionalText(200),
  quantity: z.number().positive().max(10000).default(1),
  unitPrice: z.number().min(0).optional(),
});

export const closeVisitSchema = z.object({
  paymentMethod: z.string().trim().min(1).default("EFECTIVO"),
  discountAmount: z.number().min(0).default(0),
  /** What the tutor pays now. Defaults to the full total. */
  amountPaid: z.number().min(0).optional(),
  notes: optionalText(500),
});

export const paymentSchema = z.object({
  paymentMethod: z.string().trim().min(1).default("EFECTIVO"),
  amount: z.number().positive(),
  notes: optionalText(500),
});

export const patientSchema = z.object({
  bloodType: z.string().trim().max(20).nullable().optional(),
  chronicConditions: z.string().trim().max(2000).nullable().optional(),
  allergies: z.string().trim().max(2000).nullable().optional(),
  deceasedAt: z.string().min(1).nullable().optional(),
  deathCause: z.string().trim().max(500).nullable().optional(),
});
