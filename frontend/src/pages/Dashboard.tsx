import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  PawPrint,
  Scissors,
  Car,
  CheckCircle2,
  CircleAlert,
  CalendarPlus,
  UserPlus,
  BarChart3,
  BriefcaseBusiness,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useCanOpen } from "../modules/access";
import { ClinicRemindersCard } from "./veterinaria/ClinicRemindersCard";
import { normalizeBusinessUnit } from "../modules/shared/contracts";
import { fmtCurrency, fmt, fmtTime, fmtDayLabel, STATUSES } from "../lib/utils";
import { Badge } from "../components/ui/Badge";
import { PageLoader } from "../components/ui/Spinner";
import { PageHeader } from "../components/layout/PageHeader";
import { Stat, StatStrip } from "../components/ui/Stat";
import { SectionCard } from "../components/ui/SectionCard";
import { EmptyState } from "../components/ui/EmptyState";
import { InlineError } from "../components/ui/InlineError";
import { UnitBadge } from "../components/ui/UnitBadge";

interface Summary {
  reservasHoy: number;
  activas: number;
  entradas: number;
  salidas: number;
  /** null when the session may not read the finances: the server leaves the figures out. */
  ingresosHoy: number | null;
  ingresosMes: number | null;
  totalClientes: number;
  alertas: Array<{ id: string; severity: string; title: string; pet?: string }>;
  proximasReservas: Array<{
    id: string;
    cliente: string;
    mascotas: string;
    servicio: string;
    estado: string;
    checkIn: string;
    sala?: string;
  }>;
}

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  ALTA: <CircleAlert size={15} className="text-danger inline-block" aria-label="Alta" />,
  MEDIA: <CircleAlert size={15} className="text-warning inline-block" aria-label="Media" />,
  BAJA: <CircleAlert size={15} className="text-success inline-block" aria-label="Baja" />,
} as const;

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Service tile: the unit's colour on the unit's tint, so a row says whose reservation it is. */
function ServiceIcon({ servicio }: { servicio: string }) {
  if (servicio === "GUARDERIA") {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-daycare-50 text-daycare-600">
        <PawPrint size={17} aria-hidden="true" />
      </span>
    );
  }
  if (servicio.startsWith("PELUQUERIA")) {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-grooming-50 text-grooming-600">
        <Scissors size={17} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sunken text-muted">
      <Car size={17} aria-hidden="true" />
    </span>
  );
}

