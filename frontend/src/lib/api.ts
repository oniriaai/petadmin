const BASE = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:3001/api/v1";
export type { BusinessUnit, ClientSummary, ClientWithPets, PetSummary, UserRole } from "../modules/shared/contracts";
let onUnauthorized: (() => void) | null = null;

function getToken() {
  return localStorage.getItem("token");
}

function getActiveBusinessUnit() {
  const value = localStorage.getItem("activeBusinessUnit");
  if (value === "KINDERDOG" || value === "PETHIJOS") return value;
  return null;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const activeBusinessUnit = getActiveBusinessUnit();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(activeBusinessUnit ? { "X-Business-Unit": activeBusinessUnit } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      onUnauthorized?.();
      throw new Error("Sesion expirada. Inicia sesion nuevamente.");
    }
    const err = await res.json().catch(() => ({ message: "Error de red" }));
    throw new Error(err.message ?? "Error del servidor");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// Check-In/Check-Out interfaces
export interface CheckInOutRecord {
  id: string;
  petId: string;
  petName?: string;
  clientId: string;
  clientName?: string;
  roomId: string;
  roomName?: string;
  reservationId?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  createdAt: string;
  notes?: string;
  status: "PENDING" | "CHECKED_IN" | "CHECKED_OUT";
  performedByUserId?: string | null;
  businessUnit: string;
  isActive: boolean;
  updatedAt?: string;
}

export interface CheckInOutHistoryResponse {
  data: CheckInOutRecord[];
  pagination: {
    total: number;
    skip: number;
    take: number;
  };
}

// Reservations API functions
export const reservationsApi = {
  checkIn: (id: string, data: { time: string }) =>
    api.post(`/reservations/${id}/checkin`, data),
  
  checkOut: (id: string, data: { time: string, createIncome: boolean, paymentMethod?: string }) =>
    api.post(`/reservations/${id}/checkout`, data),
};

// Check-In/Check-Out API functions
export const checkInOutApi = {
  // Create standalone check-in/check-out records
  create: (data: { clientId: string; petIds: string[]; roomId: string; notes?: string; checkInNow?: boolean }) =>
    api.post<CheckInOutRecord[]>('/check-in-out', data),

  // Register check-in time
  checkIn: (id: string, data: { checkInTime: string; performedByUserId?: string }) =>
    api.post<CheckInOutRecord>(`/check-in-out/${id}/check-in`, data),

  // Register check-out time
  checkOut: (id: string, data: { checkOutTime: string; performedByUserId?: string }) =>
    api.post<CheckInOutRecord>(`/check-in-out/${id}/check-out`, data),

  // Get currently active check-ins
  getActive: () =>
    api.get<CheckInOutRecord[]>('/check-in-out/active'),

  // Get check-in/check-out history with filters
  getHistory: (filters?: { clientId?: string; petId?: string; roomId?: string; startDate?: string; endDate?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (filters?.clientId) params.append('clientId', filters.clientId);
    if (filters?.petId) params.append('petId', filters.petId);
    if (filters?.roomId) params.append('roomId', filters.roomId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));
    return api.get<CheckInOutHistoryResponse>(`/check-in-out/history?${params}`);
  },

  // Update notes
  updateNotes: (id: string, data: { notes: string }) =>
    api.put<CheckInOutRecord>(`/check-in-out/${id}/notes`, data),

  // Get single record
  get: (id: string) =>
    api.get<CheckInOutRecord>(`/check-in-out/${id}`),
};

export async function downloadFile(path: string, filename: string) {
  const token = getToken();
  const activeBusinessUnit = getActiveBusinessUnit();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(activeBusinessUnit ? { "X-Business-Unit": activeBusinessUnit } : {}),
    },
  });
  if (!res.ok) throw new Error("Error al descargar");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ==========================================
