import { useEffect, useState, useMemo } from "react";
import {
  Search,
  User,
  Calendar,
  Clock,
  DollarSign,
  CreditCard,
  FileText,
  Truck,
  X,
} from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { SERVICES, PAYMENT_METHODS, fmtDateTimeLocalInput } from "../../lib/utils";
import { Spinner } from "../../components/ui/Spinner";
import { startOfToday, setHours, setMinutes } from "date-fns";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  pets: Array<{ id: string; name: string; species: string; breed?: string }>;
}
interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number;
}

export function NuevaReservaModal({ open, onClose, onSaved }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form State
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [showClientResults, setShowClientList] = useState(false);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [roomId, setRoomId] = useState("");
  const [service, setService] = useState("GUARDERIA");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [basePrice, setBasePrice] = useState(0);
  const [vatPercent, setVatPercent] = useState(15);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [needsTransport, setNeedsTransport] = useState(false);
  const [transportType, setTransportType] = useState("RECOGIDA");
  const [transportAddress, setTransportAddress] = useState("");
  const [concept, setConcept] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;

    // Set default dates: Today 09:00 to 18:00
    const today09 = setMinutes(setHours(startOfToday(), 9), 0);
    const today18 = setMinutes(setHours(startOfToday(), 18), 0);
    setCheckIn(fmtDateTimeLocalInput(today09));
    setCheckOut(fmtDateTimeLocalInput(today18));

    setLoading(true);
    Promise.all([api.get<Client[]>("/clients?status=active"), api.get<Room[]>("/rooms")])
      .then(([c, r]) => {
        setClients(c);
        setRooms(r);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const selectedClient = useMemo(() => clients.find((c) => c.id === clientId), [clients, clientId]);

  // Auto-generate concept
  useEffect(() => {
    if (!clientId) return;
    const serviceLabel = SERVICES.find((s) => s.value === service)?.label || service;
    const petNames = selectedClient?.pets
      .filter((p) => selectedPetIds.includes(p.id))
      .map((p) => p.name)
      .join(", ");

    const newConcept = `${serviceLabel}${petNames ? ` - ${petNames}` : ""}`;
    setConcept(newConcept);
  }, [service, selectedPetIds, clientId, selectedClient]);

  const vatAmount = (basePrice - discountAmount) * (vatPercent / 100);
  const total = basePrice - discountAmount + vatAmount;
  const pending = total - advanceAmount;

  const filteredClients = useMemo(() => {
    if (!clientSearch) return [];
    const search = clientSearch.toLowerCase();
    return clients
      .filter(
        (c) =>
          c.firstName.toLowerCase().includes(search) || c.lastName.toLowerCase().includes(search),
      )
      .slice(0, 5);
  }, [clients, clientSearch]);

  function togglePet(id: string) {
    setSelectedPetIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handleSelectClient(client: Client) {
    setClientId(client.id);
    setClientSearch(`${client.lastName}, ${client.firstName}`);
    setSelectedPetIds([]);
    setShowClientList(false);
  }

  async function handleSave() {
    if (!clientId) {
      setError("Selecciona un cliente");
      return;
    }
    if (selectedPetIds.length === 0) {
      setError("Selecciona al menos una mascota");
      return;
    }

    // Date validation
    if (checkIn && checkOut && new Date(checkOut) <= new Date(checkIn)) {
      setError("La fecha de salida debe ser posterior a la de entrada");
      return;
    }

    setError("");
    setSaving(true);
    try {
      await api.post("/reservations", {
        clientId,
        petIds: selectedPetIds,
        roomId: roomId || undefined,
        service,
        checkIn: checkIn || undefined,
        checkOut: checkOut || undefined,
        basePrice,
        vatPercent,
        discountAmount,
        advanceAmount,
        paymentMethod,
        concept,
        notes,
        needsTransport,
        transportType: needsTransport ? transportType : undefined,
        transportAddress: needsTransport ? transportAddress : undefined,
      });
      onSaved();
      onClose();
      resetForm();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos guardar los cambios. Inténtalo de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setClientId("");
    setClientSearch("");
    setSelectedPetIds([]);
    setRoomId("");
    setService("GUARDERIA");
    setCheckIn("");
    setCheckOut("");
    setBasePrice(0);
    setVatPercent(15);
    setDiscountAmount(0);
    setAdvanceAmount(0);
    setPaymentMethod("EFECTIVO");
    setNeedsTransport(false);
    setTransportType("RECOGIDA");
    setTransportAddress("");
    setConcept("");
    setNotes("");
    setError("");
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
        resetForm();
      }}
      title="Nueva Reserva"
      size="xl"
      footer={
        <>
          <button
            className="btn-ghost"
            onClick={() => {
              onClose();
              resetForm();
            }}
          >
            Cancelar
          </button>
          <button
            className="btn-primary min-w-[140px]"
            onClick={handleSave}
            disabled={saving || !clientId}
          >
            {saving ? <Spinner size={14} /> : "Guardar Reserva"}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={32} />
        </div>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="notice notice-danger">
              <X size={16} onClick={() => setError("")} className="cursor-pointer" />
              <span>{error}</span>
            </div>
          )}

          {/* Section: Client & Pets */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="relative">
                <label className="label flex items-center gap-2 text-muted font-semibold mb-1.5">
                  <User size={16} className="text-action" /> Cliente *
                </label>
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                  />
                  <input
                    className="input pl-9"
                    placeholder="Buscar cliente por nombre..."
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setShowClientList(true);
                      if (clientId) setClientId("");
                    }}
                    onFocus={() => setShowClientList(true)}
                  />
                  {clientId && (
                    <button
                      onClick={() => {
                        setClientId("");
                        setClientSearch("");
                        setSelectedPetIds([]);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-danger"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {showClientResults && filteredClients.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-surface border border-line-subtle rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                    {filteredClients.map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-4 py-2.5 hover:bg-info-soft transition-colors flex items-center justify-between group"
                        onClick={() => handleSelectClient(c)}
                      >
                        <span className="font-medium text-ink">
                          {c.lastName}, {c.firstName}
                        </span>
                        <span className="text-[10px] bg-sunken text-muted px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100">
                          Seleccionar
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedClient && (
                <div className="p-4 bg-info-soft rounded-xl border border-info-line animate-in zoom-in-95 duration-200">
                  <label className="label text-info-ink font-semibold mb-2 block">Mascotas *</label>
                  {selectedClient.pets.length === 0 ? (
                    <p className="text-xs text-action">
                      Este cliente no tiene mascotas registradas
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedClient.pets.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => togglePet(p.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            selectedPetIds.includes(p.id)
                              ? "bg-action text-white border-action shadow-md ring-2 ring-info-line"
                              : "bg-surface border-info-line text-info-ink hover:border-action"
                          }`}
                        >
                          {p.species === "dog" ? "Perro" : "Gato"} · {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section: Stay Details */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="label flex items-center gap-2">
                    <Clock size={15} className="text-action" /> Servicio
                  </label>
                  <select
                    className="input"
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                  >
                    {SERVICES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="label flex items-center gap-2">
                    <Calendar size={15} className="text-action" /> Sala
                  </label>
                  <select
                    className="input"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                  >
                    <option value="">Sin sala</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} (cap. {r.capacity})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="label font-medium text-muted">Entrada</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="label font-medium text-muted">Salida</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <hr className="border-line-subtle" />

          {/* Section: Financials & Transport */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-4">
              <div className="bg-sunken border border-line-subtle rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-line-subtle pb-2 mb-2">
                  <DollarSign size={18} className="text-success" />
                  <h3 className="font-bold text-ink uppercase tracking-wider text-xs">
                    Desglose de Importes
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <label className="label text-[11px] text-muted uppercase font-bold">
                      Precio Base
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
                      <input
                        className="input pl-7 bg-surface"
                        type="number"
                        min="0"
                        step="0.01"
                        value={basePrice}
                        onChange={(e) => setBasePrice(+e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label text-[11px] text-muted uppercase font-bold">
                      IVA (%)
                    </label>
                    <input
                      className="input bg-surface"
                      type="number"
                      min="0"
                      max="100"
                      value={vatPercent}
                      onChange={(e) => setVatPercent(+e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label text-[11px] text-muted uppercase font-bold">
                      Descuento ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
                      <input
                        className="input pl-7 bg-surface"
                        type="number"
                        min="0"
                        step="0.01"
                        value={discountAmount}
                        onChange={(e) => setDiscountAmount(+e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label text-[11px] text-muted uppercase font-bold text-action">
                      Adelanto ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-action">
                        $
                      </span>
                      <input
                        className="input pl-7 bg-surface border-info-line focus:border-action"
                        type="number"
                        min="0"
                        step="0.01"
                        value={advanceAmount}
                        onChange={(e) => setAdvanceAmount(+e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-3 border-t border-line-subtle">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted font-medium italic">IVA ({vatPercent}%)</span>
                    <span className="font-bold text-muted">${vatAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-surface p-2 rounded-lg border border-line-subtle">
                    <span className="text-muted font-bold uppercase text-xs">Total a pagar</span>
                    <span className="text-lg font-black text-ink">${total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm px-2">
                    <span className="text-danger font-bold uppercase text-[10px]">
                      Saldo Pendiente
                    </span>
                    <span className="text-base font-black text-danger">${pending.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="label flex items-center gap-2">
                    <CreditCard size={15} className="text-muted" /> Forma de pago
                  </label>
                  <select
                    className="input"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label flex items-center gap-2">
                    <FileText size={15} className="text-muted" /> Concepto
                  </label>
                  <input
                    className="input"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    placeholder="Ej: Guardería - Max"
                  />
                </div>

                <div className="border border-dashed border-line-subtle rounded-xl p-4 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={needsTransport}
                      onChange={(e) => setNeedsTransport(e.target.checked)}
                      className="w-4 h-4 rounded text-action transition-all"
                    />
                    <span className="text-sm font-bold text-muted group-hover:text-action transition-colors flex items-center gap-1.5">
                      <Truck size={16} /> Requiere transporte
                    </span>
                  </label>
                  {needsTransport && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-left-2 duration-300">
                      <div>
                        <label className="label text-[10px] uppercase font-bold text-muted">
                          Tipo
                        </label>
                        <select
                          className="input text-sm"
                          value={transportType}
                          onChange={(e) => setTransportType(e.target.value)}
                        >
                          <option value="RECOGIDA">Recogida</option>
                          <option value="ENTREGA">Entrega</option>
                          <option value="AMBAS">Recogida y Entrega</option>
                        </select>
                      </div>
                      <div>
                        <label className="label text-[10px] uppercase font-bold text-muted">
                          Dirección
                        </label>
                        <input
                          className="input text-sm"
                          value={transportAddress}
                          onChange={(e) => setTransportAddress(e.target.value)}
                          placeholder="Calle y ciudad"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="label font-medium text-muted mb-1.5 block">
              Notas e Instrucciones
            </label>
            <textarea
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Escribe aquí cualquier observación relevante..."
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