export function Dashboard() {
  const { user, activeBusinessUnit, hasModule } = useAuth();
  // A link the route guard would refuse is a dead end, so each one is offered only when it opens.
  const canOpen = useCanOpen();
  const canBook = canOpen("/operaciones");
  const canSeeAlerts = canOpen("/herramientas");
  // The clinic's module is gated in place: it has no dashboard of its own.
  const showClinic =
    hasModule("veterinaria") &&
    (user?.role === "veterinary" ||
      (user?.role === "admin" && activeBusinessUnit === "VETERINARY"));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<Summary>("/dashboard/summary")
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <PageLoader />;
  if (!summary) {
    return (
      <InlineError onRetry={load}>
        No pudimos cargar el resumen de hoy. Revisa tu conexión e inténtalo de nuevo.
      </InlineError>
    );
  }

  const dashboardUnit =
    user?.role === "admin" ? activeBusinessUnit : normalizeBusinessUnit(user?.businessUnit);
  // "Dra. Paula Ríos" greets as "Dra. Paula", not as the title alone.
  const nameParts = (user?.name ?? user?.username ?? "").trim().split(/\s+/);
  const firstName = nameParts[0]?.endsWith(".") ? nameParts.slice(0, 2).join(" ") : nameParts[0];

  // The list is not bounded to today, so it is read by day rather than as one run of times.
  const days: Array<{ label: string; items: Summary["proximasReservas"] }> = [];
  for (const reserva of summary.proximasReservas) {
    const label = fmtDayLabel(reserva.checkIn);
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(reserva);
    else days.push({ label, items: [reserva] });
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title={firstName ? `¡Hola, ${firstName}!` : "¡Hola!"}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <UnitBadge unit={dashboardUnit} />
            <span className="first-letter:uppercase">
              {fmt(new Date(), "EEEE, d 'de' MMMM yyyy")}
            </span>
            <span>
              Hoy tienes {plural(summary.reservasHoy, "reserva", "reservas")},{" "}
              {plural(summary.activas, "activa", "activas")}.
            </span>
          </span>
        }
        actions={
          <>
            {canOpen("/informes") && (
              <Link to="/informes" className="btn-ghost no-underline">
                <BarChart3 size={16} aria-hidden="true" /> Informes
              </Link>
            )}
            {canOpen("/transacciones") && (
              <Link to="/transacciones" className="btn-ghost no-underline">
                <BriefcaseBusiness size={16} aria-hidden="true" /> Finanzas
              </Link>
            )}
            <Link to="/clientes" className="btn-secondary no-underline">
              <UserPlus size={16} aria-hidden="true" /> Nuevo cliente
            </Link>
            {canBook && (
              <Link to="/operaciones" className="btn-primary no-underline">
                <CalendarPlus size={16} aria-hidden="true" /> Nueva reserva
              </Link>
            )}
          </>
        }
      />

      <StatStrip>
        <Stat
          label="Reservas hoy"
          value={summary.reservasHoy}
          hint={plural(summary.activas, "activa", "activas")}
        />
        <Stat
          label="Entradas y salidas"
          value={
            <>
              {summary.entradas}
              <span className="mx-1.5 font-normal text-faint">/</span>
              {summary.salidas}
            </>
          }
          hint="Registradas hoy"
        />
        {summary.ingresosHoy !== null && (
          <Stat
            label="Ingresos del día"
            value={fmtCurrency(summary.ingresosHoy)}
            hint={`En el mes: ${fmtCurrency(summary.ingresosMes ?? 0)}`}
          />
        )}
        <Stat label="Clientes activos" value={summary.totalClientes} />
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Próximas reservas"
          action={
            canBook ? (
              <Link
                to="/operaciones"
                className="flex items-center gap-1 text-action hover:text-action-hover"
              >
                Ver todas <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ) : undefined
          }
        >
          {days.length === 0 ? (
            <EmptyState
              title="Todavía no hay reservas programadas."
              action={
                canBook ? (
                  <Link to="/operaciones" className="btn-secondary btn-sm no-underline">
                    Agendar la primera
                  </Link>
                ) : undefined
              }
            />
          ) : (
            days.map((day) => (
              <div key={day.label}>
                <p className="bg-sunken px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted sm:px-5">
                  {day.label}
                </p>
                <ul className="divide-y divide-line-subtle">
                  {day.items.map((r) => {
                    const st = STATUSES[r.estado] ?? {
                      label: r.estado,
                      color: "bg-sunken text-muted",
                    };
                    return (
                      <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <ServiceIcon servicio={r.servicio} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{r.cliente}</p>
                          <p className="truncate text-xs text-muted">
                            {r.mascotas} · {r.sala ?? r.servicio}
                          </p>
                        </div>
                        <Badge color={st.color}>{st.label}</Badge>
                        <p className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-ink">
                          {fmtTime(r.checkIn)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </SectionCard>

        <SectionCard
          title="Alertas activas"
          action={
            summary.alertas.length > 0 ? (
              <Badge tone="danger">{summary.alertas.length}</Badge>
            ) : undefined
          }
        >
          {summary.alertas.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Todo en orden: no hay alertas pendientes." />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {summary.alertas.map((a) => (
                <li key={a.id} className="px-4 py-3 sm:px-5">
                  <p className="text-sm font-medium text-ink">
                    {SEVERITY_ICON[a.severity]} {a.title}
                  </p>
                  {a.pet && <p className="mt-0.5 text-xs text-muted">Mascota: {a.pet}</p>}
                </li>
              ))}
            </ul>
          )}
          {canSeeAlerts && (
            <div className="border-t border-line-subtle px-4 py-3 sm:px-5">
              <Link
                to="/herramientas"
                className="flex items-center gap-1 text-sm text-action hover:text-action-hover"
              >
                Ver todas las alertas <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          )}
        </SectionCard>
      </div>

      {showClinic && <ClinicRemindersCard />}
    </div>
  );
}
