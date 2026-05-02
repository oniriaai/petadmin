import React, { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { api } from "../../lib/api";
import { PageLoader } from "../../components/ui/Spinner";

interface Client {
  id: string;
  firstName: string;
  lastName: string;
}

interface Pet {
  id: string;
  name: string;
  species?: string;
}

interface Room {
  id: string;
  name: string;
}

interface Props {
  onSuccess?: () => void;
}

export function CheckInOutForm({ onSuccess }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    clientId: "",
    petIds: [] as string[],
    roomId: "",
    notes: "",
    checkInNow: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (formData.clientId) {
      loadPets(formData.clientId);
    } else {
      setPets([]);
      setFormData(prev => ({ ...prev, petIds: [] }));
    }
  }, [formData.clientId]);

  async function loadData() {
    setLoading(true);
    try {
      const [clientsData, roomsData] = await Promise.all([
        api.get<Client[]>("/clients"),
        api.get<Room[]>("/rooms"),
      ]);
      setClients(clientsData);
      setRooms(roomsData);
    } finally {
      setLoading(false);
    }
  }

  async function loadPets(clientId: string) {
    try {
      const petsData = await api.get<Pet[]>(`/pets?clientId=${clientId}`);
      setPets(petsData);
    } catch (_error) {
      setPets([]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.clientId || formData.petIds.length === 0 || !formData.roomId) {
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/check-in-out", {
        clientId: formData.clientId,
        petIds: formData.petIds,
        roomId: formData.roomId,
        notes: formData.notes,
        checkInNow: formData.checkInNow,
      });
      setFormData({ clientId: "", petIds: [], roomId: "", notes: "", checkInNow: true });
      onSuccess?.();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="py-12"><PageLoader /></div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</label>
          <select
            className="input focus:ring-2 focus:ring-blue-500 transition-all"
            value={formData.clientId}
            onChange={(e) => setFormData({ ...formData, clientId: e.target.value, petIds: [] })}
            required
          >
            <option value="">Seleccionar cliente…</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.firstName} {client.lastName}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sala / Ubicación</label>
          <select
            className="input focus:ring-2 focus:ring-blue-500 transition-all"
            value={formData.roomId}
            onChange={(e) => setFormData({ ...formData, roomId: e.target.value })}
            required
          >
            <option value="">Seleccionar sala…</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mascotas del Cliente</label>
        {pets.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
            <p className="text-sm text-gray-400">
              {formData.clientId ? "Este cliente no tiene mascotas registradas." : "Selecciona un cliente para ver sus mascotas."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {pets.map((pet) => {
              const isSelected = formData.petIds.includes(pet.id);
              return (
                <label
                  key={pet.id}
                  className={`
                    flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer
                    ${isSelected 
                      ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm" 
                      : "border-gray-100 bg-white hover:border-gray-300 text-gray-600"}
                  `}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, petIds: [...formData.petIds, pet.id] });
                      } else {
                        setFormData({
                          ...formData,
                          petIds: formData.petIds.filter((id) => id !== pet.id),
                        });
                      }
                    }}
                  />
                  <span className="text-xl mb-1">
                    {pet.species === "cat" ? "🐈" : "🐕"}
                  </span>
                  <span className="text-sm font-bold truncate w-full text-center">{pet.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Notas</label>
        <textarea
          className="input min-h-[80px] resize-none"
          placeholder="Observaciones adicionales para el ingreso…"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${formData.checkInNow ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-400"}`}>
            <Plus size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Registrar entrada inmediata</p>
            <p className="text-xs text-gray-500">Se marcará como "Ingresado" automáticamente</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFormData(prev => ({ ...prev, checkInNow: !prev.checkInNow }))}
          className={`
            relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none
            ${formData.checkInNow ? "bg-blue-600" : "bg-gray-200"}
          `}
        >
          <span
            className={`
              pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
              ${formData.checkInNow ? "translate-x-5" : "translate-x-0"}
            `}
          />
        </button>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          className="btn-primary flex-1 py-3 text-base shadow-lg shadow-blue-200"
          disabled={submitting || !formData.clientId || formData.petIds.length === 0 || !formData.roomId}
        >
          {submitting ? "Procesando..." : "Crear Registro"}
        </button>
      </div>
    </form>
  );
}
