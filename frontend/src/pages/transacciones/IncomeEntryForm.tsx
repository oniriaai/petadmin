import { useState, useEffect } from "react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { Spinner } from "../../components/ui/Spinner";
import { INCOME_PAYMENT_METHODS, INCOME_STATUSES } from "./finance";

interface IncomeEntry {
  id?: string;
  concept: string;
  amount: number;
  vatPercent: number;
  paymentMethod: string;
  invoiceStatus: string;
  date: string;
  notes?: string;
  isActive?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  income?: IncomeEntry | null;
  onSaved: () => void;
}

export function IncomeEntryForm({ open, onClose, income, onSaved }: Props) {
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState(0);
  const [vatPercent, setVatPercent] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [invoiceStatus, setInvoiceStatus] = useState("PENDIENTE");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const vatAmount = (amount * vatPercent) / 100;
  const total = amount + vatAmount;

  useEffect(() => {
    if (income) {
      setConcept(income.concept);
      setAmount(income.amount);
      setVatPercent(income.vatPercent);
      setPaymentMethod(income.paymentMethod);
      setInvoiceStatus(income.invoiceStatus);
      setDate(income.date.split("T")[0]);
      setNotes(income.notes || "");
    } else {
      setConcept("");
      setAmount(0);
      setVatPercent(0);
      setPaymentMethod("EFECTIVO");
      setInvoiceStatus("PENDIENTE");
      setDate(new Date().toISOString().split("T")[0]);
      setNotes("");
    }
    setError("");
  }, [income, open]);

  async function handleSave() {
    if (!concept.trim()) {
      setError("El concepto es requerido");
      return;
    }
    if (amount <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    if (!date) {
      setError("La fecha es requerida");
      return;
    }

    setError("");
    setSaving(true);
    try {
      const data = {
        concept: concept.trim(),
        amount,
        vatPercent,
        paymentMethod,
        invoiceStatus,
        date,
        notes: notes.trim(),
      };

      if (income?.id) {
        await api.put(`/incomes/${income.id}`, data);
      } else {
        // Typed in by hand, so it comes from no stay or appointment: without this the server
        // filed it under "Reserva" and the summary counted it as one.
        await api.post("/incomes", { ...data, type: "OTRO" });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(
        (err instanceof Error
          ? err.message
          : "No pudimos guardar los cambios. Inténtalo de nuevo."
        ).substring(0, 200),
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={income ? "Editar Ingreso" : "Nuevo Ingreso"}
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <div className="notice notice-danger">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Concepto</label>
          <input
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Ej: Guardería - Cliente"
            className="w-full px-3 py-2 border border-line rounded-lg focus:outline-hidden focus:ring-2 focus:ring-action"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Monto Base</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
              placeholder="0"
              className="w-full px-3 py-2 border border-line rounded-lg focus:outline-hidden focus:ring-2 focus:ring-action"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">IVA (%)</label>
            <input
              type="number"
              value={vatPercent}
              onChange={(e) => setVatPercent(Math.max(0, parseFloat(e.target.value) || 0))}
              min="0"
              max="100"
              className="w-full px-3 py-2 border border-line rounded-lg focus:outline-hidden focus:ring-2 focus:ring-action"
            />
          </div>
        </div>

        <div className="bg-info-soft border border-info-line rounded-lg p-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted">IVA ({vatPercent}%)</div>
              <div className="text-lg font-semibold text-action">${vatAmount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted">Monto Base</div>
              <div className="text-lg font-semibold text-muted">${amount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted">Total</div>
              <div className="text-lg font-semibold text-info-ink">${total.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Método de Pago</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-lg focus:outline-hidden focus:ring-2 focus:ring-action"
            >
              {INCOME_PAYMENT_METHODS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">Estado</label>
            <select
              value={invoiceStatus}
              onChange={(e) => setInvoiceStatus(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-lg focus:outline-hidden focus:ring-2 focus:ring-action"
            >
              {INCOME_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg focus:outline-hidden focus:ring-2 focus:ring-action"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Notas (Opcional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Información adicional..."
            rows={3}
            className="w-full px-3 py-2 border border-line rounded-lg focus:outline-hidden focus:ring-2 focus:ring-action"
          />
        </div>

        {saving && (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        )}
      </div>
    </Modal>
  );
}
