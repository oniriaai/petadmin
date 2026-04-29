import React, { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { SERVICES, PAYMENT_METHODS } from "../../lib/utils";
import { Spinner } from "../../components/ui/Spinner";

interface Props { open: boolean; onClose: () => void; onSaved: () => void; }

interface Client { id: string; firstName: string; lastName: string; pets: Array<{ id: string; name: string; species: string; breed?: string }> }
interface Room { id: string; name: string; type: string; capacity: number }

export function NuevaReservaModal({ open, onClose, onSaved }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [clientId, setClientId] = useState("");
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
    setLoading(true);
    Promise.all([api.get<Client[]>("/clients?status=active"), api.get<Room[]>("/rooms")])
      .then(([c, r]) => { setClients(c); setRooms(r); })
      .finally(() => setLoading(false));
  }, [open]);

  const selectedClient = clients.find(c => c.id === clientId);
  const vatAmount = (basePrice - discountAmount) * (vatPercent / 100);
  const total = basePrice - discountAmount + vatAmount;
  const pending = total - advanceAmount;

  function togglePet(id: string) {
    setSelectedPetIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!clientId) { setError("Selecciona un cliente"); return; }
    if (selectedPetIds.length === 0) { setError("Selecciona al menos una mascota"); return; }
    setError(""); setSaving(true);
    try {
      await api.post("/reservations", {
        clientId, petIds: selectedPetIds, roomId: roomId || undefined, service,
        checkIn: checkIn || undefined, checkOut: checkOut || undefined,
        basePrice, vatPercent, discountAmount, advanceAmount,
        paymentMethod, concept, notes,
        needsTransport, transportType: needsTransport ? transportType : undefined,
        transportAddress: needsTransport ? transportAddress : undefined,
      });
      onSaved(); onClose(); resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally { setSaving(false); }
  }

  function resetForm() {
    setClientId(""); setSelectedPetIds([]); setRoomId(""); setService("GUARDERIA");
    setCheckIn(""); setCheckOut(""); setBasePrice(0); setVatPercent(15);
    setDiscountAmount(0); setAdvanceAmount(0); setPaymentMethod("EFECTIVO");
    setNeedsTransport(false); setTransportType("RECOGIDA"); setTransportAddress("");
    setConcept(""); setNotes(""); setError("");
  }

  return (
    <Modal open={open} onClose={() => { onClose(); resetForm(); }} title="Nueva Reserva" size="xl"
      footer={
        <>
          <button className="btn-secondary" onClick={() => { onClose(); resetForm(); }}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size={14} /> : null} Guardar Reserva
          </button>
        </>
      }>
      {loading ? <div className="flex justify-center py-8"><Spinner size={28} /></div> : (
        <div className="space-y-5">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Cliente *</label>
              <select className="input" value={clientId} onChange={e => { setClientId(e.target.value); setSelectedPetIds([]); }}>
                <option value="">— Seleccionar cliente —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName}</option>)}
              </select>
            </div>

            {selectedClient && (
              <div className="col-span-2">
                <label className="label">Mascotas *</label>
                {selectedClient.pets.length === 0 ? (
                  <p className="text-sm text-yellow-600 bg-yellow-50 rounded-lg px-3 py-2">Este cliente no tiene mascotas registradas</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedClient.pets.map(p => (
                      <button key={p.id} type="button" onClick={() => togglePet(p.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${selectedPetIds.includes(p.id) ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-700 hover:border-indigo-400"}`}>
                        {p.species === "dog" ? "🐶" : "🐱"} {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="label">Servicio</label>
              <select className="input" value={service} onChange={e => setService(e.target.value)}>
                {SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Sala / Habitación</label>
              <select className="input" value={roomId} onChange={e => setRoomId(e.target.value)}>
                <option value="">— Sin sala asignada —</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name} (cap. {r.capacity})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fecha y hora entrada</label>
              <input className="input" type="datetime-local" value={checkIn} onChange={e => setCheckIn(e.target.value)} />
            </div>
            <div>
              <label className="label">Fecha y hora salida</label>
              <input className="input" type="datetime-local" value={checkOut} onChange={e => setCheckOut(e.target.value)} />
            </div>
          </div>

          <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
            <h3 className="font-medium text-gray-800 text-sm">Importes</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Precio base ($)</label><input className="input" type="number" min="0" step="0.01" value={basePrice} onChange={e => setBasePrice(+e.target.value)} /></div>
              <div><label className="label">IVA (%)</label><input className="input" type="number" min="0" max="100" value={vatPercent} onChange={e => setVatPercent(+e.target.value)} /></div>
              <div><label className="label">Descuento ($)</label><input className="input" type="number" min="0" step="0.01" value={discountAmount} onChange={e => setDiscountAmount(+e.target.value)} /></div>
              <div><label className="label">Adelanto ($)</label><input className="input" type="number" min="0" step="0.01" value={advanceAmount} onChange={e => setAdvanceAmount(+e.target.value)} /></div>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
              <span className="text-gray-600">IVA: <strong>${vatAmount.toFixed(2)}</strong></span>
              <span className="text-gray-600">Total: <strong>${total.toFixed(2)}</strong></span>
              <span className="text-red-600">Pendiente: <strong>${pending.toFixed(2)}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Forma de pago</label>
              <select className="input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Concepto</label>
              <input className="input" value={concept} onChange={e => setConcept(e.target.value)} placeholder="Descripción del servicio" />
            </div>
            <div className="col-span-2">
              <label className="label">Notas</label>
              <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Instrucciones especiales, observaciones..." />
            </div>
          </div>

          <div className="border rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={needsTransport} onChange={e => setNeedsTransport(e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm font-medium text-gray-700">🚗 Requiere transporte</span>
            </label>
            {needsTransport && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tipo</label>
                  <select className="input" value={transportType} onChange={e => setTransportType(e.target.value)}>
                    <option value="RECOGIDA">Recogida</option>
                    <option value="ENTREGA">Entrega</option>
                    <option value="AMBAS">Recogida y Entrega</option>
                  </select>
                </div>
                <div>
                  <label className="label">Dirección</label>
                  <input className="input" value={transportAddress} onChange={e => setTransportAddress(e.target.value)} placeholder="Calle y ciudad" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
