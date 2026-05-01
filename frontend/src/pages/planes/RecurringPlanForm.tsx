import React, { useState, useEffect } from "react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { Spinner } from "../../components/ui/Spinner";

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  pets: Array<{ id: string; name: string }>;
}

interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number;
}

interface RecurringPlan {
  id?: string;
  clientId: string;
  startDate: string;
  endDate: string;
  daysOfWeek: string;
  petIds: string;
  service: string;
  roomId?: string;
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  plan?: RecurringPlan | null;
  onSaved: () => void;
}

export function RecurringPlanForm({ open, onClose, plan, onSaved }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [clientId, setClientId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>([]);
  const [selectedPets, setSelectedPets] = useState<string[]>([]);
  const [service, setService] = useState("GUARDERIA");
  const [roomId, setRoomId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedClient = clients.find(c => c.id === clientId);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      api.get<Client[]>("/clients?status=active"),
      api.get<Room[]>("/rooms?status=active"),
    ])
      .then(([c, r]) => {
        setClients(c);
        setRooms(r);
      })
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (plan) {
      setClientId(plan.clientId);
      setStartDate(plan.startDate.split("T")[0]);
      setEndDate(plan.endDate.split("T")[0]);
      setDaysOfWeek(plan.daysOfWeek.split(","));
      setSelectedPets(plan.petIds.split(","));
      setService(plan.service);
      setRoomId(plan.roomId || "");
      setNotes(plan.notes || "");
    } else {
      setClientId("");
      setStartDate("");
      setEndDate("");
      setDaysOfWeek([]);
      setSelectedPets([]);
      setService("GUARDERIA");
      setRoomId("");
      setNotes("");
    }
    setError("");
  }, [plan, open]);

  async function handleSave() {
    if (!clientId) {
      setError("Selecciona un cliente");
      return;
    }
    if (!startDate || !endDate) {
      setError("Las fechas de inicio y fin son requeridas");
      return;
    }
    if (daysOfWeek.length === 0) {
      setError("Selecciona al menos un día");
      return;
    }

    setError("");
    setSaving(true);
    try {
      const data = {
        clientId,
        startDate: `${startDate}T00:00:00Z`,
        endDate: `${endDate}T23:59:59Z`,
        daysOfWeek: daysOfWeek.join(","),
        petIds: selectedPets.join(",") || "unknown",
        service,
        roomId: roomId || undefined,
        notes,
      };

      if (plan?.id) {
        await api.put(`/recurring-plans/${plan.id}`, data);
      } else {
        await api.post("/recurring-plans", data);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(day: string) {
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  function togglePet(petId: string) {
    setSelectedPets(prev =>
      prev.includes(petId)
        ? prev.filter(p => p !== petId)
        : [...prev, petId]
    );
  }

  const dayLabels = [
    { num: "1", label: "Lunes" },
    { num: "2", label: "Martes" },
    { num: "3", label: "Miércoles" },
    { num: "4", label: "Jueves" },
    { num: "5", label: "Viernes" },
    { num: "6", label: "Sábado" },
    { num: "7", label: "Domingo" },
  ];

  const title = plan?.id ? "Editar Plan Recurrente" : "Nuevo Plan Recurrente";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size={14} /> : null}
            {plan?.id ? "Actualizar" : "Crear"}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size={28} />
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Cliente *</label>
              <select
                className="input"
                value={clientId}
                onChange={e => {
                  setClientId(e.target.value);
                  setSelectedPets([]);
                }}
              >
                <option value="">— Seleccionar cliente —</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.lastName}, {c.firstName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Servicio</label>
              <select
                className="input"
                value={service}
                onChange={e => setService(e.target.value)}
              >
                <option value="GUARDERIA">Guardería</option>
                <option value="PELUQUERIA_CANINA">Peluquería Canina</option>
                <option value="PELUQUERIA_FELINA">Peluquería Felina</option>
                <option value="TRANSPORTE">Transporte</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>

            <div>
              <label className="label">Fecha de inicio *</label>
              <input
                className="input"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Fecha de fin *</label>
              <input
                className="input"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>

            <div className="col-span-2">
              <label className="label">Sala (opcional)</label>
              <select
                className="input"
                value={roomId}
                onChange={e => setRoomId(e.target.value)}
              >
                <option value="">— Sin sala asignada —</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} (cap. {r.capacity})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label mb-2">Días de la semana *</label>
            <div className="grid grid-cols-7 gap-2">
              {dayLabels.map(day => (
                <button
                  key={day.num}
                  type="button"
                  onClick={() => toggleDay(day.num)}
                  className={`px-2 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    daysOfWeek.includes(day.num)
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "border-gray-300 text-gray-700 hover:border-indigo-400"
                  }`}
                  title={day.label}
                >
                  {day.label.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {selectedClient && selectedClient.pets.length > 0 && (
            <div>
              <label className="label">Mascotas</label>
              <div className="flex flex-wrap gap-2">
                {selectedClient.pets.map(pet => (
                  <button
                    key={pet.id}
                    type="button"
                    onClick={() => togglePet(pet.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      selectedPets.includes(pet.id)
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "border-gray-300 text-gray-700 hover:border-indigo-400"
                    }`}
                  >
                    {pet.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label">Notas</label>
            <textarea
              className="input"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Instrucciones o detalles adicionales…"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
