import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { fmt, STATUSES } from "../../lib/utils";
import { PageLoader } from "../../components/ui/Spinner";
import { format, addDays, subDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface Reservation {
  id: string;
  client: { firstName: string; lastName: string };
  pets: Array<{ pet: { name: string } }>;
  room?: { id: string; name: string };
  service: string; status: string;
  checkIn?: string; checkOut?: string;
}
interface Room { id: string; name: string; capacity: number; type: string }

const HOURS = Array.from({ length: 12 }, (_, i) => i + 7);

export function DisponibilidadPage() {
  const [date, setDate] = useState(new Date());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const d = format(date, "yyyy-MM-dd");
    Promise.all([
      api.get<Reservation[]>(`/reservations?date=${d}`),
      api.get<Room[]>("/rooms"),
    ])
      .then(([r, rm]) => { setReservations(r); setRooms(rm); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [date]);

  function reservationsForRoom(roomId: string) {
    return reservations.filter(r => r.room?.id === roomId && r.status !== "CANCELADA");
  }

  function occupancyPercent(roomId: string, capacity: number) {
    const count = reservationsForRoom(roomId).length;
    return Math.min(100, Math.round((count / capacity) * 100));
  }

  const withoutRoom = reservations.filter(r => !r.room && r.status !== "CANCELADA");

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Disponibilidad</h1>
          <p className="text-gray-500 text-sm mt-1">Ocupación por sala</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => subDays(d, 1))} className="btn-secondary p-2"><ChevronLeft size={16} /></button>
          <span className="font-medium text-gray-800 min-w-40 text-center">{format(date, "EEEE d 'de' MMMM", { locale: es })}</span>
          <button onClick={() => setDate(d => addDays(d, 1))} className="btn-secondary p-2"><ChevronRight size={16} /></button>
          <button onClick={() => setDate(new Date())} className="btn-secondary text-xs">Hoy</button>
        </div>
      </div>

      {loading ? <PageLoader /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map(room => {
              const pct = occupancyPercent(room.id, room.capacity);
              const rsvs = reservationsForRoom(room.id);
              const barColor = pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-yellow-500" : "bg-green-500";
              return (
                <div key={room.id} className="card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">{room.name}</h3>
                    <span className="text-xs text-gray-500">Cap. {room.capacity}</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>{rsvs.length}/{room.capacity} ocupados</span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  {rsvs.length > 0 && (
                    <div className="space-y-1">
                      {rsvs.slice(0, 4).map(r => {
                        const st = STATUSES[r.status] ?? { color: "bg-gray-100 text-gray-600" };
                        return (
                          <div key={r.id} className="flex items-center gap-2 text-xs">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${r.status === "ACTIVA" ? "bg-green-500" : r.status === "CONFIRMADA" ? "bg-blue-500" : "bg-gray-300"}`} />
                            <span className="truncate">{r.client.firstName} {r.client.lastName}</span>
                            <span className="ml-auto text-gray-400">{r.pets.map(p => p.pet.name).join(", ")}</span>
                          </div>
                        );
                      })}
                      {rsvs.length > 4 && <p className="text-xs text-gray-400 pl-4">+{rsvs.length - 4} más</p>}
                    </div>
                  )}
                  {rsvs.length === 0 && <p className="text-xs text-green-600 text-center py-2">✅ Libre</p>}
                </div>
              );
            })}
          </div>

          {withoutRoom.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Sin sala asignada ({withoutRoom.length})</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {withoutRoom.map(r => (
                  <div key={r.id} className="p-2 bg-yellow-50 rounded-lg text-xs">
                    <p className="font-medium">{r.client.firstName} {r.client.lastName}</p>
                    <p className="text-gray-500">{r.pets.map(p => p.pet.name).join(", ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Resumen del día</h3>
            <div className="grid grid-cols-4 gap-4 text-center text-sm">
              {[
                { label: "Total reservas", value: reservations.filter(r => r.status !== "CANCELADA").length },
                { label: "Activas ahora", value: reservations.filter(r => r.status === "ACTIVA").length, color: "text-green-600" },
                { label: "Confirmadas", value: reservations.filter(r => r.status === "CONFIRMADA").length, color: "text-blue-600" },
                { label: "Canceladas", value: reservations.filter(r => r.status === "CANCELADA").length, color: "text-red-500" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p className={`text-2xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
                  <p className="text-gray-500 text-xs">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
