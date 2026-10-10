import { useState, useEffect } from "react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { Spinner } from "../../components/ui/Spinner";
import type { BusinessUnit } from "../../modules/shared/contracts";

export const ROOM_TYPE_LABELS: Record<string, string> = {
  daycare: "Guardería",
  grooming: "Peluquería",
  consultorio: "Consultorio",
  quirofano: "Quirófano",
  hospital: "Hospitalización",
  training: "Entrenamiento",
  reception: "Recepción",
  transport: "Transporte",
  other: "Otro",
};

// The first type of each unit is the default for a new room.
const UNIT_ROOM_TYPES: Record<BusinessUnit, string[]> = {
  DAYCARE: ["daycare", "training", "reception", "transport", "other"],
  GROOMING: ["grooming", "reception", "other"],
  VETERINARY: ["consultorio", "quirofano", "hospital", "reception", "other"],
};

interface Room {
  id?: string;
  name: string;
  type: string;
  capacity: number;
  isActive?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  room?: Room | null;
  unit: BusinessUnit;
  onSaved: () => void;
}

export function RoomForm({ open, onClose, room, unit, onSaved }: Props) {
  const unitTypes = UNIT_ROOM_TYPES[unit];
  // A room saved with a type from outside its unit keeps it until someone changes it.
  const types = room && !unitTypes.includes(room.type) ? [room.type, ...unitTypes] : unitTypes;
  const [name, setName] = useState("");
  const [type, setType] = useState(unitTypes[0]);
  const [capacity, setCapacity] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (room) {
      setName(room.name);
      setType(room.type);
      setCapacity(room.capacity);
    } else {
      setName("");
      setType(UNIT_ROOM_TYPES[unit][0]);
      setCapacity(1);
    }
    setError("");
  }, [room, open, unit]);

  async function handleSave() {
    if (!name.trim()) {
      setError("El nombre de la sala es requerido");
      return;
    }
    if (capacity < 1) {
      setError("La capacidad debe ser mínimo 1");
      return;
    }

    setError("");
    setSaving(true);
    try {
      const data = { name, type, capacity };
      if (room?.id) {
        await api.put(`/rooms/${room.id}`, data);
      } else {
        // An admin working across every unit sends no unit header, so the room names its own.
        await api.post("/rooms", { ...data, businessUnit: unit });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos guardar los cambios. Inténtalo de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  }

  const title = room?.id ? "Editar Sala" : "Nueva Sala";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size={14} /> : null}
            {room?.id ? "Actualizar" : "Crear"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="text-sm text-danger bg-danger-soft rounded-lg px-3 py-2">{error}</p>
        )}

        <div>
          <label className="label">Nombre de la sala *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Patio Principal"
          />
        </div>

        <div>
          <label className="label">Tipo de espacio</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {ROOM_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Capacidad máxima (mascotas) *</label>
          <input
            className="input"
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(Math.max(1, parseInt(e.target.value) || 1))}
          />
        </div>
      </div>
    </Modal>
  );
}
