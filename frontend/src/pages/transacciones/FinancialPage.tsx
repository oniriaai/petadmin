import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  TrendingUp,
  TrendingDown,
  Building2,
  LayoutDashboard,
} from "lucide-react";
import { api } from "../../lib/api";
import { PageLoader } from "../../components/ui/Spinner";
import { useAuth } from "../../lib/auth-context";
import { ProviderForm } from "./ProviderForm";
import { FinancialDashboard } from "./FinancialDashboard";
import { IncomesTab } from "./IncomesTab";
import { EgresosTab } from "./EgresosTab";
import { PeriodFilter } from "./PeriodFilter";
import { presetPeriod } from "./finance";
import { Badge } from "../../components/ui/Badge";
import { PageHeader } from "../../components/layout/PageHeader";
import { Tabs } from "../../components/ui/Tabs";
import { EmptyState } from "../../components/ui/EmptyState";

interface Provider {
  id: string;
  name: string;
  idNumber?: string;
  email?: string;
  phone?: string;
  address?: string;
  product?: string;
  city?: string;
  province?: string;
  bannerId?: string;
  isActive: boolean;
}

type TabId = "dashboard" | "income" | "egresos" | "providers";

const SUBTITLE: Record<TabId, string> = {
  dashboard: "Resumen y analítica",
  income: "Ingresos y recaudación",
  egresos: "Gastos, compras y pagos",
  providers: "Directorio de proveedores",
};

export function FinancialPage() {
  // Reading is what opens the page (see the registry). Without the write permission it is a
  // ledger to consult: the server refuses every change, so none is offered.
  const { can, hasModule } = useAuth();
  const canWrite = can("finanzas.write");
  // The summary and the Excel files are served by `informes`, which a daycare may not have.
  const hasReports = hasModule("informes");
  const canExport = hasReports && can("datos.export");
  const [activeTab, setActiveTab] = useState<TabId>(hasReports ? "dashboard" : "income");
  // One period for the whole page, so the ledger opens on what the summary was showing.
  const [period, setPeriod] = useState(() => presetPeriod("month"));

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Gestión Financiera"
        subtitle={SUBTITLE[activeTab]}
        actions={activeTab !== "providers" && <PeriodFilter value={period} onChange={setPeriod} />}
      />

      <Tabs
        label="Gestión Financiera"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          ...(hasReports
            ? [{ id: "dashboard" as const, label: "Resumen", icon: LayoutDashboard }]
            : []),
          { id: "income", label: "Ingresos", icon: TrendingUp },
          { id: "egresos", label: "Egresos", icon: TrendingDown },
          { id: "providers", label: "Proveedores", icon: Building2 },
        ]}
      />

      {activeTab === "dashboard" && <FinancialDashboard period={period} />}
      {activeTab === "income" && (
        <IncomesTab period={period} canWrite={canWrite} canExport={canExport} />
      )}
      {activeTab === "egresos" && (
        <EgresosTab period={period} canWrite={canWrite} canExport={canExport} />
      )}
      {activeTab === "providers" && <ProvidersTab canWrite={canWrite} />}
    </div>
  );
}

function ProvidersTab({ canWrite }: { canWrite: boolean }) {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  // `undefined` is closed, `null` is a new provider.
  const [editing, setEditing] = useState<Provider | null | undefined>(undefined);

  const load = useCallback(() => {
    api
      .get<Provider[]>("/providers")
      .then(setProviders)
      .catch((e) => console.error("Error loading providers:", e));
  }, []);
  useEffect(load, [load]);

  if (!providers) return <PageLoader />;
  return (
    <div className="space-y-5">
      {canWrite && (
        <div className="flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setEditing(null)}>
            <Plus size={16} aria-hidden="true" /> Nuevo proveedor
          </button>
        </div>
      )}
      <ProvidersTable providers={providers} onEdit={setEditing} load={load} canWrite={canWrite} />
      <ProviderForm
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        provider={editing}
        onSaved={load}
      />
    </div>
  );
}

function ProvidersTable({ providers, onEdit, load, canWrite }: any) {
  async function deactivate(id: string) {
    if (!confirm("¿Desactivamos este proveedor? Podrás volver a activarlo después.")) return;
    await api.del(`/providers/${id}`);
    load();
  }

  return (
    <div className="bg-surface border border-line-subtle rounded-lg overflow-hidden">
      {providers.length === 0 ? (
        <EmptyState title="Todavía no hay proveedores. Agrega el primero para asociarlo a tus egresos." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-sunken border-b">
              <tr>
                <th className="table-th">Nombre</th>
                <th className="table-th">Producto</th>
                <th className="table-th">Contacto</th>
                <th className="table-th">Localidad</th>
                <th className="table-th">Estado</th>
                <th className="table-th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p: any) => (
                <tr key={p.id} className="table-tr">
                  <td className="table-td">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-[10px] text-muted">{p.idNumber ?? "—"}</p>
                  </td>
                  <td className="table-td text-xs">{p.product ?? "—"}</td>
                  <td className="table-td text-xs">
                    {p.phone && <p>{p.phone}</p>}
                    {p.email && <p className="text-muted truncate max-w-32">{p.email}</p>}
                  </td>
                  <td className="table-td text-xs">
                    {[p.city, p.province].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="table-td">
                    <Badge
                      color={
                        p.isActive ? "bg-success-soft text-success-ink" : "bg-sunken text-muted"
                      }
                    >
                      {p.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="table-td text-right">
                    {canWrite && (
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => onEdit(p)}
                          className="p-1.5 hover:bg-sunken rounded-sm transition text-muted"
                          aria-label="Editar proveedor"
                          title="Editar"
                        >
                          <Edit2 size={15} aria-hidden="true" />
                        </button>
                        {p.isActive && (
                          <button
                            onClick={() => deactivate(p.id)}
                            className="p-1.5 hover:bg-danger-soft text-danger rounded-sm transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
