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
}

export interface PatientHistory {
  pet: PatientProfile & {
    client: VisitClient;
    vaccinations: Array<{ id: string; name: string; date: string; nextDue?: string | null }>;
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
  removeChild: (id: string, kind: "vitals" | "diagnoses" | "charges", childId: string) =>
    api.del(`/veterinaria/visits/${id}/${kind}/${childId}`),

  close: (id: string, body: Record<string, unknown>) =>
    api.post<VisitDetail>(`/veterinaria/visits/${id}/close`, body),
  pay: (id: string, body: Record<string, unknown>) =>
    api.post<VisitDetail>(`/veterinaria/visits/${id}/payments`, body),

  history: (petId: string) => api.get<PatientHistory>(`/veterinaria/patients/${petId}/history`),
  updatePatient: (petId: string, body: Record<string, unknown>) =>
    api.patch<PatientProfile>(`/veterinaria/patients/${petId}`, body),
};

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
