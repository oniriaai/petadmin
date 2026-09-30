import { useEffect, useState, useCallback } from "react";
import { Plus, Edit2, Trash2, RefreshCw, Search } from "lucide-react";
import { api } from "../../lib/api";
import { PageLoader } from "../../components/ui/Spinner";
import { RoomForm } from "./RoomForm";
import { PageHeader } from "../../components/layout/PageHeader";

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
    if (!confirm(`¿Eliminar la sala "${name}"?`)) return;
    try {
      await api.del(`/rooms/${id}`);
      load();
    } catch (e) {
      alert("Error al eliminar: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  }

  const filtered = search
    ? rooms.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.type.toLowerCase().includes(search.toLowerCase()))
    : rooms;

  const typeLabel = (type: string) => {
    const types: Record<string, string> = {
      daycare: "Guardería",
      grooming: "Peluquería",
      training: "Entrenamiento",
      reception: "Recepción",
      other: "Otro",
    };
    return types[type] || type;
  };

  // Over capacity is an incident, not "busy": it read identically to a room at 80% before, so a
  // room holding 43 of 24 looked the same as one holding 20 of 24.
  const isOverCapacity = (occupancy: number, capacity: number) => capacity > 0 && occupancy > capacity;

  const capacityColor = (occupancy: number, capacity: number) => {
    if (capacity <= 0) return "text-gray-500";
    if (isOverCapacity(occupancy, capacity)) return "text-red-700 font-bold";
    const percent = (occupancy / capacity) * 100;
    if (percent === 0) return "text-green-600";
    if (percent < 50) return "text-blue-600";
    if (percent < 80) return "text-yellow-600";
    return "text-red-600";
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
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Buscar sala…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-40"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
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
          <p className="text-center text-gray-400 py-16">Sin salas registradas</p>
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
                {filtered.map(room => (
                  <tr key={room.id} className="table-tr">
                    <td className="table-td font-medium">{room.name}</td>
                    <td className="table-td text-sm">{typeLabel(room.type)}</td>
                    <td className="table-td text-sm">{room.capacity} mascotas máx</td>
                    <td className="table-td">
                      <span className={`font-medium ${capacityColor(room.currentOccupancy || 0, room.capacity)}`}>
                        {room.currentOccupancy || 0} / {room.capacity}
                      </span>
                      {isOverCapacity(room.currentOccupancy || 0, room.capacity) && (
                        <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 align-middle">
                          Sobrecupo
                        </span>
                      )}
                    </td>
                    <td className="table-td">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        room.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}>
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
                        {room.isActive && (
                          <button
                            onClick={() => deleteRoom(room.id, room.name)}
                            className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"
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

      <RoomForm
        open={showNew}
        onClose={() => setShowNew(false)}
        onSaved={load}
      />

      <RoomForm
        open={!!editing}
        onClose={() => setEditing(null)}
        room={editing}
        onSaved={load}
      />
    </div>
  );
}
