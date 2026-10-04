import { useState, useCallback, useEffect } from "react";
import { api, checkInOutApi, CheckInOutRecord } from "../../lib/api";

// Core Reservation interface
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
  transportType?: string;
  transportAddress?: string;
  basePrice: number;
  vatPercent: number;
  discountAmount: number;
  advanceAmount: number;
  vatAmount: number;
  totalAmount: number;
  pendingAmount: number;
  paymentMethod?: string;
  concept?: string;
  notes?: string;
}

// Extended reservation with check-in/check-out data
export interface ReservationWithCheckInOut extends Reservation {
  checkInOuts?: CheckInOutRecord[];
}

export type OperationalEventType = "RESERVATION" | "ADHOC";
export type OperationalEventStatus = "PENDING" | "CHECKED_IN" | "CHECKED_OUT";

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

export function useOperacionesData(): UseOperacionesDataReturn {
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reservationsData, checkInOutData] = await Promise.all([
        api.get<Reservation[]>("/reservations"),
        checkInOutApi.getHistory({ limit: 1000, offset: 0 }),
      ]);

      const checkInOutRecords = checkInOutData.data;

      // Create a map of check-in/check-out records by reservationId
      const checkInOutByReservationId = new Map<string, CheckInOutRecord[]>();
      const adHoc: CheckInOutRecord[] = [];

      checkInOutRecords.forEach((record) => {
        if (record.reservationId) {
          if (!checkInOutByReservationId.has(record.reservationId)) {
            checkInOutByReservationId.set(record.reservationId, []);
          }
          checkInOutByReservationId.get(record.reservationId)!.push(record);
        } else {
          adHoc.push(record);
        }
      });

      const unifiedEvents: OperationalEvent[] = [];

      // Map Reservations to OperationalEvents
      reservationsData.forEach((res) => {
        const checkInOuts = checkInOutByReservationId.get(res.id) || [];
        // Sort checkInOuts by checkInTime desc to get the most recent activity
        const sortedCIOs = [...checkInOuts].sort((a, b) => {
          const aTime = a.checkInTime ? new Date(a.checkInTime).getTime() : 0;
          const bTime = b.checkInTime ? new Date(b.checkInTime).getTime() : 0;
          return bTime - aTime;
        });
        const lastCheckInOut = sortedCIOs[0];

        let status: OperationalEventStatus = "PENDING";
        if (res.status === "COMPLETADA") {
          status = "CHECKED_OUT";
        } else if (
          res.status === "ACTIVA" ||
          res.status === "RECEPCIONADA" ||
          res.status === "EN_PROCESO"
        ) {
          // Grooming statuses RECEPCIONADA and EN_PROCESO are active in-progress states
          status = "CHECKED_IN";
        } else if (res.status === "LISTO") {
          // LISTO means grooming is finished but pet hasn't been picked up yet – show as checked-out
          status = "CHECKED_OUT";
        }

        unifiedEvents.push({
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
          status,
          scheduledCheckIn: res.checkIn || "",
          scheduledCheckOut: res.checkOut,
          actualCheckIn: lastCheckInOut?.checkInTime,
          actualCheckOut: lastCheckInOut?.checkOutTime,
          needsTransport: res.needsTransport,
          notes: res.notes,
        });
      });

      // Map Ad-hoc Check-ins to OperationalEvents
      adHoc.forEach((record) => {
        let status: OperationalEventStatus = "PENDING";
        if (record.checkOutTime) status = "CHECKED_OUT";
        else if (record.checkInTime) status = "CHECKED_IN";

        unifiedEvents.push({
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
          service: "AD-HOC",
          status,
          scheduledCheckIn: record.checkInTime || record.createdAt,
          scheduledCheckOut: record.checkOutTime || undefined,
          actualCheckIn: record.checkInTime,
          actualCheckOut: record.checkOutTime,
          needsTransport: false,
          notes: record.notes,
        });
      });

      // Sort by scheduled check-in date (descending)
      unifiedEvents.sort(
        (a, b) => new Date(b.scheduledCheckIn).getTime() - new Date(a.scheduledCheckIn).getTime(),
      );

      setEvents(unifiedEvents);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "No pudimos cargar las operaciones. Inténtalo de nuevo.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    events,
    loading,
    error,
    refresh,
  };
}
