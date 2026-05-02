const BASE = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:3001/api/v1";

function getToken() {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
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
  createdAt: string;
  updatedAt?: string;
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
  create: (data: { clientId: string; petIds: string[]; roomId: string; notes?: string }) =>
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
    return api.get<{ data: CheckInOutRecord[]; total: number; limit: number; offset: number }>(`/check-in-out/history?${params}`);
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
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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
