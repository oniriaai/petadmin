import { useState, useEffect } from "react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { fmt, fmtTime, fmtCurrency, SERVICES, PAYMENT_METHODS } from "../../lib/utils";
import { Spinner } from "../../components/ui/Spinner";

interface Reservation {
  id: string;
  clientId: string;
  client: { id: string; firstName: string; lastName: string };
  pets: Array<{ id: string; pet: { id: string; name: string } }>;
  room?: { id: string; name: string };
  roomId?: string;
  service: string;
  status: string;
  checkIn?: string;
  checkOut?: string;
  needsTransport: boolean;
  transportType?: string;
  transportAddress?: string;
  basePrice: number;
  vatPercent: number;
  discountAmount: number;
  advanceAmount: number;
  vatAmount: number;
  totalAmount: number;
  pendingAmount: number;
  paymentMethod?: string;
  concept?: string;
  notes?: string;
}

interface Room {
  id: string;
  name: string;
  capacity: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  reservation?: Reservation | null;
  onSaved: () => void;
}

export function ReservationDetailModal({ open, onClose, reservation, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [basePrice, setBasePrice] = useState(0);
  const [vatPercent, setVatPercent] = useState(15);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [roomId, setRoomId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !reservation) return;
    setEditing(false);
    setBasePrice(reservation.basePrice);
    setVatPercent(reservation.vatPercent);
    setDiscountAmount(reservation.discountAmount);
    setAdvanceAmount(reservation.advanceAmount);
    setRoomId(reservation.roomId || "");
    setPaymentMethod(reservation.paymentMethod || "EFECTIVO");
    setNotes(reservation.notes || "");
    setError("");
  }, [open, reservation]);

  useEffect(() => {
    if (!editing) return;
    setLoading(true);
    api
      .get<Room[]>("/rooms?status=active")
      .then(setRooms)
      .finally(() => setLoading(false));
  }, [editing]);

  async function handleSave() {
    if (!reservation) return;
    setError("");
    setSaving(true);
    try {
      await api.put(`/reservations/${reservation.id}`, {
        basePrice,
        vatPercent,
        discountAmount,
        advanceAmount,
        roomId: roomId || undefined,
        paymentMethod,
        notes,
      });
      onSaved();
      setEditing(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos guardar los cambios. Inténtalo de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!reservation) return null;

  const vatAmount = (basePrice - discountAmount) * (vatPercent / 100);
  const total = basePrice - discountAmount + vatAmount;
  const pending = total - advanceAmount;

  const canEdit = ["PENDIENTE", "CONFIRMADA"].includes(reservation.status);
  const svc = SERVICES.find((s) => s.value === reservation.service)?.label || reservation.service;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detalle de Reserva"
      size="lg"
      footer={
        editing ? (
          <>
            <button className="btn-secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size={14} /> : null}
              Guardar Cambios
            </button>
          </>
        ) : (
          <>
            {canEdit && (
              <button className="btn-primary" onClick={() => setEditing(true)}>
                Editar
              </button>
            )}
            <button className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </>
        )
      }
    >
      {error && (
        <p className="text-sm text-danger bg-danger-soft rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {!editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="label">Cliente</p>
              <p>
                {reservation.client.firstName} {reservation.client.lastName}
              </p>
            </div>
            <div>
              <p className="label">Mascotas</p>
              <p>{reservation.pets.map((p) => p.pet.name).join(", ")}</p>
            </div>
            <div>
              <p className="label">Servicio</p>
              <p>{svc}</p>
            </div>
            <div>
              <p className="label">Sala</p>
              <p>{reservation.room?.name || "—"}</p>
            </div>
            <div>
              <p className="label">Entrada</p>
              <p>
                {reservation.checkIn
                  ? `${fmt(reservation.checkIn)} ${fmtTime(reservation.checkIn)}`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="label">Salida</p>
              <p>
                {reservation.checkOut
                  ? `${fmt(reservation.checkOut)} ${fmtTime(reservation.checkOut)}`
                  : "—"}
              </p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Pricing</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Precio base:</span>
                <span className="font-medium">{fmtCurrency(reservation.basePrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Descuento:</span>
                <span className="font-medium">-{fmtCurrency(reservation.discountAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">IVA ({reservation.vatPercent}%):</span>
                <span className="font-medium">{fmtCurrency(reservation.vatAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Adelanto:</span>
                <span className="font-medium">-{fmtCurrency(reservation.advanceAmount)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total:</span>
                <span>{fmtCurrency(reservation.totalAmount)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold text-danger">
                <span>Pendiente:</span>
                <span>{fmtCurrency(reservation.pendingAmount)}</span>
              </div>
            </div>
          </div>

          {(reservation.concept || reservation.notes) && (
            <div className="border-t pt-4 space-y-2">
              {reservation.concept && (
                <div>
                  <p className="label">Concepto</p>
                  <p>{reservation.concept}</p>
                </div>
              )}
              {reservation.notes && (
                <div>
                  <p className="label">Notas</p>
                  <p className="text-muted">{reservation.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner size={28} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Precio base ($)</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={basePrice}
                    onChange={(e) => setBasePrice(+e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">IVA (%)</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="100"
                    value={vatPercent}
                    onChange={(e) => setVatPercent(+e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Descuento ($)</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(+e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Adelanto ($)</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(+e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Sala</label>
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
                <div>
                  <label className="label">Forma de pago</label>
                  <select
                    className="input"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Notas</label>
                <textarea
                  className="input"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instrucciones especiales…"
                />
              </div>

              <div className="border rounded-lg p-3 bg-sunken space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-medium">{fmtCurrency(basePrice - discountAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA:</span>
                  <span className="font-medium">{fmtCurrency(vatAmount)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-semibold">
                  <span>Total:</span>
                  <span>{fmtCurrency(total)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-semibold text-danger">
                  <span>Pendiente:</span>
                  <span>{fmtCurrency(pending)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
