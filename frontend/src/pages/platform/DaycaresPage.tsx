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
      <div className="card overflow-hidden bg-surface border-line">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th bg-transparent text-muted">Nombre</th>
                <th className="table-th bg-transparent text-muted">Identificador</th>
                <th className="table-th bg-transparent text-muted">Unidades</th>
                <th className="table-th bg-transparent text-muted">Usuarios</th>
                <th className="table-th bg-transparent text-muted">Módulos</th>
                <th className="table-th bg-transparent text-muted">Estado</th>
              </tr>
            </thead>
            <tbody>
              {daycares.map((daycare) => (
                <tr
                  key={daycare.id}
                  className="border-t hover:bg-white/5 transition-colors border-line"
                >
                  <td className="table-td text-ink">
                    <Link
                      to={`/platform/daycares/${daycare.id}`}
                      className="font-medium hover:underline"
                    >
                      {daycare.name}
                    </Link>
                  </td>
                  <td className="table-td font-mono text-xs text-muted">{daycare.slug}</td>
                  <td className="table-td text-muted">
                    {daycare.unitList.map(businessUnitLabel).join(" · ")}
                  </td>
                  <td className="table-td text-muted">{daycare.userCount}</td>
                  <td className="table-td text-muted">{daycare.enabledModuleCount}</td>
                  <td className="table-td">
                    <span
                      className={`badge ${daycare.isActive ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
                    >
                      {daycare.isActive ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                </tr>
              ))}
              {daycares.length === 0 && (
                <tr>
                  <td className="table-td text-center py-8 text-muted" colSpan={6}>
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
