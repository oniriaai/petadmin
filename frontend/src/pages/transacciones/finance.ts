import { useEffect, useState } from "react";
import { api, downloadFile } from "../../lib/api";
import { endOfMonth, endOfYear, format, startOfMonth, startOfYear, subMonths } from "date-fns";

/** The days a finance screen covers, both inclusive, as the server reads them (`YYYY-MM-DD`). */
export interface Period {
  from: string;
  to: string;
}

export type PeriodPreset = "month" | "lastMonth" | "year" | "custom";

export const PERIOD_PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "month", label: "Este mes" },
  { value: "lastMonth", label: "Mes anterior" },
  { value: "year", label: "Este año" },
  { value: "custom", label: "Personalizado" },
];

const day = (date: Date) => format(date, "yyyy-MM-dd");

export function presetPeriod(preset: Exclude<PeriodPreset, "custom">, today = new Date()): Period {
  if (preset === "year") return { from: day(startOfYear(today)), to: day(endOfYear(today)) };
  const month = preset === "lastMonth" ? subMonths(today, 1) : today;
  return { from: day(startOfMonth(month)), to: day(endOfMonth(month)) };
}

/** The envelope a list endpoint answers with when asked for a page. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const PAGE_SIZE = 50;

/** A query string from the filters that are set; empty ones are left out. */
export function toQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Every method an income can carry: the ones the form offers and the ones a closing writes. */
export const INCOME_PAYMENT_METHODS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTRO", label: "Otro" },
];

/** Where an income came from. A stay, an appointment or a visit writes its own on closing. */
export const INCOME_TYPES = [
  { value: "GUARDERIA", label: "Guardería" },
  { value: "PELUQUERIA", label: "Peluquería" },
  { value: "ANTICIPO_PELUQUERIA", label: "Anticipo de peluquería" },
  { value: "VETERINARIA", label: "Veterinaria" },
  { value: "RESERVA", label: "Reserva" },
  { value: "OTRO", label: "Otro" },
];

export const INCOME_STATUSES = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "PAGADO", label: "Pagado" },
  { value: "CANCELADO", label: "Cancelado" },
];

/** `VENCIDO` is not stored: the server derives it from the due date of an unpaid document. */
export const PAYABLE_STATUSES = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "PARCIAL", label: "Parcial" },
  { value: "PAGADO", label: "Pagado" },
  { value: "VENCIDO", label: "Vencido" },
];

export const PAYABLE_TYPES = [
  { value: "GASTO", label: "Gasto" },
  { value: "COMPRA", label: "Compra" },
];

export function labelOf(options: Array<{ value: string; label: string }>, value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/**
 * One page of a ledger and the totals of everything its filters match, read together so the
 * figure above the table is never the sum of the rows that happened to load.
 */
export function useLedger<T, S>(path: string, query: string) {
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ list: Page<T> | null; summary: S | null; failed: boolean }>({
    list: null,
    summary: null,
    failed: false,
  });
  // A new filter starts from the first page.
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setPage(1);
  }

  useEffect(() => {
    let stale = false;
    Promise.all([
      api.get<Page<T>>(`${path}?${toQuery({ page, pageSize: PAGE_SIZE })}&${query}`),
      api.get<S>(`${path}/summary?${query}`),
    ])
      .then(([list, summary]) => {
        if (!stale) setState({ list, summary, failed: false });
      })
      .catch(() => {
        if (!stale) setState((current) => ({ ...current, failed: true }));
      });
    return () => {
      stale = true;
    };
  }, [path, query, page, version]);

  return { ...state, page, setPage, reload: () => setVersion((v) => v + 1) };
}

export async function exportLedger(path: string, query: string, filename: string) {
  try {
    await downloadFile(`${path}?${query}`, filename);
  } catch {
    alert("No pudimos descargar el archivo. Inténtalo de nuevo.");
  }
}
