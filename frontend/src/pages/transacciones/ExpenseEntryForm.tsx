import React, { useState, useEffect } from "react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { Spinner } from "../../components/ui/Spinner";

interface ExpenseEntry {
  id?: string;
  category: string;
  description: string;
  amount: number;
  provider: string;
  date: string;
  notes?: string;
  isActive?: boolean;
}

interface PurchaseEntry {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  provider: string;
  date: string;
  notes?: string;
  isActive?: boolean;
}

type Entry = ExpenseEntry | PurchaseEntry;

interface Props {
  open: boolean;
  onClose: () => void;
  type: "expense" | "purchase";
  entry?: Entry | null;
  onSaved: () => void;
}

export function ExpenseEntryForm({ open, onClose, type, entry, onSaved }: Props) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("SUMINISTROS");
  const [amount, setAmount] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [provider, setProvider] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const totalPrice = quantity * unitPrice;

  useEffect(() => {
    if (entry) {
      setDescription(entry.description);
      setProvider(entry.provider);
      setDate(entry.date.split("T")[0]);
      setNotes(entry.notes || "");

      if (type === "expense" && "category" in entry) {
        setCategory((entry as ExpenseEntry).category);
        setAmount((entry as ExpenseEntry).amount);
      } else if (type === "purchase" && "quantity" in entry) {
        setQuantity((entry as PurchaseEntry).quantity);
        setUnitPrice((entry as PurchaseEntry).unitPrice);
      }
    } else {
      setDescription("");
      setCategory("SUMINISTROS");
      setAmount(0);
      setQuantity(1);
      setUnitPrice(0);
      setProvider("");
      setDate(new Date().toISOString().split("T")[0]);
      setNotes("");
    }
    setError("");
  }, [entry, open, type]);

  async function handleSave() {
    if (!description.trim()) {
      setError("La descripción es requerida");
      return;
    }
    if (!provider.trim()) {
      setError("El proveedor es requerido");
      return;
    }
    if (type === "expense" && amount <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    if (type === "purchase" && (quantity <= 0 || unitPrice <= 0)) {
      setError("La cantidad y el precio deben ser mayores a 0");
      return;
    }
    if (!date) {
      setError("La fecha es requerida");
      return;
    }

    setError("");
    setSaving(true);
    try {
      const baseData = {
        description: description.trim(),
        provider: provider.trim(),
        date,
        notes: notes.trim(),
      };

      let data: any;
      let endpoint: string;

      if (type === "expense") {
        data = {
          ...baseData,
          category,
          amount,
        };
        endpoint = entry?.id
          ? `/financial/expenses/${entry.id}`
          : "/financial/expenses";
      } else {
        data = {
          ...baseData,
          quantity,
          unitPrice,
        };
        endpoint = entry?.id
          ? `/financial/purchases/${entry.id}`
          : "/financial/purchases";
      }

      if (entry?.id) {
        await api.put(endpoint, data);
      } else {
        await api.post(endpoint, data);
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
      title={
        type === "expense"
          ? entry ? "Editar Gasto" : "Nuevo Gasto"
          : entry ? "Editar Compra" : "Nueva Compra"
      }
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Comida para perros"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {type === "expense" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="SUMINISTROS">Suministros</option>
              <option value="SERVICIOS">Servicios</option>
              <option value="PERSONAL">Personal</option>
              <option value="UTILIDADES">Utilidades</option>
              <option value="MANTENIMIENTO">Mantenimiento</option>
              <option value="OTRO">Otro</option>
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
            <input
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="Nombre del proveedor"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
        </div>

        {type === "expense" ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="0"
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 1))}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio Unitario</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="0"
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">Total</div>
                <div className="text-xl font-semibold text-green-700">${totalPrice.toLocaleString()}</div>
              </div>
            </div>
          </>
        )}

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
