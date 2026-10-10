import { useState } from "react";
import { Download, Edit2, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { fmt, fmtCurrency } from "../../lib/utils";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { InlineError } from "../../components/ui/InlineError";
import { Pager } from "../../components/ui/Pager";
import { PageLoader } from "../../components/ui/Spinner";
import { Stat, StatStrip } from "../../components/ui/Stat";
import { IncomeEntryForm } from "./IncomeEntryForm";
import {
  exportLedger,
  INCOME_PAYMENT_METHODS,
  INCOME_STATUSES,
  INCOME_TYPES,
  labelOf,
  toQuery,
  useDebounced,
  useLedger,
  type Period,
} from "./finance";

interface Income {
  id: string;
  type: string;
  concept: string;
  amount: number;
  vatPercent: number;
  vatAmount: number;
  total: number;
  paymentMethod: string;
  invoiceStatus: string;
  date: string;
  notes?: string;
}

interface IncomeSummary {
  total: number;
  vat: number;
  count: number;
}

const NO_FILTERS = { q: "", type: "", paymentMethod: "", status: "" };

export function IncomesTab({
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
  const { list, summary, failed, page, setPage, reload } = useLedger<Income, IncomeSummary>(
    "/incomes",
    query,
  );
  // `undefined` is closed, `null` is a new income.
  const [editing, setEditing] = useState<Income | null | undefined>(undefined);
  const filtered = Object.values(filters).some(Boolean);

  function set(patch: Partial<typeof NO_FILTERS>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  async function remove(income: Income) {
    if (!confirm(`¿Eliminamos el ingreso "${income.concept}"? Esta acción no se puede deshacer.`))
      return;
    try {
      await api.del(`/incomes/${income.id}`);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No pudimos eliminarlo. Inténtalo de nuevo.");
    }
  }

  return (
    <div className="space-y-5">
      <StatStrip>
        <Stat
          label="Total de ingresos"
          value={fmtCurrency(summary?.total)}
          tone="success"
          hint={`${summary?.count ?? 0} registros`}
        />
        <Stat label="IVA cobrado" value={fmtCurrency(summary?.vat)} />
      </StatStrip>

      <div className="card flex flex-wrap items-center gap-3 px-4 py-2.5">
        <Search size={18} className="text-faint" aria-hidden="true" />
        <input
          type="search"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Buscar por concepto..."
          aria-label="Buscar por concepto"
          className="min-w-[10rem] flex-1 bg-transparent text-sm text-ink outline-hidden placeholder:text-faint"
        />
        <select
          className="input w-auto"
          aria-label="Origen"
          value={filters.type}
          onChange={(e) => set({ type: e.target.value })}
        >
          <option value="">Todos los orígenes</option>
          {INCOME_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          aria-label="Método de pago"
          value={filters.paymentMethod}
          onChange={(e) => set({ paymentMethod: e.target.value })}
        >
          <option value="">Todos los métodos</option>
          {INCOME_PAYMENT_METHODS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          aria-label="Estado"
          value={filters.status}
          onChange={(e) => set({ status: e.target.value })}
        >
          <option value="">Todos los estados</option>
          {INCOME_STATUSES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
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
            onClick={() => exportLedger("/export/incomes", query, "ingresos.xlsx")}
          >
            <Download size={14} aria-hidden="true" /> Excel
          </button>
        )}
        {canWrite && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setEditing(null)}>
            <Plus size={14} aria-hidden="true" /> Nuevo ingreso
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
                ? "Ningún ingreso coincide con estos filtros."
                : "No hay ingresos en este periodo."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-sunken border-b">
                <tr>
                  <th className="table-th">Fecha</th>
                  <th className="table-th">Concepto</th>
                  <th className="table-th">Origen</th>
                  <th className="table-th text-right">Monto base</th>
                  <th className="table-th text-right">IVA</th>
                  <th className="table-th text-right">Total</th>
                  <th className="table-th">Pago</th>
                  <th className="table-th">Estado</th>
                  {canWrite && <th className="table-th text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {list.items.map((income) => (
                  <tr key={income.id} className="table-tr">
                    <td className="table-td text-xs whitespace-nowrap">{fmt(income.date)}</td>
                    <td className="table-td font-medium">{income.concept}</td>
                    <td className="table-td text-xs">{labelOf(INCOME_TYPES, income.type)}</td>
                    <td className="table-td text-right tabular-nums">
                      {fmtCurrency(income.amount)}
                    </td>
                    <td className="table-td text-right tabular-nums text-muted">
                      {fmtCurrency(income.vatAmount)}
                    </td>
                    <td className="table-td text-right font-semibold tabular-nums text-success">
                      {fmtCurrency(income.total)}
                    </td>
                    <td className="table-td text-xs">
                      {labelOf(INCOME_PAYMENT_METHODS, income.paymentMethod)}
                    </td>
                    <td className="table-td">
                      <Badge tone={income.invoiceStatus === "PAGADO" ? "success" : "warning"}>
                        {labelOf(INCOME_STATUSES, income.invoiceStatus)}
                      </Badge>
                    </td>
                    {canWrite && (
                      <td className="table-td text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditing(income)}
                            className="p-1.5 hover:bg-info-soft text-action rounded-sm transition"
                            aria-label="Editar ingreso"
                            title="Editar"
                          >
                            <Edit2 size={14} aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => remove(income)}
                            className="p-1.5 hover:bg-danger-soft text-danger rounded-sm transition"
                            aria-label="Eliminar ingreso"
                            title="Eliminar"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list && (
          <Pager page={page} pageCount={list.pageCount} total={list.total} onChange={setPage} />
        )}
      </div>

      <IncomeEntryForm
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        income={editing}
        onSaved={reload}
      />
    </div>
  );
}
