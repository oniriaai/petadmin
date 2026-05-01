import React, { useState, useEffect } from "react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { Spinner } from "../../components/ui/Spinner";

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
        await api.put(`/financial/incomes/${income.id}`, data);
      } else {
        await api.post("/financial/incomes", data);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError((err instanceof Error ? err.message : "Error al guardar").substring(0, 200));
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
        {error && <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
          <input
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Ej: Guardería - Cliente"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monto Base</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IVA (%)</label>
            <input
              type="number"
              value={vatPercent}
              onChange={(e) => setVatPercent(Math.max(0, parseFloat(e.target.value) || 0))}
              min="0"
              max="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-600">IVA ({vatPercent}%)</div>
              <div className="text-lg font-semibold text-blue-600">${vatAmount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-gray-600">Monto Base</div>
              <div className="text-lg font-semibold text-gray-700">${amount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-gray-600">Total</div>
              <div className="text-lg font-semibold text-blue-700">${total.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Método de Pago</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta de Crédito</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select
              value={invoiceStatus}
              onChange={(e) => setInvoiceStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="PENDIENTE">Pendiente</option>
              <option value="PAGADO">Pagado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas (Opcional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Información adicional..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
