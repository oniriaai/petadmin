import { useState, useEffect } from "react";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { api } from "../../lib/api";
import { EXPENSE_CATEGORIES } from "../../lib/utils";

interface PayableEntry {
  id?: string;
  type: string;
  category: string;
  description: string;
  providerId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  subtotal: number;
  vatPercent: number;
  dueDate?: string;
  isRecurring: boolean;
  notes?: string;
}

interface Provider {
  id: string;
  name: string;
}

interface EditablePayable extends PayableEntry {
  provider?: Provider;
}

interface Props {
  open: boolean;
  onClose: () => void;
  payable?: EditablePayable | null;
  providers: Provider[];
  onSaved: () => void;
}

export function PayableEntryForm({ open, onClose, payable, providers, onSaved }: Props) {
  const [form, setForm] = useState({
    type: "GASTO",
    category: "renta",
    description: "",
    providerId: "",
    invoiceNumber: "",
    invoiceDate: "",
    subtotal: "",
    vatPercent: "0",
    dueDate: "",
    isRecurring: false,
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payable) {
      setForm({
        type: payable.type,
        category: payable.category,
        description: payable.description,
        subtotal: payable.subtotal.toString(),
        vatPercent: payable.vatPercent.toString(),
        invoiceNumber: payable.invoiceNumber ?? "",
        invoiceDate: payable.invoiceDate?.slice(0, 10) ?? "",
        dueDate: payable.dueDate?.slice(0, 10) ?? "",
        providerId: payable.provider?.id ?? payable.providerId ?? "",
        isRecurring: payable.isRecurring,
        notes: payable.notes ?? "",
      });
    } else {
      setForm({
        type: "GASTO",
        category: "renta",
        description: "",
        providerId: "",
        invoiceNumber: "",
        invoiceDate: "",
        subtotal: "",
        vatPercent: "0",
        dueDate: "",
        isRecurring: false,
        notes: "",
      });
    }
  }, [payable, open]);

  async function save() {
    if (!form.description || !form.subtotal) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        subtotal: +form.subtotal,
        vatPercent: +form.vatPercent,
        providerId: form.providerId || undefined,
      };

      if (payable?.id) {
        await api.put(`/payables/${payable.id}`, payload);
      } else {
        await api.post("/payables", payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error("Error saving payable:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={payable ? "Editar Egreso" : "Nuevo Egreso (Gasto/Compra)"}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving && <Spinner size={14} />} Guardar
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Tipo</label>
          <select
            className="input"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="GASTO">Gasto</option>
            <option value="COMPRA">Compra</option>
          </select>
        </div>
        <div>
          <label className="label">Categoría</label>
          <select
            className="input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Descripción *</label>
          <input
            className="input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Proveedor</label>
          <select
            className="input"
            value={form.providerId}
            onChange={(e) => setForm({ ...form, providerId: e.target.value })}
          >
            <option value="">Sin proveedor</option>
            {providers.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">No. Factura</label>
          <input
            className="input"
            value={form.invoiceNumber}
            onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Subtotal ($) *</label>
          <input
            className="input"
            type="number"
            value={form.subtotal}
            onChange={(e) => setForm({ ...form, subtotal: e.target.value })}
          />
        </div>
        <div>
          <label className="label">IVA (%)</label>
          <input
            className="input"
            type="number"
            value={form.vatPercent}
            onChange={(e) => setForm({ ...form, vatPercent: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Vencimiento</label>
          <input
            className="input"
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          />
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isRecurring}
            onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
          />
          <label className="text-sm">Gasto recurrente</label>
        </div>
      </div>
    </Modal>
  );
}
