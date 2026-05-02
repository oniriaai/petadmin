import { format, parseISO, isValid, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export function fmt(date: string | Date | null | undefined, pattern = "dd/MM/yyyy") {
  if (!date) return "—";
  const d = typeof date === "string" ? parseISO(date) : date;
  return isValid(d) ? format(d, pattern, { locale: es }) : "—";
}

export function fmtRelativeTime(date: string | Date | null | undefined) {
  if (!date) return "";
  const d = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(d)) return "";
  return formatDistanceToNow(d, { locale: es, addSuffix: true });
}

export function fmtTime(date: string | Date | null | undefined) {
  return fmt(date, "HH:mm");
}

export function fmtDateTime(date: string | Date | null | undefined) {
  return fmt(date, "dd/MM/yyyy HH:mm");
}

export function fmtCurrency(v: number | null | undefined) {
  if (v == null) return "$0.00";
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(v);
}

export function cls(...args: (string | undefined | false | null)[]) {
  return args.filter(Boolean).join(" ");
}

export const SERVICES = [
  { value: "GUARDERIA", label: "Guardería Canina" },
  { value: "PELUQUERIA_CANINA", label: "Peluquería Canina" },
  { value: "PELUQUERIA_FELINA", label: "Peluquería Felina" },
  { value: "TRANSPORTE", label: "Transporte" },
  { value: "OTRO", label: "Otro" },
];

export const STATUSES: Record<string, { label: string; color: string }> = {
  PENDIENTE:   { label: "Pendiente",   color: "bg-yellow-100 text-yellow-800" },
  CONFIRMADA:  { label: "Confirmada",  color: "bg-blue-100 text-blue-800" },
  ACTIVA:      { label: "Activa",      color: "bg-green-100 text-green-800" },
  COMPLETADA:  { label: "Completada",  color: "bg-gray-100 text-gray-700" },
  CANCELADA:   { label: "Cancelada",   color: "bg-red-100 text-red-700" },
};

export const PAYMENT_METHODS = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"];

export const EXPENSE_CATEGORIES = [
  { value: "renta",         label: "Renta / Arriendo" },
  { value: "servicios",     label: "Servicios (agua, luz, teléfono)" },
  { value: "alimentos",     label: "Alimentos y suministros" },
  { value: "peluqueria",    label: "Insumos de peluquería" },
  { value: "limpieza",      label: "Limpieza" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "impuestos",     label: "Impuestos y permisos" },
  { value: "veterinario",   label: "Servicios veterinarios" },
  { value: "marketing",     label: "Marketing" },
  { value: "otro",          label: "Otro" },
];

export const SEVERITY_COLOR: Record<string, string> = {
  ALTA:  "bg-red-100 text-red-800",
  MEDIA: "bg-yellow-100 text-yellow-800",
  BAJA:  "bg-green-100 text-green-800",
};
