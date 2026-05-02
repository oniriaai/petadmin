import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Users, DollarSign, AlertTriangle, TrendingUp, ArrowRight, Clock } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { fmtCurrency, fmt, fmtTime, STATUSES } from "../lib/utils";
import { Badge } from "../components/ui/Badge";
import { PageLoader } from "../components/ui/Spinner";

interface Summary {
  reservasHoy: number;
  activas: number;
  entradas: number;
  salidas: number;
  ingresosHoy: number;
  ingresosMes: number;
  totalClientes: number;
  alertas: Array<{ id: string; severity: string; title: string; pet?: string }>;
  proximasReservas: Array<{ id: string; cliente: string; mascotas: string; servicio: string; estado: string; checkIn: string; sala?: string }>;
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const SEVERITY_ICON: Record<string, string> = { ALTA: "🔴", MEDIA: "🟡", BAJA: "🟢" };

export function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Summary>("/dashboard/summary")
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;
  if (!summary) return <p className="text-red-600 p-6">Error cargando dashboard</p>;

  const isKinderdog = user?.businessUnit === "KINDERDOG";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="page-title">
          {isKinderdog ? "🐶 Kinderdog" : "✂️ Pethijos"} — Dashboard
        </h1>
        <p className="text-gray-500 text-sm mt-1">{fmt(new Date(), "EEEE, d 'de' MMMM yyyy")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Reservas hoy" value={summary.reservasHoy} sub={`${summary.activas} activas`} icon={CalendarDays} color="bg-blue-500" />
        <StatCard label="Entradas / Salidas" value={`${summary.entradas} / ${summary.salidas}`} icon={Clock} color="bg-green-500" />
        <StatCard label="Ingresos del día" value={fmtCurrency(summary.ingresosHoy)} sub={`Mes: ${fmtCurrency(summary.ingresosMes)}`} icon={DollarSign} color="bg-emerald-500" />
        <StatCard label="Clientes activos" value={summary.totalClientes} icon={Users} color="bg-purple-500" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Próximas reservas de hoy</h2>
            <Link to="/operaciones" className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Ver todas <ArrowRight size={14} />
            </Link>
          </div>
          {summary.proximasReservas.length === 0 ? (
            <p className="text-center text-gray-400 py-10">Sin reservas programadas para hoy</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {summary.proximasReservas.map(r => {
                const st = STATUSES[r.estado] ?? { label: r.estado, color: "bg-gray-100 text-gray-700" };
                return (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-lg shrink-0">
                      {r.servicio === "GUARDERIA" ? "🐶" : r.servicio.startsWith("PELUQUERIA") ? "✂️" : "🚗"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{r.cliente}</p>
                      <p className="text-xs text-gray-500 truncate">{r.mascotas} · {r.sala ?? r.servicio}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-gray-700">{fmtTime(r.checkIn)}</p>
                      <Badge color={st.color}>{st.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <AlertTriangle size={16} className="text-yellow-500" /> Alertas activas
            </h2>
            <span className="badge bg-red-100 text-red-700">{summary.alertas.length}</span>
          </div>
          {summary.alertas.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">Sin alertas pendientes ✅</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {summary.alertas.map(a => (
                <div key={a.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-gray-800">
                    {SEVERITY_ICON[a.severity]} {a.title}
                  </p>
                  {a.pet && <p className="text-xs text-gray-500 mt-0.5">Mascota: {a.pet}</p>}
                </div>
              ))}
            </div>
          )}
          <div className="px-5 py-3 border-t border-gray-100">
            <Link to="/herramientas" className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Ver todas las alertas <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { to: "/operaciones", label: "Nueva Reserva", emoji: "📅", bg: "bg-blue-50 hover:bg-blue-100" },
          { to: "/clientes", label: "Nuevo Cliente", emoji: "👤", bg: "bg-purple-50 hover:bg-purple-100" },
          { to: "/informes", label: "Ver Informes", emoji: "📊", bg: "bg-green-50 hover:bg-green-100" },
          { to: "/transacciones", label: "Gestión Financiera", emoji: "💼", bg: "bg-amber-50 hover:bg-amber-100" },
        ].map(({ to, label, emoji, bg }) => (
          <Link key={to} to={to} className={`card p-4 ${bg} flex items-center gap-3 transition-colors cursor-pointer no-underline`}>
            <span className="text-2xl">{emoji}</span>
            <span className="font-medium text-gray-800 text-sm">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
