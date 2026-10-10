import { useState, useCallback, useEffect, useRef } from "react";
import { addDays, endOfMonth, startOfMonth } from "date-fns";
import { api, checkInOutApi, CheckInOutRecord } from "../../lib/api";

export interface Reservation {
  id: string;
  businessUnit: string;
  clientId: string;
  client: { id: string; firstName: string; lastName: string };
  pets: Array<{ id: string; pet: { id: string; name: string } }>;
  room?: { id: string; name: string };
  roomId?: string;
  service: string;
  status: string;
  checkIn?: string;
  checkOut?: string;
  needsTransport: boolean;
  notes?: string;
}

export type OperationalEventType = "RESERVATION" | "ADHOC";
export type OperationalEventStatus = "PENDING" | "CHECKED_IN" | "CHECKED_OUT";

/** The one place the three states are named and coloured. */
export const OPERATIONAL_STATUS: Record<OperationalEventStatus, { label: string; color: string }> =
  {
    PENDING: { label: "Pendiente", color: "bg-sunken text-muted" },
    CHECKED_IN: { label: "Ingresado", color: "bg-success-soft text-success-ink" },
    CHECKED_OUT: { label: "Completado", color: "bg-info-soft text-info-ink" },
  };

/** What the screen calls a visit that came in without a reservation. */
export const WALK_IN_LABEL = "Sin reserva";

export interface OperationalEvent {
  id: string;
  type: OperationalEventType;
  businessUnit: string;
  clientId: string;
  clientName: string;
  petNames: string;
  petIds: string[];
  roomId: string;
  roomName: string;
  service: string;
  status: OperationalEventStatus;
  scheduledCheckIn: string;
  scheduledCheckOut?: string;
  actualCheckIn?: string | null;
  actualCheckOut?: string | null;
  needsTransport: boolean;
  notes?: string;
  // Metadata for modals/actions
  isReservation: boolean;
  originalId: string;
}

export interface UseOperacionesDataReturn {
  events: OperationalEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const RESERVATION_STATUS: Record<string, OperationalEventStatus> = {
  ACTIVA: "CHECKED_IN",
  // Grooming: received and in progress are both "the pet is here".
  RECEPCIONADA: "CHECKED_IN",
  EN_PROCESO: "CHECKED_IN",
  // LISTO means the grooming is finished, even if the pet has not been picked up yet.
  LISTO: "CHECKED_OUT",
  COMPLETADA: "CHECKED_OUT",
};

/** Reservations and walk-ins as one feed, newest first. Cancelled reservations are left out. */
export function toOperationalEvents(
  reservations: Reservation[],
  records: CheckInOutRecord[],
): OperationalEvent[] {
  // The most recent attendance record of each reservation carries its real times.
  const lastByReservation = new Map<string, CheckInOutRecord>();
  const walkIns: CheckInOutRecord[] = [];
  for (const record of records) {
    if (!record.reservationId) {
      walkIns.push(record);
      continue;
    }
    const seen = lastByReservation.get(record.reservationId);
    if (!seen || (record.checkInTime ?? "") > (seen.checkInTime ?? "")) {
      lastByReservation.set(record.reservationId, record);
    }
  }

  const events: OperationalEvent[] = [];

  for (const res of reservations) {
    if (res.status === "CANCELADA") continue;
    const last = lastByReservation.get(res.id);
    events.push({
      id: `res-${res.id}`,
      originalId: res.id,
      type: "RESERVATION",
      isReservation: true,
      businessUnit: res.businessUnit,
      clientId: res.clientId,
      clientName: `${res.client.firstName} ${res.client.lastName}`,
      petNames: res.pets.map((p) => p.pet.name).join(", "),
      petIds: res.pets.map((p) => p.pet.id),
      roomId: res.roomId || "",
      roomName: res.room?.name || "Sin asignar",
      service: res.service,
      status: RESERVATION_STATUS[res.status] ?? "PENDING",
      scheduledCheckIn: res.checkIn || "",
      scheduledCheckOut: res.checkOut,
      actualCheckIn: last?.checkInTime,
      actualCheckOut: last?.checkOutTime,
      needsTransport: res.needsTransport,
      notes: res.notes,
    });
  }

  for (const record of walkIns) {
    events.push({
      id: `adhoc-${record.id}`,
      originalId: record.id,
      type: "ADHOC",
      isReservation: false,
      businessUnit: record.businessUnit,
      clientId: record.clientId,
      clientName: record.clientName || "Desconocido",
      petNames: record.petName || "Desconocido",
      petIds: [record.petId],
      roomId: record.roomId,
      roomName: record.roomName || "Sin asignar",
      service: WALK_IN_LABEL,
      status: record.checkOutTime ? "CHECKED_OUT" : record.checkInTime ? "CHECKED_IN" : "PENDING",
      scheduledCheckIn: record.checkInTime || record.createdAt,
      scheduledCheckOut: record.checkOutTime || undefined,
      actualCheckIn: record.checkInTime,
      actualCheckOut: record.checkOutTime,
      needsTransport: false,
      notes: record.notes,
    });
  }

  return events.sort(
    (a, b) => new Date(b.scheduledCheckIn).getTime() - new Date(a.scheduledCheckIn).getTime(),
  );
}

const HISTORY_PAGE = 200;

async function fetchRecords(from: string, to: string): Promise<CheckInOutRecord[]> {
  const records: CheckInOutRecord[] = [];
  for (;;) {
    const page = await checkInOutApi.getHistory({
      from,
      to,
      limit: HISTORY_PAGE,
      offset: records.length,
    });
    records.push(...page.data);
    if (page.data.length === 0 || records.length >= page.pagination.total) return records;
  }
}

/**
 * The operations of the month `date` falls in, padded by a week on each side so a week view that
 * straddles the month's edge is complete.
 */
export function useOperacionesData(date: Date): UseOperacionesDataReturn {
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const monthStart = startOfMonth(date).getTime();
  // Moving between months quickly must not let an older answer overwrite a newer one.
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const call = ++latest.current;
    setError(null);
    const from = addDays(new Date(monthStart), -7).toISOString();
    const to = addDays(endOfMonth(new Date(monthStart)), 7).toISOString();
    try {
      // shortcut: the server caps an unpaged list at 500, page this if a month ever exceeds it.
      const [reservations, records] = await Promise.all([
        api.get<Reservation[]>(
          `/reservations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ),
        fetchRecords(from, to),
      ]);
      if (call === latest.current) setEvents(toOperationalEvents(reservations, records));
    } catch (err) {
      if (call !== latest.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar las operaciones. Inténtalo de nuevo.",
      );
    } finally {
      if (call === latest.current) setLoading(false);
    }
  }, [monthStart]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { events, loading, error, refresh };
}
