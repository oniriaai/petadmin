import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, subDays, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { PageLoader } from "../../components/ui/Spinner";
import { RoomForm, ROOM_TYPE_LABELS } from "./RoomForm";
import { PageHeader } from "../../components/layout/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";

interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number;
  currentOccupancy?: number;
  isActive: boolean;
}
interface Reservation {
  id: string;
  client: { firstName: string; lastName: string };
  pets: Array<{ pet: { name: string } }>;
  room?: { id: string; name: string };
  status: string;
}

export function RoomsPage() {
  const { can, activeBusinessUnit } = useAuth();
  // The server refuses the delete without this permission, so the button is not offered.
  const canDelete = can("registros.delete");
  // An admin working across every unit sends no unit header and would get every unit's rooms,
  // so the screen names the unit itself: the clinic's when reached under its path.
  const { pathname } = useLocation();
  const unit =
    activeBusinessUnit ?? (pathname.startsWith("/veterinaria") ? "VETERINARY" : "DAYCARE");

  const [date, setDate] = useState(new Date());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const roomParams = new URLSearchParams({ businessUnit: unit });
      if (statusFilter) roomParams.set("status", statusFilter);
      const day = format(date, "yyyy-MM-dd");
      const [rm, rs] = await Promise.all([
        api.get<Room[]>(`/rooms?${roomParams}`),
        api.get<Reservation[]>(`/reservations?date=${day}&businessUnit=${unit}`),
      ]);
      setRooms(rm);
      setReservations(rs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, date, unit]);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteRoom(id: string, name: string) {
    if (!confirm(`¿Eliminamos la sala "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.del(`/rooms/${id}`);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No pudimos eliminarlo. Inténtalo de nuevo.");
    }
  }

  const live = reservations.filter((r) => r.status !== "CANCELADA");
  const withoutRoom = live.filter((r) => !r.room);
  const today = isToday(date);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title={unit === "VETERINARY" ? "Salas de la clínica" : "Salas y cupos"}
        subtitle="Ocupación por sala"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setDate((d) => subDays(d, 1))}
              className="btn-secondary p-2"
              aria-label="Día anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-medium text-ink min-w-40 text-center">
              {format(date, "EEEE d 'de' MMMM", { locale: es })}
            </span>
            <button
              onClick={() => setDate((d) => addDays(d, 1))}
              className="btn-secondary p-2"
              aria-label="Día siguiente"
            >
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setDate(new Date())} className="btn-secondary text-xs">
              Hoy
            </button>
            <select
              className="input w-32"
              aria-label="Estado de las salas"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
              <option value="">Todas</option>
            </select>
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <Plus size={16} /> Nueva sala
            </button>
          </div>
        }
      />

      {loading ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          {rooms.length === 0 && (
            <div className="card">
              <EmptyState title="Todavía no hay salas. Crea la primera para empezar a asignar cupos." />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => {
              const rsvs = live.filter((r) => r.room?.id === room.id);
              const reserved = rsvs.reduce((sum, r) => sum + r.pets.length, 0);
              // Today a walk-in checked in with no reservation still takes a place, so the live
              // count wins when it is higher (the same rule the server applies).
              const pets = today ? Math.max(reserved, room.currentOccupancy ?? 0) : reserved;
              const pct = Math.round((pets / room.capacity) * 100);
              // Over capacity is an incident, not "busy": a capped bar alone made a room
              // holding 43 of 24 look the same as a full one.
              const over = pets > room.capacity;
              const barColor = pct >= 90 ? "bg-danger" : pct >= 60 ? "bg-warning" : "bg-success";
              return (
                <div key={room.id} className="card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="section-title break-words">{room.name}</h3>
                      <p className="text-xs text-muted">
                        {ROOM_TYPE_LABELS[room.type] ?? room.type}
                        {!room.isActive && " · Inactiva"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditing(room)}
                        className="btn-ghost btn-sm p-1.5"
                        title="Editar"
                        aria-label={`Editar ${room.name}`}
                      >
                        <Edit2 size={14} />
                      </button>
                      {room.isActive && canDelete && (
                        <button
                          onClick={() => deleteRoom(room.id, room.name)}
                          className="btn-ghost btn-sm p-1.5 text-danger hover:bg-danger-soft"
                          title="Eliminar"
                          aria-label={`Eliminar ${room.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted mb-1">
                      <span className={over ? "text-danger-ink font-bold" : undefined}>
                        {pets}/{room.capacity} mascotas
                        {over && (
                          <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-sm bg-danger-soft text-danger-ink font-normal">
                            Sobrecupo
                          </span>
                        )}
                      </span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <div className="h-2 bg-sunken rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
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
                  {pets === 0 && <p className="text-xs text-success text-center py-2">Libre</p>}
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
                { label: "Total reservas", value: live.length },
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

      <RoomForm open={showNew} onClose={() => setShowNew(false)} unit={unit} onSaved={load} />

      <RoomForm
        open={!!editing}
        onClose={() => setEditing(null)}
        room={editing}
        unit={unit}
        onSaved={load}
      />
    </div>
  );
}
