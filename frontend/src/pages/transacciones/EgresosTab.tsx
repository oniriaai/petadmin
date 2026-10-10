import { useEffect, useState } from "react";
import { CreditCard, Download, Edit2, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { EXPENSE_CATEGORIES, fmt, fmtCurrency } from "../../lib/utils";
import { Badge, type Tone } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { InlineError } from "../../components/ui/InlineError";
import { Pager } from "../../components/ui/Pager";
import { PageLoader } from "../../components/ui/Spinner";
import { Stat, StatStrip } from "../../components/ui/Stat";
import { PayableEntryForm } from "./PayableEntryForm";
import { PayModal } from "./PayModal";
import {
  exportLedger,
  labelOf,
  PAYABLE_STATUSES,
  PAYABLE_TYPES,
  toQuery,
  useDebounced,
  useLedger,
  type Period,
} from "./finance";

interface Payable {
  id: string;
  type: string;
  category: string;
  description: string;
  provider?: { id: string; name: string };
  invoiceNumber?: string;
  invoiceDate?: string;
  subtotal: number;
  vatPercent: number;
  vatAmount: number;
  total: number;
  paid: number;
  balance: number;
  status: string;
  dueDate?: string;
  isRecurring: boolean;
  notes?: string;
  createdAt: string;
  payments: Array<{ id: string; amount: number; date: string; method: string }>;
}

interface PayableSummary {
  total: number;
  paid: number;
  balance: number;
  count: number;
}

const STATUS_TONE: Record<string, Tone> = {
  PENDIENTE: "warning",
  PARCIAL: "info",
  PAGADO: "success",
  VENCIDO: "danger",
};

const NO_FILTERS = { q: "", type: "", category: "", status: "", providerId: "" };

/** What the row shows as its state: an unpaid document past its due date reads as overdue. */
function shownStatus(payable: Payable): string {
  const overdue =
    payable.status !== "PAGADO" && payable.dueDate && new Date(payable.dueDate) < startOfToday();
  return overdue ? "VENCIDO" : payable.status;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function EgresosTab({
  period,
  canWrite,
  canExport,
}: {
  period: Period;
  canWrite: boolean;
  canExport: boolean;
}) {
  const [filters, setFilters] = useState(NO_FILTERS);
  const q = useDebounced(filters.q);
  const query = toQuery({ ...period, ...filters, q });
  const { list, summary, failed, page, setPage, reload } = useLedger<Payable, PayableSummary>(
    "/payables",
    query,
  );
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([]);
  // `undefined` is closed, `null` is a new document.
  const [editing, setEditing] = useState<Payable | null | undefined>(undefined);
  const [paying, setPaying] = useState<Payable | null>(null);
  const filtered = Object.values(filters).some(Boolean);

  useEffect(() => {
    api
      .get<Array<{ id: string; name: string }>>("/providers")
      .then(setProviders)
      .catch(console.error);
  }, []);

  function set(patch: Partial<typeof NO_FILTERS>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  async function remove(payable: Payable) {
    if (!confirm(`¿Eliminamos "${payable.description}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.del(`/payables/${payable.id}`);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No pudimos eliminarlo. Inténtalo de nuevo.");
    }
  }

  return (
    <div className="space-y-5">
      <StatStrip>
        <Stat
          label="Total de egresos"
          value={fmtCurrency(summary?.total)}
          hint={`${summary?.count ?? 0} documentos`}
        />
        <Stat label="Pagado" value={fmtCurrency(summary?.paid)} />
        <Stat
          label="Saldo pendiente"
          value={fmtCurrency(summary?.balance)}
          tone={summary && summary.balance > 0 ? "warning" : undefined}
          hint="Cuentas por pagar"
        />
      </StatStrip>

      <div className="card flex flex-wrap items-center gap-3 px-4 py-2.5">
        <Search size={18} className="text-faint" aria-hidden="true" />
        <input
          type="search"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Buscar por descripción, proveedor o factura..."
          aria-label="Buscar por descripción, proveedor o factura"
          className="min-w-[10rem] flex-1 bg-transparent text-sm text-ink outline-hidden placeholder:text-faint"
        />
        <select
          className="input w-auto"
          aria-label="Estado"
          value={filters.status}
          onChange={(e) => set({ status: e.target.value })}
        >
          <option value="">Todos los estados</option>
          {PAYABLE_STATUSES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          aria-label="Tipo"
          value={filters.type}
          onChange={(e) => set({ type: e.target.value })}
        >
          <option value="">Gastos y compras</option>
          {PAYABLE_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="input w-auto max-w-[12rem]"
          aria-label="Categoría"
          value={filters.category}
          onChange={(e) => set({ category: e.target.value })}
        >
          <option value="">Todas las categorías</option>
          {EXPENSE_CATEGORIES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="input w-auto max-w-[12rem]"
          aria-label="Proveedor"
          value={filters.providerId}
          onChange={(e) => set({ providerId: e.target.value })}
        >
          <option value="">Todos los proveedores</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {filtered && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setFilters(NO_FILTERS)}>
            Limpiar
          </button>
        )}
        {canExport && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => exportLedger("/export/expenses", query, "gastos.xlsx")}
          >
            <Download size={14} aria-hidden="true" /> Excel
          </button>
        )}
        {canWrite && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setEditing(null)}>
            <Plus size={14} aria-hidden="true" /> Nuevo egreso
          </button>
        )}
      </div>

      <div className="bg-surface border border-line-subtle rounded-lg overflow-hidden">
        {failed ? (
          <InlineError onRetry={reload} />
        ) : !list ? (
          <PageLoader />
        ) : list.items.length === 0 ? (
          <EmptyState
            title={
              filtered
                ? "Ningún egreso coincide con estos filtros."
                : "No hay egresos en este periodo."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-sunken border-b">
                <tr>
                  <th className="table-th">Fecha</th>
                  <th className="table-th">Descripción</th>
                  <th className="table-th">Proveedor</th>
                  <th className="table-th">Categoría</th>
                  <th className="table-th text-right">Total</th>
                  <th className="table-th text-right">Pagado</th>
                  <th className="table-th text-right">Saldo</th>
                  <th className="table-th">Vence</th>
                  <th className="table-th">Estado</th>
                  {canWrite && <th className="table-th text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {list.items.map((p) => {
                  const status = shownStatus(p);
                  return (
                    <tr key={p.id} className="table-tr">
                      <td className="table-td text-xs whitespace-nowrap">
                        {fmt(p.invoiceDate ?? p.createdAt)}
                      </td>
                      <td className="table-td">
                        <p className="font-medium text-ink text-sm">{p.description}</p>
                        <p className="text-xs text-muted">
                          {labelOf(PAYABLE_TYPES, p.type)} · {p.invoiceNumber ?? "Sin factura"}
                        </p>
                      </td>
                      <td className="table-td text-xs">{p.provider?.name ?? "—"}</td>
                      <td className="table-td text-xs">
                        {labelOf(EXPENSE_CATEGORIES, p.category)}
                      </td>
                      <td className="table-td text-right font-medium tabular-nums">
                        {fmtCurrency(p.total)}
                      </td>
                      <td className="table-td text-right tabular-nums text-success">
                        {fmtCurrency(p.paid)}
                      </td>
                      <td className="table-td text-right font-semibold tabular-nums text-danger">
                        {fmtCurrency(p.balance)}
                      </td>
                      <td className="table-td text-xs whitespace-nowrap">{fmt(p.dueDate)}</td>
                      <td className="table-td">
                        <Badge tone={STATUS_TONE[status] ?? "neutral"}>
                          {labelOf(PAYABLE_STATUSES, status)}
                        </Badge>
                      </td>
                      {canWrite && (
                        <td className="table-td text-right">
                          <div className="flex gap-1 justify-end">
                            {p.status !== "PAGADO" && (
                              <button
                                onClick={() => setPaying(p)}
                                className="p-1.5 bg-success-soft text-success rounded-sm transition"
                                aria-label="Registrar pago"
                                title="Registrar pago"
                              >
                                <CreditCard size={14} aria-hidden="true" />
                              </button>
                            )}
                            <button
                              onClick={() => setEditing(p)}
                              className="p-1.5 hover:bg-info-soft text-action rounded-sm transition"
                              aria-label="Editar egreso"
                              title="Editar"
                            >
                              <Edit2 size={14} aria-hidden="true" />
                            </button>
                            <button
                              onClick={() => remove(p)}
                              className="p-1.5 hover:bg-danger-soft text-danger rounded-sm transition"
                              aria-label="Eliminar egreso"
                              title="Eliminar"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {list && (
          <Pager page={page} pageCount={list.pageCount} total={list.total} onChange={setPage} />
        )}
      </div>

      <PayableEntryForm
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        payable={editing}
        providers={providers}
        onSaved={reload}
      />
      <PayModal payable={paying} onClose={() => setPaying(null)} onSaved={reload} />
    </div>
  );
}
