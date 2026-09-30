import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Package, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { PageHeader } from "../../components/layout/PageHeader";
import { fmtCurrency } from "../../lib/utils";

/**
 * Inventory.
 *
 * `inventario` was sellable from the platform console but had no screen at all, so a daycare
 * could buy it and receive nothing. This is that screen: stock levels with a low-stock warning,
 * and the three movement kinds the API already supported (entrada, salida, ajuste).
 */

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  minStock: number;
  currentStock: number;
  unitCost: number;
  businessUnit: string;
}

interface Movement {
  id: string;
  type: "ENTRADA" | "SALIDA" | "AJUSTE";
  quantity: number;
  cost: number | null;
  reason: string | null;
  date: string;
}

const MOVEMENT_LABELS: Record<Movement["type"], string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste",
};

const emptyItem = { name: "", category: "", unit: "unidad", minStock: 0, currentStock: 0, unitCost: 0 };

export function InventarioPage() {
  const { activeBusinessUnit } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [movementFor, setMovementFor] = useState<InventoryItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.get<InventoryItem[]>("/inventory/items"));
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Error al cargar el inventario");
    } finally {
      setLoading(false);
    }
  }, []);

  // The list is scoped by the active unit on the server, so a unit change must refetch.
  useEffect(() => {
    void load();
  }, [load, activeBusinessUnit]);

  async function remove(item: InventoryItem) {
    if (!window.confirm(`¿Dar de baja "${item.name}"? Dejará de aparecer en el inventario.`)) return;
    try {
      await api.del(`/inventory/items/${item.id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Error al dar de baja");
    }
  }

  const lowStockCount = items.filter((item) => item.currentStock <= item.minStock).length;
  const visible = items
    .filter((item) => !onlyLowStock || item.currentStock <= item.minStock)
    .filter((item) =>
      search
        ? `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase())
        : true,
    );
  const totalValue = items.reduce((sum, item) => sum + item.currentStock * item.unitCost, 0);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Inventario"
        subtitle={`${items.length} artículo(s) · valor estimado ${fmtCurrency(totalValue)}`}
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> Nuevo artículo
          </button>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {lowStockCount > 0 && !onlyLowStock && (
        <button
          onClick={() => setOnlyLowStock(true)}
          className="w-full text-left rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2"
        >
          <AlertTriangle size={16} className="shrink-0" />
          {lowStockCount} artículo(s) en el mínimo o por debajo. Ver solo esos.
        </button>
      )}

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por nombre o categoría"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => setOnlyLowStock((v) => !v)}
          className={onlyLowStock ? "btn-primary" : "btn-secondary"}
        >
          <AlertTriangle size={15} /> Stock bajo
        </button>
      </div>

      {loading ? (
        <PageLoader />
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center">
          <Package size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-muted">
            {items.length === 0 ? "Todavía no hay artículos registrados." : "Ningún artículo coincide con el filtro."}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Artículo</th>
                  <th className="table-th">Categoría</th>
                  <th className="table-th">Stock</th>
                  <th className="table-th">Mínimo</th>
                  <th className="table-th">Costo unitario</th>
                  <th className="table-th">Valor</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const isLow = item.currentStock <= item.minStock;
                  return (
                    <tr key={item.id} className="table-tr">
                      <td className="table-td font-medium text-ink">{item.name}</td>
                      <td className="table-td">{item.category}</td>
                      <td className="table-td">
                        <span className={isLow ? "text-amber-700 font-semibold" : ""}>
                          {item.currentStock} {item.unit}
                          {isLow && <AlertTriangle size={13} className="inline-block ml-1.5 -mt-0.5" />}
                        </span>
                      </td>
                      <td className="table-td">{item.minStock}</td>
                      <td className="table-td">{fmtCurrency(item.unitCost)}</td>
                      <td className="table-td">{fmtCurrency(item.currentStock * item.unitCost)}</td>
                      <td className="table-td text-right whitespace-nowrap">
                        <button className="btn-ghost btn-sm" onClick={() => setMovementFor(item)}>
                          <SlidersHorizontal size={14} /> Movimiento
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => {
                            setEditing(item);
                            setShowForm(true);
                          }}
                          aria-label={`Editar ${item.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button className="btn-ghost btn-sm text-red-600" onClick={() => void remove(item)} aria-label={`Dar de baja ${item.name}`}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <ItemForm
          item={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}

      {movementFor && (
        <MovementModal
          item={movementFor}
          onClose={() => setMovementFor(null)}
          onSaved={() => {
            setMovementFor(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ItemForm({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(item ? { ...item } : { ...emptyItem });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      unit: form.unit.trim() || "unidad",
      minStock: Number(form.minStock),
      currentStock: Number(form.currentStock),
      unitCost: Number(form.unitCost),
    };
    try {
      if (item) await api.put(`/inventory/items/${item.id}`, payload);
      else await api.post("/inventory/items", payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={item ? "Editar artículo" : "Nuevo artículo"}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="inv-name">Nombre</label>
            <input id="inv-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="inv-cat">Categoría</label>
            <input id="inv-cat" className="input" required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="inv-unit">Unidad de medida</label>
            <input id="inv-unit" className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="unidad, kg, litro" />
          </div>
          <div>
            <label className="label" htmlFor="inv-cost">Costo unitario</label>
            <input id="inv-cost" className="input" type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: +e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="inv-min">Stock mínimo</label>
            <input id="inv-min" className="input" type="number" min="0" step="0.01" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: +e.target.value })} />
          </div>
          {!item && (
            <div>
              <label className="label" htmlFor="inv-stock">Stock inicial</label>
              <input id="inv-stock" className="input" type="number" min="0" step="0.01" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: +e.target.value })} />
            </div>
          )}
        </div>
        {item && (
          // Editing the level directly would leave no trace of why it changed.
          <p className="text-xs text-muted">
            El stock actual se cambia registrando un movimiento, para que quede el motivo.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Spinner size={14} /> : null} Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MovementModal({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<Movement["type"]>("ENTRADA");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Movement[]>(`/inventory/items/${item.id}/movements`)
      .then(setMovements)
      .catch(() => setMovements([]));
  }, [item.id]);

  // An "ajuste" sets the level outright; the others add to or subtract from it.
  const resulting =
    type === "AJUSTE" ? Number(quantity || 0) : type === "SALIDA" ? item.currentStock - Number(quantity || 0) : item.currentStock + Number(quantity || 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(`/inventory/items/${item.id}/movements`, {
        type,
        quantity: Number(quantity),
        reason: reason.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Error al registrar el movimiento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Movimiento — ${item.name}`}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          {(["ENTRADA", "SALIDA", "AJUSTE"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              className={type === option ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
            >
              {option === "ENTRADA" ? <ArrowUpCircle size={14} /> : option === "SALIDA" ? <ArrowDownCircle size={14} /> : <SlidersHorizontal size={14} />}
              {MOVEMENT_LABELS[option]}
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="mv-qty">
              {type === "AJUSTE" ? "Stock real contado" : "Cantidad"}
            </label>
            <input id="mv-qty" className="input" type="number" min="0" step="0.01" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="mv-reason">Motivo (opcional)</label>
            <input id="mv-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        <p className="text-sm text-muted">
          Stock actual <span className="font-medium text-ink">{item.currentStock} {item.unit}</span>
          {quantity !== "" && (
            <>
              {" → "}
              <span className={`font-medium ${resulting < 0 ? "text-red-600" : "text-ink"}`}>
                {resulting} {item.unit}
              </span>
            </>
          )}
        </p>
        {resulting < 0 && (
          <p className="text-xs text-red-600">La salida supera el stock disponible.</p>
        )}

        {movements.length > 0 && (
          <div className="border-t border-line-subtle pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Últimos movimientos</p>
            <ul className="space-y-1 max-h-40 overflow-y-auto text-sm">
              {movements.slice(0, 10).map((movement) => (
                <li key={movement.id} className="flex items-baseline gap-2">
                  <span className="text-xs text-muted font-mono shrink-0">
                    {new Date(movement.date).toLocaleDateString("es-EC")}
                  </span>
                  <span>
                    {MOVEMENT_LABELS[movement.type]} · {movement.quantity} {item.unit}
                    {movement.reason ? ` · ${movement.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving || quantity === "" || resulting < 0}>
            {saving ? <Spinner size={14} /> : null} Registrar
          </button>
        </div>
      </form>
    </Modal>
  );
}