// MÓDULO PELUQUERÍA (Pethijos)
// ==========================================
export interface GroomingService {
  id: string;
  name: string;
  category: "BANO" | "CORTE" | "COMPLETO" | "TRATAMIENTO" | "ADICIONAL";
  durationMinutes: number;
  basePrice: number;
  description: string;
}

export interface GroomingAppointment {
  id: string;
  clientId: string;
  client: { id: string; firstName: string; lastName: string; phone?: string; whatsapp?: string };
  pets: Array<{ id: string; name: string; species: string; breed?: string; photoUrl?: string }>;
  service: string;
  status: "PENDIENTE" | "RECEPCIONADA" | "EN_PROCESO" | "LISTO" | "COMPLETADA" | "CANCELADA";
  startTime: string;
  endTime: string;
  durationMinutes: number;
  concept?: string;
  notes?: string;
  totalAmount: number;
  advanceAmount: number;
  pendingAmount: number;
  paymentMethod?: string;
  incomes?: Array<{ id: string; total: number; paymentMethod: string; date: string }>;
  createdAt: string;
}

export const peluqueriaApi = {
  getServices: () => api.get<GroomingService[]>("/peluqueria/services"),
  getAppointments: (params?: { date?: string; status?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.date) q.append("date", params.date);
    if (params?.status) q.append("status", params.status);
    if (params?.search) q.append("search", params.search);
    return api.get<GroomingAppointment[]>(`/peluqueria/appointments?${q}`);
  },
  getAppointment: (id: string) => api.get<GroomingAppointment>(`/peluqueria/appointments/${id}`),
  createAppointment: (data: {
    clientId: string;
    petIds: string[];
    serviceId?: string;
    serviceName?: string;
    startTime: string;
    durationMinutes: number;
    notes?: string;
    basePrice?: number;
    vatPercent?: number;
    discountAmount?: number;
    advanceAmount?: number;
    paymentMethod?: string;
  }) => api.post<any>("/peluqueria/appointments", data),
  updateStatus: (id: string, data: { status: string; notes?: string }) =>
    api.patch<GroomingAppointment>(`/peluqueria/appointments/${id}/status`, data),
  completeAndCollect: (id: string, data: { paymentMethod: string; amount?: number; notes?: string }) =>
    api.post<GroomingAppointment>(`/peluqueria/appointments/${id}/complete`, data),
  deleteAppointment: (id: string) => api.del<{ ok: boolean }>(`/peluqueria/appointments/${id}`),
};

// ==========================================
// MÓDULO GUARDERÍA (Kinderdog)
// ==========================================
export interface DaycareRoomOccupancy {
  id: string;
  name: string;
  type: string;
  capacity: number;
  currentOccupancy: number;
  availableSlots: number;
  occupancyRate: number;
  isFull: boolean;
  currentPets: Array<{
    checkInOutId: string;
    petId: string;
    petName: string;
    petBreed?: string;
    petPhoto?: string;
    clientName: string;
    clientPhone?: string;
    checkInTime: string;
    notes?: string;
  }>;
}

export interface DaycareAttendanceData {
  reservations: any[];
  activeCheckIns: any[];
}

export const guarderiaApi = {
  getOccupancy: () => api.get<DaycareRoomOccupancy[]>("/guarderia/occupancy"),
  getTodayAttendance: () => api.get<DaycareAttendanceData>("/guarderia/attendance/today"),
  checkIn: (data: {
    petId: string;
    clientId: string;
    roomId: string;
    reservationId?: string;
    checkInTime?: string;
    notes?: string;
  }) => api.post<any>("/guarderia/attendance/check-in", data),
  checkOut: (data: {
    checkInOutId: string;
    checkOutTime?: string;
    createIncome?: boolean;
    paymentMethod?: string;
    amount?: number;
    notes?: string;
  }) => api.post<any>("/guarderia/attendance/check-out", data),
  getTransport: () => api.get<{ total: number; recogidas: any[]; entregas: any[] }>("/guarderia/transport"),
};
