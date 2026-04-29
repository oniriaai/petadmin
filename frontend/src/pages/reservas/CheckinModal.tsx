import React, { useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { PAYMENT_METHODS } from "../../lib/utils";
import { Spinner } from "../../components/ui/Spinner";

interface Reservation { id: string; client: { firstName: string; lastName: string }; totalAmount: number; paymentMethod?: string }

interface Props {
  open: boolean;
  onClose: () => void;
  reservation: Reservation | null;
  mode: "checkin" | "checkout";
  onConfirm: (id: string, time?: string, createIncome?: boolean, method?: string) => Promise<void>;
}

export function CheckinModal({ open, onClose, reservation, mode, onConfirm }: Props) {
  const [time, setTime] = useState(new Date().toISOString().slice(0, 16));
  const [createIncome, setCreateIncome] = useState(true);
  const [method, setMethod] = useState("EFECTIVO");
  const [saving, setSaving] = useState(false);

  async function handle() {
    if (!reservation) return;
    setSaving(true);
    try { await onConfirm(reservation.id, time, createIncome, method); }
    finally { setSaving(false); }
  }

  if (!reservation) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "checkin" ? "Registrar Entrada" : "Registrar Salida"}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className={mode === "checkin" ? "btn-success" : "btn-warning"} onClick={handle} disabled={saving}>
            {saving ? <Spinner size={14} /> : null}
            {mode === "checkin" ? "Confirmar Entrada" : "Confirmar Salida"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Cliente: <strong>{reservation.client.firstName} {reservation.client.lastName}</strong>
        </p>
        <div>
          <label className="label">Hora {mode === "checkin" ? "de entrada" : "de salida"}</label>
          <input className="input" type="datetime-local" value={time} onChange={e => setTime(e.target.value)} />
        </div>
        {mode === "checkout" && (
          <>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={createIncome} onChange={e => setCreateIncome(e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm font-medium text-gray-700">Registrar ingreso (${reservation.totalAmount.toFixed(2)})</span>
            </label>
            {createIncome && (
              <div>
                <label className="label">Forma de cobro</label>
                <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
