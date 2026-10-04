import { api } from "../../lib/api";

export type VisitStatus =
  "PROGRAMADA" | "EN_ESPERA" | "EN_CONSULTA" | "CERRADA" | "CANCELADA" | "NO_ASISTIO";

export const VISIT_STATUS: Record<VisitStatus, { label: string; color: string }> = {
  PROGRAMADA: { label: "Programada", color: "bg-blue-100 text-blue-800" },
  EN_ESPERA: { label: "En espera", color: "bg-amber-100 text-amber-800" },
  EN_CONSULTA: { label: "En consulta", color: "bg-veterinary-100 text-veterinary-800" },
  CERRADA: { label: "Cerrada", color: "bg-gray-100 text-gray-700" },
  CANCELADA: { label: "Cancelada", color: "bg-red-100 text-red-700" },
  NO_ASISTIO: { label: "No asistió", color: "bg-red-100 text-red-700" },
};

export const VISIT_TYPES: Record<string, string> = {
  CONSULTA: "Consulta",
  CONTROL: "Control",
  VACUNACION: "Vacunación",
  URGENCIA: "Urgencia",
  CIRUGIA: "Cirugía",
  HOSPITALIZACION: "Hospitalización",
};

export const TRIAGE: Record<string, { label: string; color: string }> = {
  NORMAL: { label: "Normal", color: "bg-gray-100 text-gray-700" },
  PRIORITARIA: { label: "Prioritaria", color: "bg-amber-100 text-amber-800" },
  URGENCIA: { label: "Urgencia", color: "bg-red-100 text-red-800" },
};

export const SERVICE_CATEGORIES: Record<string, string> = {
  CONSULTA: "Consulta",
  VACUNACION: "Vacunación",
  CIRUGIA: "Cirugía",
  LABORATORIO: "Laboratorio",
  IMAGEN: "Imagen",
  HOSPITALIZACION: "Hospitalización",
  PROCEDIMIENTO: "Procedimiento",
  OTRO: "Otro",
};

export interface VetService {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  basePrice: number;
  description?: string | null;
  isActive: boolean;
}

export interface VetStaff {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  clinic?: string | null;
  licenseNumber?: string | null;
  specialty?: string | null;
  isExternal: boolean;
  userId?: string | null;
  isActive: boolean;
  user?: { id: string; username: string; name: string } | null;
}

export interface VisitPet {
  id: string;
  name: string;
  species: string;
  breed?: string | null;
  photoUrl?: string | null;
}

export interface VisitClient {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}

export interface VisitSummary {
  id: string;
  status: VisitStatus;
  type: string;
  triage: string;
  reason?: string | null;
  followUpDate?: string | null;
  pet: VisitPet;
  client: VisitClient;
  veterinarian?: { id: string; name: string } | null;
  reservation: {
    id: string;
    checkIn: string;
    checkOut: string;
    service: string;
    totalAmount: number;
    pendingAmount: number;
    room?: { id: string; name: string } | null;
  };
}

export interface Vitals {
  id: string;
  takenAt: string;
  weightKg?: number | null;
  temperatureC?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  mucousMembranes?: string | null;
  capillaryRefill?: string | null;
  bodyCondition?: number | null;
  painScore?: number | null;
  notes?: string | null;
}

export interface Diagnosis {
  id: string;
  description: string;
  code?: string | null;
  kind: "PRESUNTIVO" | "DEFINITIVO";
  isChronic: boolean;
  createdAt: string;
}

