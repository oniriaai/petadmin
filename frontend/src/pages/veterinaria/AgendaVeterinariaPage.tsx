import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Stethoscope } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { PageLoader } from "../../components/ui/Spinner";
import { cls, fmt, fmtTime } from "../../lib/utils";
import {
  TRIAGE,
  VISIT_STATUS,
  VISIT_TYPES,
  errorMessage,
  veterinariaApi,
  type ClinicRoom,
  type VetService,
  type VetStaff,
  type VisitStatus,
  type VisitSummary,
} from "./api";
import { NuevaConsultaModal } from "./NuevaConsultaModal";

/** The columns a visit moves through, left to right, and the action that advances it. */
const COLUMNS: Array<{ status: VisitStatus; title: string; next?: [VisitStatus, string] }> = [
  { status: "PROGRAMADA", title: "Programadas", next: ["EN_ESPERA", "Llegó"] },
  { status: "EN_ESPERA", title: "Sala de espera", next: ["EN_CONSULTA", "Atender"] },
  { status: "EN_CONSULTA", title: "En consulta" },
  { status: "CERRADA", title: "Cerradas" },
];

const TRIAGE_ORDER: Record<string, number> = { URGENCIA: 0, PRIORITARIA: 1, NORMAL: 2 };

function dayBounds(day: Date) {
  const from = new Date(day);
  from.setHours(0, 0, 0, 0);
  const to = new Date(day);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function AgendaVeterinariaPage() {
  const navigate = useNavigate();
  const [day, setDay] = useState(() => new Date());
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [services, setServices] = useState<VetService[]>([]);
  const [staff, setStaff] = useState<VetStaff[]>([]);
  const [rooms, setRooms] = useState<ClinicRoom[]>([]);
  const [veterinarianId, setVeterinarianId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Bounds computed in the browser, so "today" is the clinic's day and not the server's.
      setVisits(
        await veterinariaApi.visits({
          ...dayBounds(day),
          veterinarianId: veterinarianId || undefined,
        }),
      );
    } catch (e) {
      setError(errorMessage(e, "No se pudo cargar la agenda"));
    } finally {
      setLoading(false);
    }
  }, [day, veterinarianId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([veterinariaApi.services(), veterinariaApi.staff(), veterinariaApi.rooms()])
      .then(([loadedServices, loadedStaff, loadedRooms]) => {
        setServices(loadedServices);
        setStaff(loadedStaff);
        setRooms(loadedRooms);
      })
      .catch((e) => setError(errorMessage(e, "No se pudo cargar el catálogo de la clínica")));
  }, []);

  const byStatus = useMemo(() => {
    const groups = new Map<VisitStatus, VisitSummary[]>();
    for (const visit of visits) {
      groups.set(visit.status, [...(groups.get(visit.status) ?? []), visit]);
    }
    // The waiting room is seen by priority first, then by arrival.
    groups
      .get("EN_ESPERA")
      ?.sort((a, b) => (TRIAGE_ORDER[a.triage] ?? 2) - (TRIAGE_ORDER[b.triage] ?? 2));
    return groups;
  }, [visits]);

  const released = [...(byStatus.get("CANCELADA") ?? []), ...(byStatus.get("NO_ASISTIO") ?? [])];

  const advance = async (visit: VisitSummary, status: VisitStatus) => {
    try {
      await veterinariaApi.setStatus(visit.id, status);
      if (status === "EN_CONSULTA") {
        navigate(`/veterinaria/consultas/${visit.id}`);
        return;
      }
      await load();
    } catch (e) {
      setError(errorMessage(e, "No se pudo actualizar la consulta"));
    }
  };

  const shiftDay = (delta: number) => {
    const next = new Date(day);
    next.setDate(next.getDate() + delta);
    setDay(next);
  };

  const isToday = day.toDateString() === new Date().toDateString();

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Agenda Veterinaria"
        subtitle={`${visits.length - released.length} consulta(s) · ${fmt(day, "EEEE d 'de' MMMM")}`}
        actions={
          <>
            <button className="btn-secondary" onClick={load} aria-label="Actualizar agenda">
              <RefreshCw size={16} />
            </button>
            <button className="btn-primary" onClick={() => setShowNew(true)}>
              <Plus size={16} /> Nueva consulta
            </button>
          </>
        }
      />

      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            className="btn-secondary btn-sm"
            onClick={() => shiftDay(-1)}
            aria-label="Día anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            className="input w-auto"
            aria-label="Día de la agenda"
            value={fmt(day, "yyyy-MM-dd")}
            onChange={(e) => e.target.value && setDay(new Date(`${e.target.value}T12:00:00`))}
          />
          <button
            className="btn-secondary btn-sm"
            onClick={() => shiftDay(1)}
            aria-label="Día siguiente"
          >
            <ChevronRight size={16} />
          </button>
          {!isToday && (
            <button className="btn-ghost btn-sm" onClick={() => setDay(new Date())}>
              Hoy
            </button>
          )}
        </div>
        <select
          className="input w-auto"
          aria-label="Filtrar por veterinario"
          value={veterinarianId}
          onChange={(e) => setVeterinarianId(e.target.value)}
        >
          <option value="">Todos los veterinarios</option>
          {staff
            .filter((member) => !member.isExternal)
            .map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
        </select>
      </div>

      {loading ? (
        <PageLoader />
      ) : visits.length === 0 ? (
        <div className="card p-10 text-center">
          <Stethoscope size={28} className="mx-auto mb-2 text-faint" />
          <p className="text-sm text-muted">
            Este día todavía no tiene consultas. ¿Agendamos la primera?
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((column) => {
              const items = byStatus.get(column.status) ?? [];
              return (
                <section key={column.status} aria-label={column.title} className="space-y-2">
                  <h2 className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted px-1">
                    {column.title}
                    <span className="text-muted">{items.length}</span>
                  </h2>
                  {items.length === 0 && (
                    <p className="rounded-lg border border-dashed border-line-subtle px-3 py-6 text-center text-xs text-muted">
                      Nadie aquí
                    </p>
                  )}
                  {items.map((visit) => (
                    <VisitCard
                      key={visit.id}
                      visit={visit}
                      next={column.next}
                      onAdvance={advance}
                      onOpen={() => navigate(`/veterinaria/consultas/${visit.id}`)}
                    />
                  ))}
                </section>
              );
            })}
          </div>

          {released.length > 0 && (
            <div className="card p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">
                Canceladas y ausencias ({released.length})
              </h2>
              <ul className="divide-y divide-line-subtle">
                {released.map((visit) => (
                  <li key={visit.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted w-12">{fmtTime(visit.reservation.checkIn)}</span>
                    <span className="font-medium text-ink">{visit.pet.name}</span>
                    <span className="text-muted">
                      {visit.client.firstName} {visit.client.lastName}
                    </span>
                    <Badge color={VISIT_STATUS[visit.status].color}>
                      {VISIT_STATUS[visit.status].label}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <NuevaConsultaModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => {
          setShowNew(false);
          load();
        }}
        services={services}
        staff={staff}
        rooms={rooms}
        day={fmt(day, "yyyy-MM-dd")}
      />
    </div>
  );
}

function VisitCard({
  visit,
  next,
  onAdvance,
  onOpen,
}: {
  visit: VisitSummary;
  next?: [VisitStatus, string];
  onAdvance: (visit: VisitSummary, status: VisitStatus) => void;
  onOpen: () => void;
}) {
  const triage = TRIAGE[visit.triage];
  return (
    <article
      className={cls(
        "card p-3 space-y-2",
        visit.triage === "URGENCIA" && "border-danger-line",
        visit.triage === "PRIORITARIA" && "border-warning-line",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink truncate">{visit.pet.name}</p>
          <p className="text-xs text-muted truncate">
            {visit.client.firstName} {visit.client.lastName}
          </p>
        </div>
        <span className="text-sm font-semibold text-muted tabular-nums">
          {fmtTime(visit.reservation.checkIn)}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge>{VISIT_TYPES[visit.type] ?? visit.type}</Badge>
        {visit.triage !== "NORMAL" && triage && <Badge color={triage.color}>{triage.label}</Badge>}
      </div>
      {visit.reason && <p className="text-xs text-muted line-clamp-2">{visit.reason}</p>}
      <p className="text-xs text-muted">
        {visit.veterinarian?.name ?? "Sin veterinario"}
        {visit.reservation.room ? ` · ${visit.reservation.room.name}` : ""}
      </p>
      <div className="flex gap-2 pt-1">
        <button className="btn-secondary btn-sm flex-1" onClick={onOpen}>
          Abrir
        </button>
        {next && (
          <button className="btn-primary btn-sm flex-1" onClick={() => onAdvance(visit, next[0])}>
            {next[1]}
          </button>
        )}
      </div>
    </article>
  );
}
