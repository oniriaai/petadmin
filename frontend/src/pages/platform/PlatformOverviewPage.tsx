import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, Package, Users } from "lucide-react";
import { platformApi, type AuditEntry, type DaycareSummary, type PlatformOverview } from "../../lib/platform-api";
import { PlatformPage, StatCard, auditLine, useAsync } from "./shared";
import { businessUnitLabel } from "../../modules/shared/contracts";

export function PlatformOverviewPage() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [daycares, setDaycares] = useState<DaycareSummary[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const { run, isLoading, error } = useAsync();

  useEffect(() => {
    void run(async () => {
      const [o, d, a] = await Promise.all([
        platformApi.overview(),
        platformApi.listDaycares(),
        platformApi.audit(8),
      ]);
      setOverview(o);
      setDaycares(d);
      setAudit(a);
    });
  }, [run]);

  return (
    <PlatformPage
      title="Resumen"
      subtitle="Estado general de las guarderías y sus módulos"
      isLoading={isLoading}
      error={error}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Guarderías" value={overview?.daycareCount ?? 0} />
        <StatCard icon={CheckCircle2} label="Activas" value={overview?.activeDaycareCount ?? 0} />
        <StatCard icon={Users} label="Usuarios activos" value={overview?.activeUserCount ?? 0} hint={`de ${overview?.userCount ?? 0}`} />
        <StatCard icon={Package} label="Módulos habilitados" value={overview?.enabledModuleCount ?? 0} />
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-muted)" }}>
          Guarderías
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {daycares.map((daycare) => (
            <Link
              key={daycare.id}
              to={`/platform/daycares/${daycare.id}`}
              className="card p-4 hover:border-indigo-500 transition-colors block"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{daycare.name}</p>
                  <p className="text-xs font-mono truncate" style={{ color: "var(--color-muted)" }}>
                    {daycare.slug}
                  </p>
                </div>
                <span className={`badge ${daycare.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                  {daycare.isActive ? "Activa" : "Inactiva"}
                </span>
              </div>
              <div className="mt-3 flex gap-4 text-xs" style={{ color: "var(--color-muted)" }}>
                <span>{daycare.userCount} usuario(s)</span>
                <span>{daycare.enabledModuleCount} módulo(s)</span>
                <span>{daycare.unitList.map(businessUnitLabel).join(" · ")}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-muted)" }}>
          Actividad reciente
        </h2>
        <div className="card divide-y" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
          {audit.length === 0 && (
            <p className="p-4 text-sm" style={{ color: "var(--color-muted)" }}>
              Todavía no hay actividad registrada.
            </p>
          )}
          {audit.map((entry) => (
            <div key={entry.id} className="p-3 text-sm flex items-baseline gap-3" style={{ borderColor: "var(--color-border)" }}>
              <span className="text-xs shrink-0 font-mono" style={{ color: "var(--color-muted)" }}>
                {new Date(entry.createdAt).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" })}
              </span>
              <span className="min-w-0">{auditLine(entry)}</span>
            </div>
          ))}
        </div>
      </section>
    </PlatformPage>
  );
}