export interface VisitCharge {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface VisitIncome {
  id: string;
  total: number;
  paymentMethod: string;
  date: string;
  concept: string;
}

export interface Vaccination {
  id: string;
  name: string;
  date: string;
  nextDue?: string | null;
  lotNumber?: string | null;
  manufacturer?: string | null;
  vetVisitId?: string | null;
}

export const PREVENTIVE_KINDS: Record<string, string> = {
  DESPARASITACION_INTERNA: "Desparasitación interna",
  DESPARASITACION_EXTERNA: "Desparasitación externa",
  OTRO: "Otro preventivo",
};

export interface Preventive {
  id: string;
  kind: string;
  product: string;
  dose?: string | null;
  weightKg?: number | null;
  date: string;
  nextDue?: string | null;
}

export interface StockItem {
  id: string;
  name: string;
  category?: string;
  unit: string;
  currentStock?: number;
  minStock?: number;
  isControlled?: boolean;
}

export interface PrescriptionItem {
  id: string;
  drug: string;
  presentation?: string | null;
  dose: string;
  route?: string | null;
  frequency: string;
  durationDays?: number | null;
  instructions?: string | null;
  inventoryItemId?: string | null;
  inventoryItem?: StockItem | null;
  quantityDispensed?: number | null;
  dispensedAt?: string | null;
  lotNumber?: string | null;
}

export interface Prescription {
  id: string;
  issuedAt: string;
  notes?: string | null;
  items: PrescriptionItem[];
  veterinarian?: { id: string; name: string; licenseNumber?: string | null } | null;
}

export interface PrintablePrescription extends Prescription {
  pet: PatientProfile & {
    client: {
      firstName: string;
      lastName: string;
      phone?: string | null;
      idNumber?: string | null;
    };
  };
}

/** A prescription line with the patient and prescriber it belongs to, as the pharmacy sees it. */
export interface PharmacyLine extends PrescriptionItem {
  prescription: {
    id: string;
    issuedAt: string;
    visitId: string;
    veterinarian?: { id: string; name: string; licenseNumber?: string | null } | null;
    pet: {
      id: string;
      name: string;
      client: { firstName: string; lastName: string; idNumber?: string | null };
    };
  };
}

export interface ExpiringLot {
  id: string;
  lotNumber?: string | null;
  expiresAt: string;
  quantity: number;
  item: StockItem;
}

export const PROCEDURE_KINDS: Record<string, string> = {
  CIRUGIA: "Cirugía",
  PROCEDIMIENTO: "Procedimiento",
  EUTANASIA: "Eutanasia",
};

export const PROCEDURE_STATUS: Record<string, { label: string; color: string }> = {
  PROGRAMADO: { label: "Programado", color: "bg-blue-100 text-blue-800" },
  EN_CURSO: { label: "En curso", color: "bg-amber-100 text-amber-800" },
  FINALIZADO: { label: "Finalizado", color: "bg-emerald-100 text-emerald-800" },
  CANCELADO: { label: "Cancelado", color: "bg-gray-100 text-gray-700" },
};

export interface Procedure {
  id: string;
  visitId: string;
  name: string;
  kind: string;
  status: string;
  asaRisk?: number | null;
  anesthesiaProtocol?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  findings?: string | null;
  complications?: string | null;
  createdAt: string;
  veterinarian?: { id: string; name: string } | null;
}

export const LAB_KINDS: Record<string, string> = {
  LABORATORIO: "Laboratorio",
  IMAGEN: "Imagen",
};

export const LAB_STATUS: Record<string, { label: string; color: string }> = {
  SOLICITADO: { label: "Solicitado", color: "bg-blue-100 text-blue-800" },
  EN_PROCESO: { label: "En proceso", color: "bg-amber-100 text-amber-800" },
  RESULTADO: { label: "Con resultado", color: "bg-emerald-100 text-emerald-800" },
};

export const LAB_FLAGS: Record<string, { label: string; color: string }> = {
  NORMAL: { label: "Normal", color: "bg-gray-100 text-gray-700" },
  ALTO: { label: "Alto", color: "bg-amber-100 text-amber-800" },
  BAJO: { label: "Bajo", color: "bg-amber-100 text-amber-800" },
  CRITICO: { label: "Crítico", color: "bg-red-100 text-red-800" },
};

export interface LabResultValue {
  id: string;
  analyte: string;
  value: string;
  unit?: string | null;
  referenceRange?: string | null;
  flag?: string | null;
}

export interface LabOrder {
  id: string;
  visitId: string;
  kind: string;
  test: string;
  externalLab?: string | null;
  status: string;
  notes?: string | null;
  requestedAt: string;
  resultSummary?: string | null;
  resultAt?: string | null;
  values: LabResultValue[];
}

/** A lab order with the patient and tutor it belongs to, as the laboratory desk sees it. */
export interface LabDeskOrder extends LabOrder {
  pet: VisitPet;
  visit: {
    id: string;
    client: { id: string; firstName: string; lastName: string; phone?: string | null };
    veterinarian?: { id: string; name: string } | null;
  };
}

export const CONSENT_TYPES: Record<string, string> = {
  CIRUGIA: "Cirugía",
  ANESTESIA: "Anestesia",
  HOSPITALIZACION: "Hospitalización",
  EUTANASIA: "Eutanasia",
};

export interface Consent {
  id: string;
  type: string;
  text: string;
  signedByName?: string | null;
  signedAt?: string | null;
  createdAt: string;
}

export interface PrintableConsent extends Consent {
  pet: VisitPet & { birthdate?: string | null };
  client: {
    firstName: string;
    lastName: string;
    idNumber?: string | null;
    phone?: string | null;
  };
  visit?: { veterinarian?: { name: string; licenseNumber?: string | null } | null } | null;
}

/** An inpatient stay as a visit or the history lists it. */
export interface StaySummary {
  id: string;
  visitId: string;
  status: "INGRESADO" | "ALTA";
  reason: string;
  dailyRate: number;
  admittedAt: string;
  dischargedAt?: string | null;
  dischargeSummary?: string | null;
  homeCareInstructions?: string | null;
  room: { id: string; name: string };
}

export interface TreatmentDose {
  id: string;
  scheduledAt: string;
  administeredAt?: string | null;
  skippedReason?: string | null;
  notes?: string | null;
  administeredBy?: { id: string; name: string } | null;
}

export interface TreatmentOrder {
  id: string;
  description: string;
  drug?: string | null;
  dose?: string | null;
  route?: string | null;
  everyHours?: number | null;
  startAt: string;
  endAt?: string | null;
  isActive: boolean;
  /** When the next dose falls; null when nothing more is due. */
  nextDueAt: string | null;
  /** Newest first. */
  administrations: TreatmentDose[];
}

/** A stay with everything the ward works from. */
export interface Stay extends StaySummary {
  pet: VisitPet & {
    sex?: string;
    birthdate?: string | null;
    weight?: number | null;
    allergies?: string | null;
  };
  visit: {
    id: string;
    status: VisitStatus;
    client: VisitClient;
    veterinarian?: { id: string; name: string; licenseNumber?: string | null } | null;
  };
  orders: TreatmentOrder[];
  vitals: Vitals[];
}

export interface Ward {
  id: string;
  name: string;
  capacity: number;
  occupied: number;
}

export type ReminderKind = "VACUNA" | "PREVENTIVO" | "CONTROL" | "LABORATORIO";

export const REMINDER_KINDS: Record<ReminderKind, string> = {
  VACUNA: "Vacunas",
  PREVENTIVO: "Preventivos",
  CONTROL: "Controles",
  LABORATORIO: "Laboratorio",
};

export interface Reminder {
  id: string;
  kind: ReminderKind;
  dueAt: string;
  overdue: boolean;
  label: string;
  pet: { id: string; name: string };
  client: VisitClient;
  visitId?: string | null;
}

export interface ClinicSummary {
  from: string;
  to: string;
  visits: {
    total: number;
    missed: number;
    byType: Array<{ type: string; count: number }>;
    byVeterinarian: Array<{ veterinarianId: string | null; name: string; count: number }>;
  };
  revenue: {
    billed: number;
    collected: number;
    byCategory: Array<{ category: string; amount: number }>;
  };
  topDiagnoses: Array<{ description: string; count: number }>;
  hospital: {
    admissions: number;
    discharges: number;
    averageStayDays: number | null;
    wards: Ward[];
  };
}

export interface PatientProfile extends VisitPet {
  sex?: string;
  birthdate?: string | null;
  weight?: number | null;
  isNeutered?: boolean;
  allergies?: string | null;
  chronicConditions?: string | null;
  bloodType?: string | null;
  microchip?: string | null;
  deceasedAt?: string | null;
  deathCause?: string | null;
}

export interface VisitDetail extends Omit<VisitSummary, "pet" | "reservation" | "veterinarian"> {
  anamnesis?: string | null;
  physicalExam?: string | null;
  assessment?: string | null;
  plan?: string | null;
  closedAt?: string | null;
  pet: PatientProfile;
  veterinarian?: { id: string; name: string; licenseNumber?: string | null } | null;
  reservation: VisitSummary["reservation"] & {
    status: string;
    basePrice: number;
    discountAmount: number;
    vatPercent: number;
    vatAmount: number;
    advanceAmount: number;
    paymentMethod?: string | null;
    incomes: VisitIncome[];
  };
  vitals: Vitals[];
  diagnoses: Diagnosis[];
  charges: VisitCharge[];
  vaccinations: Vaccination[];
  preventives: Preventive[];
  prescriptions: Prescription[];
  hospitalizations: StaySummary[];
  procedures: Procedure[];
  labOrders: LabOrder[];
  consents: Consent[];
}

export interface PatientHistory {
  pet: PatientProfile & {
    client: VisitClient;
    vaccinations: Vaccination[];
    documents: Array<{ id: string; name: string; type: string; uploadedAt: string }>;
  };
  visits: Array<{
    id: string;
    status: VisitStatus;
    type: string;
    reason?: string | null;
    assessment?: string | null;
    plan?: string | null;
    veterinarian?: { id: string; name: string } | null;
    reservation: { checkIn: string; service: string; totalAmount: number };
    diagnoses: Diagnosis[];
  }>;
  vitals: Vitals[];
  chronicDiagnoses: Diagnosis[];
  preventives: Preventive[];
  prescriptions: Prescription[];
  hospitalizations: StaySummary[];
  procedures: Procedure[];
  labOrders: LabOrder[];
  consents: Consent[];
}

export interface ClinicRoom {
  id: string;
  name: string;
  type: string;
  businessUnit: string;
  isActive: boolean;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const veterinariaApi = {
  services: (includeInactive = false) =>
    api.get<VetService[]>(`/veterinaria/services${includeInactive ? "?includeInactive=true" : ""}`),
  createService: (body: Partial<VetService>) => api.post<VetService>("/veterinaria/services", body),
  updateService: (id: string, body: Partial<VetService>) =>
    api.put<VetService>(`/veterinaria/services/${id}`, body),
  removeService: (id: string) => api.del(`/veterinaria/services/${id}`),

  staff: (includeInactive = false) =>
    api.get<VetStaff[]>(`/veterinaria/staff${includeInactive ? "?includeInactive=true" : ""}`),
  createStaff: (body: Partial<VetStaff>) => api.post<VetStaff>("/veterinaria/staff", body),
  updateStaff: (id: string, body: Partial<VetStaff>) =>
    api.put<VetStaff>(`/veterinaria/staff/${id}`, body),
  removeStaff: (id: string) => api.del(`/veterinaria/staff/${id}`),

  /** Consulting rooms, theatre and wards: the shared rooms list, narrowed to the clinic. */
  rooms: async () =>
    (await api.get<ClinicRoom[]>("/rooms")).filter(
      (room) => room.businessUnit === "VETERINARY" && room.isActive !== false,
    ),

  visits: (params: {
    from?: string;
    to?: string;
    veterinarianId?: string;
    petId?: string;
    status?: string;
  }) => api.get<VisitSummary[]>(`/veterinaria/visits${query(params)}`),
  visit: (id: string) => api.get<VisitDetail>(`/veterinaria/visits/${id}`),
  createVisit: (body: Record<string, unknown>) =>
    api.post<VisitSummary>("/veterinaria/visits", body),
  updateVisit: (id: string, body: Record<string, unknown>) =>
    api.patch<VisitDetail>(`/veterinaria/visits/${id}`, body),
  setStatus: (id: string, status: VisitStatus) =>
    api.patch<VisitSummary>(`/veterinaria/visits/${id}/status`, { status }),
  removeVisit: (id: string) => api.del(`/veterinaria/visits/${id}`),

  addVitals: (id: string, body: Record<string, unknown>) =>
    api.post<Vitals>(`/veterinaria/visits/${id}/vitals`, body),
  addDiagnosis: (id: string, body: Record<string, unknown>) =>
    api.post<Diagnosis>(`/veterinaria/visits/${id}/diagnoses`, body),
  addCharge: (id: string, body: Record<string, unknown>) =>
    api.post<VisitCharge>(`/veterinaria/visits/${id}/charges`, body),
  removeChild: (
    id: string,
    kind:
      | "vitals"
      | "diagnoses"
      | "charges"
      | "vaccinations"
      | "prescriptions"
      | "procedures"
      | "lab-orders"
      | "consents",
    childId: string,
  ) => api.del(`/veterinaria/visits/${id}/${kind}/${childId}`),

  close: (id: string, body: Record<string, unknown>) =>
    api.post<VisitDetail>(`/veterinaria/visits/${id}/close`, body),
  pay: (id: string, body: Record<string, unknown>) =>
    api.post<VisitDetail>(`/veterinaria/visits/${id}/payments`, body),

  addVaccination: (id: string, body: Record<string, unknown>) =>
    api.post<Vaccination>(`/veterinaria/visits/${id}/vaccinations`, body),
  addPreventive: (id: string, body: Record<string, unknown>) =>
    api.post<Preventive>(`/veterinaria/visits/${id}/preventives`, body),
  removePreventive: (petId: string, id: string) =>
    api.del(`/veterinaria/patients/${petId}/preventives/${id}`),
  addPrescription: (id: string, body: Record<string, unknown>) =>
    api.post<Prescription>(`/veterinaria/visits/${id}/prescriptions`, body),
  prescription: (id: string) => api.get<PrintablePrescription>(`/veterinaria/prescriptions/${id}`),
  dispense: (itemId: string, body: Record<string, unknown>) =>
    api.post<PrescriptionItem>(`/veterinaria/prescription-items/${itemId}/dispense`, body),

  pharmacyItems: () => api.get<StockItem[]>("/veterinaria/pharmacy/items"),
  pharmacyQueue: () => api.get<PharmacyLine[]>("/veterinaria/pharmacy/queue"),
  controlledLog: (params: { from?: string; to?: string }) =>
    api.get<PharmacyLine[]>(`/veterinaria/pharmacy/controlled-log${query(params)}`),
  expiringLots: () => api.get<ExpiringLot[]>("/veterinaria/pharmacy/expiring"),

  wards: () => api.get<Ward[]>("/veterinaria/hospitalizations/wards"),
  stays: (status?: "INGRESADO" | "ALTA") =>
    api.get<Stay[]>(`/veterinaria/hospitalizations${query({ status })}`),
  stay: (id: string) => api.get<Stay>(`/veterinaria/hospitalizations/${id}`),
  admit: (visitId: string, body: Record<string, unknown>) =>
    api.post<Stay>(`/veterinaria/visits/${visitId}/hospitalizations`, body),
  discharge: (id: string, body: Record<string, unknown>) =>
    api.post<Stay>(`/veterinaria/hospitalizations/${id}/discharge`, body),
  addWardVitals: (id: string, body: Record<string, unknown>) =>
    api.post<Vitals>(`/veterinaria/hospitalizations/${id}/vitals`, body),
  addTreatmentOrder: (id: string, body: Record<string, unknown>) =>
    api.post<TreatmentOrder>(`/veterinaria/hospitalizations/${id}/orders`, body),
  stopTreatmentOrder: (orderId: string) =>
    api.post(`/veterinaria/treatment-orders/${orderId}/stop`, {}),
  recordDose: (orderId: string, body: Record<string, unknown>) =>
    api.post<TreatmentDose>(`/veterinaria/treatment-orders/${orderId}/doses`, body),

  addProcedure: (visitId: string, body: Record<string, unknown>) =>
    api.post<Procedure>(`/veterinaria/visits/${visitId}/procedures`, body),
  startProcedure: (id: string) => api.post<Procedure>(`/veterinaria/procedures/${id}/start`, {}),
  finishProcedure: (id: string, body: Record<string, unknown>) =>
    api.post<Procedure>(`/veterinaria/procedures/${id}/finish`, body),

  addLabOrder: (visitId: string, body: Record<string, unknown>) =>
    api.post<LabOrder>(`/veterinaria/visits/${visitId}/lab-orders`, body),
  labOrders: (status: "PENDIENTE" | "RESULTADO") =>
    api.get<LabDeskOrder[]>(`/veterinaria/lab-orders${query({ status })}`),
  setLabStatus: (id: string, status: "SOLICITADO" | "EN_PROCESO") =>
    api.patch<LabDeskOrder>(`/veterinaria/lab-orders/${id}/status`, { status }),
  recordLabResult: (id: string, body: Record<string, unknown>) =>
    api.post<LabDeskOrder>(`/veterinaria/lab-orders/${id}/result`, body),

  addConsent: (visitId: string, body: Record<string, unknown>) =>
    api.post<Consent>(`/veterinaria/visits/${visitId}/consents`, body),
  consent: (id: string) => api.get<PrintableConsent>(`/veterinaria/consents/${id}`),
  signConsent: (id: string, signedByName: string) =>
    api.post<Consent>(`/veterinaria/consents/${id}/sign`, { signedByName }),

  reminders: (params: { kind?: string; days?: string } = {}) =>
    api.get<Reminder[]>(`/veterinaria/reminders${query(params)}`),
  summary: (params: { from?: string; to?: string }) =>
    api.get<ClinicSummary>(`/veterinaria/reports/summary${query(params)}`),

  history: (petId: string) => api.get<PatientHistory>(`/veterinaria/patients/${petId}/history`),
  updatePatient: (petId: string, body: Record<string, unknown>) =>
    api.patch<PatientProfile>(`/veterinaria/patients/${petId}`, body),
};

/** A WhatsApp chat with the tutor, with the message already written. Null without a number. */
export function whatsappLink(client: VisitClient, message: string): string | null {
  const digits = (client.whatsapp || client.phone || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;
}

export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** "3 a 2 m" from a birthdate, the way a clinical record states age. */
export function petAge(birthdate?: string | null): string {
  if (!birthdate) return "Edad sin registrar";
  const born = new Date(birthdate);
  if (Number.isNaN(born.getTime())) return "Edad sin registrar";
  const months = Math.max(0, (Date.now() - born.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
  const years = Math.floor(months / 12);
  const rest = Math.floor(months % 12);
  if (years === 0) return `${rest} m`;
  return rest === 0 ? `${years} a` : `${years} a ${rest} m`;
}
