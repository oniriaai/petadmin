import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { PageLoader } from "../../components/ui/Spinner";
import { fmtCurrency } from "../../lib/utils";
import {
  SERVICE_CATEGORIES,
  VISIT_TYPES,
  errorMessage,
  veterinariaApi,
  type ClinicSummary,
} from "./api";

const dayInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

/** The clinic's figures for a period: activity, money, diagnoses and the ward. */
export function InformeClinicaPage() {
  const [from, setFrom] = useState(() => dayInput(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(() => dayInput(new Date()));
  const [summary, setSummary] = useState<ClinicSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!from || !to) return;
    let current = true;
    veterinariaApi
      .summary({
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: new Date(`${to}T23:59:59`).toISOString(),
      })
      .then((loaded) => {
        if (!current) return;
        setSummary(loaded);
        setError("");
      })
      .catch((e) => current && setError(errorMessage(e, "No se pudo cargar el informe")));
    return () => {
      current = false;
    };
  }, [from, to]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Informe de la clínica"
        subtitle="Actividad, facturación, diagnósticos y hospitalización del periodo"
        actions={
          <span className="flex flex-wrap items-center gap-2 print:hidden">
            <input
              type="date"
              className="input w-auto"
              aria-label="Desde"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              type="date"
              className="input w-auto"
              aria-label="Hasta"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
            <button className="btn-secondary" onClick={() => window.print()}>
              <Printer size={16} /> Imprimir
            </button>
          </span>
        }
      />

      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}

      {!summary ? (
        !error && <PageLoader />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Figure label="Consultas atendidas" value={String(summary.visits.total)} />
            <Figure label="No asistieron" value={String(summary.visits.missed)} />
            <Figure
              label="Facturado"
              value={fmtCurrency(summary.revenue.billed)}
              hint="Consultas cerradas, antes de descuentos e IVA"
            />
            <Figure
              label="Cobrado"
              value={fmtCurrency(summary.revenue.collected)}
              hint="Pagos recibidos en el periodo"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Breakdown
              title="Consultas por tipo"
              rows={summary.visits.byType.map((row) => [
                VISIT_TYPES[row.type] ?? row.type,
                String(row.count),
              ])}
            />
            <Breakdown
              title="Consultas por veterinario"
              rows={summary.visits.byVeterinarian.map((row) => [row.name, String(row.count)])}
            />
            <Breakdown
              title="Facturación por categoría"
              rows={summary.revenue.byCategory.map((row) => [
                SERVICE_CATEGORIES[row.category] ?? row.category,
                fmtCurrency(row.amount),
              ])}
            />
            <Breakdown
              title="Diagnósticos más frecuentes"
              rows={summary.topDiagnoses.map((row) => [row.description, String(row.count)])}
            />
            <Breakdown
              title="Hospitalización"
              rows={[
                ["Ingresos en el periodo", String(summary.hospital.admissions)],
                ["Altas en el periodo", String(summary.hospital.discharges)],
                [
                  "Estancia media",
                  summary.hospital.averageStayDays === null
                    ? "—"
                    : `${summary.hospital.averageStayDays} días`,
                ],
                ...summary.hospital.wards.map((ward): [string, string] => [
                  `Ocupación actual · ${ward.name}`,
                  `${ward.occupied}/${ward.capacity}`,
                ]),
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <section className="card p-4 space-y-2 text-sm" aria-label={title}>
      <h2 className="section-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted">Sin datos en el periodo.</p>
      ) : (
        <dl className="divide-y divide-line-subtle">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 py-1.5">
              <dt className="text-muted">{label}</dt>
              <dd className="font-medium text-ink tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
