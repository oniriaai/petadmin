import { useEffect, useState, useCallback } from "react";
import { Plus, Edit2, Trash2, RefreshCw, Search } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { PageLoader } from "../../components/ui/Spinner";
import { RoomForm } from "./RoomForm";
import { PageHeader } from "../../components/layout/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";

interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number;
  currentOccupancy?: number;
  availableCapacity?: number;
  isActive: boolean;
}

export function RoomsPage() {
  // The server refuses the delete without this permission, so the button is not offered.
  const canDelete = useAuth().can("registros.delete");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const data = await api.get<Room[]>(`/rooms?${params}`);
      setRooms(data);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

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

  const filtered = search
    ? rooms.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.type.toLowerCase().includes(search.toLowerCase()),
      )
    : rooms;

  const typeLabel = (type: string) => {
    const types: Record<string, string> = {
      daycare: "Guardería",
      grooming: "Peluquería",
      consultorio: "Consultorio",
      quirofano: "Quirófano",
      hospital: "Hospitalización",
      training: "Entrenamiento",
      reception: "Recepción",
      other: "Otro",
    };
    return types[type] || type;
  };

  // Over capacity is an incident, not "busy": it read identically to a room at 80% before, so a
  // room holding 43 of 24 looked the same as one holding 20 of 24.
  const isOverCapacity = (occupancy: number, capacity: number) =>
    capacity > 0 && occupancy > capacity;

  const capacityColor = (occupancy: number, capacity: number) => {
    if (capacity <= 0) return "text-muted";
    if (isOverCapacity(occupancy, capacity)) return "text-danger-ink font-bold";
    const percent = (occupancy / capacity) * 100;
    if (percent === 0) return "text-success";
    if (percent < 50) return "text-action";
    if (percent < 80) return "text-warning-ink";
    return "text-danger";
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Salas y Espacios"
        subtitle={<>{rooms.length} salas registradas</>}
        actions={
          <button onClick={() => setShowNew(true)} className="btn-primary">
            <Plus size={16} /> Nueva Sala
          </button>
        }
      />

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            className="input pl-9"
            placeholder="Buscar sala…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-40"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
          <option value="">Todas</option>
        </select>
        <button onClick={load} className="btn-ghost">
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <PageLoader />
        ) : rooms.length === 0 ? (
          <EmptyState title="Todavía no hay salas. Crea la primera para empezar a asignar cupos." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Nombre</th>
                  <th className="table-th">Tipo</th>
                  <th className="table-th">Capacidad</th>
                  <th className="table-th">Ocupación Actual</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((room) => (
                  <tr key={room.id} className="table-tr">
                    <td className="table-td font-medium">{room.name}</td>
                    <td className="table-td text-sm">{typeLabel(room.type)}</td>
                    <td className="table-td text-sm">{room.capacity} mascotas máx</td>
                    <td className="table-td">
                      <span
                        className={`font-medium ${capacityColor(room.currentOccupancy || 0, room.capacity)}`}
                      >
                        {room.currentOccupancy || 0} / {room.capacity}
                      </span>
                      {isOverCapacity(room.currentOccupancy || 0, room.capacity) && (
                        <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-sm bg-danger-soft text-danger-ink align-middle">
                          Sobrecupo
                        </span>
                      )}
                    </td>
                    <td className="table-td">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          room.isActive
                            ? "bg-success-soft text-success-ink"
                            : "bg-sunken text-muted"
                        }`}
                      >
                        {room.isActive ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditing(room)}
                          className="btn-ghost btn-sm p-1.5"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </button>
                        {room.isActive && canDelete && (
                          <button
                            onClick={() => deleteRoom(room.id, room.name)}
                            className="btn-ghost btn-sm p-1.5 text-danger hover:bg-danger-soft"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RoomForm open={showNew} onClose={() => setShowNew(false)} onSaved={load} />

      <RoomForm open={!!editing} onClose={() => setEditing(null)} room={editing} onSaved={load} />
    </div>
  );
}
