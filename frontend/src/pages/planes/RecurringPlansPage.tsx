import { useEffect, useState, useCallback } from "react";
import { Plus, Edit2, Trash2, RefreshCw, Search } from "lucide-react";
import { api } from "../../lib/api";
import { fmt, SERVICES } from "../../lib/utils";
import { PageLoader } from "../../components/ui/Spinner";
import { RecurringPlanForm } from "./RecurringPlanForm";
import { PageHeader } from "../../components/layout/PageHeader";

interface RecurringPlan {
  id: string;
  clientId: string;
  client: { id: string; firstName: string; lastName: string };
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  daysOfWeek: string;
  petIds: string;
  service: string;
  roomId?: string;
  room?: { id: string; name: string };
  notes?: string;
  isActive: boolean;
  reservations: Array<{ id: string; status: string }>;
}

export function RecurringPlansPage() {
  const [plans, setPlans] = useState<RecurringPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<RecurringPlan | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter === "active") params.set("status", "active");
      if (statusFilter === "inactive") params.set("status", "inactive");
      const data = await api.get<RecurringPlan[]>(`/recurring-plans?${params}`);
      setPlans(data);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function deletePlan(id: string) {
    if (!confirm("¿Eliminar este plan?")) return;
    try {
      await api.del(`/recurring-plans/${id}`);
      load();
    } catch (e) {
      alert("Error al eliminar: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  }

  const filtered = search
    ? plans.filter(
        p =>
          p.client.firstName.toLowerCase().includes(search.toLowerCase()) ||
          p.client.lastName.toLowerCase().includes(search.toLowerCase()) ||
          p.room?.name.toLowerCase().includes(search.toLowerCase())
      )
    : plans;

  const serviceLabel = (service: string) => {
    return SERVICES.find((item) => item.value === service)?.label ?? service;
  };

  const daysLabel = (days: string) => {
    const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    return days.split(",").map(d => dayNames[parseInt(d) - 1]).join(", ");
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
          title="Planes Recurrentes"
          subtitle={<>{plans.filter(p => p.isActive).length} planes activos de {plans.length}</>}
          actions={
            <button onClick={() => setShowNew(true)} className="btn-primary">
          <Plus size={16} /> Nuevo Plan
        </button>
          }
        />

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Buscar cliente o sala…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-40"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="">Todos</option>
        </select>
        <button onClick={load} className="btn-ghost">
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <PageLoader />
        ) : plans.length === 0 ? (
          <p className="text-center text-gray-400 py-16">Sin planes registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Cliente</th>
                  <th className="table-th">Servicio</th>
                  <th className="table-th">Sala</th>
                  <th className="table-th">Fecha Inicio</th>
                  <th className="table-th">Fecha Fin</th>
                  <th className="table-th">Días</th>
                  <th className="table-th">Reservas</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(plan => (
                  <tr key={plan.id} className="table-tr">
                    <td className="table-td">
                      <p className="font-medium">{plan.client.firstName} {plan.client.lastName}</p>
                    </td>
                    <td className="table-td text-sm">{serviceLabel(plan.service)}</td>
                    <td className="table-td text-sm">{plan.room?.name ?? "—"}</td>
                    <td className="table-td text-sm">{fmt(plan.startDate)}</td>
                    <td className="table-td text-sm">{fmt(plan.endDate)}</td>
                    <td className="table-td text-xs">
                      <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">
                        {daysLabel(plan.daysOfWeek)}
                      </span>
                    </td>
                    <td className="table-td text-sm">
                      <span className="font-medium">{plan.reservations.length}</span>
                    </td>
                    <td className="table-td">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          plan.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {plan.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditing(plan)}
                          className="btn-ghost btn-sm p-1.5"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </button>
                        {plan.isActive && (
                          <button
                            onClick={() => deletePlan(plan.id)}
                            className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RecurringPlanForm open={showNew} onClose={() => setShowNew(false)} onSaved={load} />

      <RecurringPlanForm
        open={!!editing}
        onClose={() => setEditing(null)}
        plan={editing}
        onSaved={load}
      />
    </div>
  );
}
