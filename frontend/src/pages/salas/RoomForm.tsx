import { useState, useEffect } from "react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { Spinner } from "../../components/ui/Spinner";

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
  onSaved: () => void;
}

export function RoomForm({ open, onClose, room, onSaved }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState("daycare");
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
      setType("daycare");
      setCapacity(1);
    }
    setError("");
  }, [room, open]);

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
        await api.post("/rooms", data);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
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
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div>
          <label className="label">Nombre de la sala *</label>
          <input
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Patio Principal"
          />
        </div>

        <div>
          <label className="label">Tipo de espacio</label>
          <select className="input" value={type} onChange={e => setType(e.target.value)}>
            <option value="daycare">Guardería</option>
            <option value="grooming">Peluquería</option>
            <option value="training">Entrenamiento</option>
            <option value="reception">Recepción</option>
            <option value="other">Otro</option>
          </select>
        </div>

        <div>
          <label className="label">Capacidad máxima (mascotas) *</label>
          <input
            className="input"
            type="number"
            min="1"
            value={capacity}
            onChange={e => setCapacity(Math.max(1, parseInt(e.target.value) || 1))}
          />
        </div>
      </div>
    </Modal>
  );
}
