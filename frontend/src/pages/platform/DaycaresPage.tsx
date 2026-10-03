import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { platformApi, type DaycareSummary, type ModuleCatalog } from "../../lib/platform-api";
import { PlatformPage, useAsync } from "./shared";
import { NewDaycareModal } from "./NewDaycareModal";
import { businessUnitLabel } from "../../modules/shared/contracts";

export function DaycaresPage() {
  const [daycares, setDaycares] = useState<DaycareSummary[]>([]);
  const [catalog, setCatalog] = useState<ModuleCatalog | null>(null);
  const [showNew, setShowNew] = useState(false);
  const { run, isLoading, error } = useAsync();

  const load = useCallback(async () => {
    const [list, cat] = await Promise.all([platformApi.listDaycares(), platformApi.catalog()]);
    setDaycares(list);
    setCatalog(cat);
  }, []);

  useEffect(() => {
    void run(load);
  }, [run, load]);

  return (
    <PlatformPage
      title="Guarderías"
      subtitle="Alta de clientes y acceso a su configuración"
      isLoading={isLoading}
      error={error}
      actions={
        <button className="btn btn-primary" onClick={() => setShowNew(true)} disabled={!catalog}>
          <Plus size={16} /> Nueva guardería
        </button>
      }
    >
      <div
        className="card overflow-hidden"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th
                  className="table-th"
                  style={{ background: "transparent", color: "var(--color-muted)" }}
                >
                  Nombre
                </th>
                <th
                  className="table-th"
                  style={{ background: "transparent", color: "var(--color-muted)" }}
                >
                  Identificador
                </th>
                <th
                  className="table-th"
                  style={{ background: "transparent", color: "var(--color-muted)" }}
                >
                  Unidades
                </th>
                <th
                  className="table-th"
                  style={{ background: "transparent", color: "var(--color-muted)" }}
                >
                  Usuarios
                </th>
                <th
                  className="table-th"
                  style={{ background: "transparent", color: "var(--color-muted)" }}
                >
                  Módulos
                </th>
                <th
                  className="table-th"
                  style={{ background: "transparent", color: "var(--color-muted)" }}
                >
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {daycares.map((daycare) => (
                <tr
                  key={daycare.id}
                  className="border-t hover:bg-white/5 transition-colors"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <td className="table-td" style={{ color: "var(--color-ink)" }}>
                    <Link
                      to={`/platform/daycares/${daycare.id}`}
                      className="font-medium hover:underline"
                    >
                      {daycare.name}
                    </Link>
                  </td>
                  <td
                    className="table-td font-mono text-xs"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {daycare.slug}
                  </td>
                  <td className="table-td" style={{ color: "var(--color-muted)" }}>
                    {daycare.unitList.map(businessUnitLabel).join(" · ")}
                  </td>
                  <td className="table-td" style={{ color: "var(--color-muted)" }}>
                    {daycare.userCount}
                  </td>
                  <td className="table-td" style={{ color: "var(--color-muted)" }}>
                    {daycare.enabledModuleCount}
                  </td>
                  <td className="table-td">
                    <span
                      className={`badge ${daycare.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}
                    >
                      {daycare.isActive ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                </tr>
              ))}
              {daycares.length === 0 && (
                <tr>
                  <td
                    className="table-td text-center py-8"
                    colSpan={6}
                    style={{ color: "var(--color-muted)" }}
                  >
                    Todavía no hay guarderías registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && catalog && (
        <NewDaycareModal
          catalog={catalog}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            void run(load);
          }}
        />
      )}
    </PlatformPage>
  );
}
