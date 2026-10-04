import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { PageLoader } from "../../components/ui/Spinner";
import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { PageHeader } from "../../components/layout/PageHeader";

interface Reservation {
  id: string;
  client: { firstName: string; lastName: string };
  pets: Array<{ pet: { name: string } }>;
  room?: { id: string; name: string };
  service: string;
  status: string;
  checkIn?: string;
  checkOut?: string;
}
interface Room {
  id: string;
  name: string;
  capacity: number;
  type: string;
}

export function DisponibilidadPage() {
  const [date, setDate] = useState(new Date());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const d = format(date, "yyyy-MM-dd");
    Promise.all([api.get<Reservation[]>(`/reservations?date=${d}`), api.get<Room[]>("/rooms")])
      .then(([r, rm]) => {
        setReservations(r);
        setRooms(rm);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [date]);

  function reservationsForRoom(roomId: string) {
    return reservations.filter((r) => r.room?.id === roomId && r.status !== "CANCELADA");
  }

  function occupancyPercent(roomId: string, capacity: number) {
    const totalPets = reservationsForRoom(roomId).reduce((sum, r) => sum + r.pets.length, 0);
    return Math.min(100, Math.round((totalPets / capacity) * 100));
  }

  const withoutRoom = reservations.filter((r) => !r.room && r.status !== "CANCELADA");

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Disponibilidad"
        subtitle="Ocupación por sala"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setDate((d) => subDays(d, 1))} className="btn-secondary p-2">
              <ChevronLeft size={16} />
            </button>
            <span className="font-medium text-ink min-w-40 text-center">
              {format(date, "EEEE d 'de' MMMM", { locale: es })}
            </span>
            <button onClick={() => setDate((d) => addDays(d, 1))} className="btn-secondary p-2">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setDate(new Date())} className="btn-secondary text-xs">
              Hoy
            </button>
          </div>
        }
      />

      {loading ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => {
              const pct = occupancyPercent(room.id, room.capacity);
              const rsvs = reservationsForRoom(room.id);
              const barColor = pct >= 90 ? "bg-danger" : pct >= 60 ? "bg-warning" : "bg-success";
              return (
                <div key={room.id} className="card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="section-title">{room.name}</h3>
                    <span className="text-xs text-muted">Cap. {room.capacity}</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted mb-1">
                      <span>
                        {rsvs.reduce((sum, r) => sum + r.pets.length, 0)}/{room.capacity} mascotas
                      </span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <div className="h-2 bg-sunken rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  {rsvs.length > 0 && (
                    <div className="space-y-1">
                      {rsvs.slice(0, 4).map((r) => (
                        <div key={r.id} className="flex items-center gap-2 text-xs">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${r.status === "ACTIVA" ? "bg-success" : r.status === "CONFIRMADA" ? "bg-action" : "bg-line"}`}
                          />
                          <span className="truncate">
                            {r.client.firstName} {r.client.lastName}
                          </span>
                          <span className="ml-auto text-muted">
                            {r.pets.map((p) => p.pet.name).join(", ")}
                          </span>
                        </div>
                      ))}
                      {rsvs.length > 4 && (
                        <p className="text-xs text-muted pl-4">+{rsvs.length - 4} más</p>
                      )}
                    </div>
                  )}
                  {rsvs.length === 0 && (
                    <p className="text-xs text-success text-center py-2">Libre</p>
                  )}
                </div>
              );
            })}
          </div>

          {withoutRoom.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-ink mb-3">
                Sin sala asignada ({withoutRoom.length})
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {withoutRoom.map((r) => (
                  <div key={r.id} className="p-2 bg-warning-soft rounded-lg text-xs">
                    <p className="font-medium">
                      {r.client.firstName} {r.client.lastName}
                    </p>
                    <p className="text-muted">{r.pets.map((p) => p.pet.name).join(", ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <h3 className="font-semibold text-ink mb-3">Resumen del día</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center text-sm">
              {[
                {
                  label: "Total reservas",
                  value: reservations.filter((r) => r.status !== "CANCELADA").length,
                },
                {
                  label: "Activas ahora",
                  value: reservations.filter((r) => r.status === "ACTIVA").length,
                  color: "text-success",
                },
                {
                  label: "Confirmadas",
                  value: reservations.filter((r) => r.status === "CONFIRMADA").length,
                  color: "text-action",
                },
                {
                  label: "Canceladas",
                  value: reservations.filter((r) => r.status === "CANCELADA").length,
                  color: "text-danger",
                },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p className={`text-2xl font-semibold tabular-nums ${color ?? "text-ink"}`}>
                    {value}
                  </p>
                  <p className="text-muted text-xs">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
