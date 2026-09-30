import { useEffect, useState, useCallback } from "react";
import { Plus, CheckCircle, AlertTriangle, Bell, BarChart3, FileText, PawPrint } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { ContratosTab } from "./ContratosTab";
import { SEVERITY_COLOR } from "../../lib/utils";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { PageHeader } from "../../components/layout/PageHeader";

type Tab = "alertas" | "contratos" | "estimador";
interface Alert { id: string; type: string; severity: string; title: string; description: string; isResolved: boolean; createdAt: string; pet?: { id: string; name: string; client: { firstName: string; lastName: string } } }
interface Pet { id: string; name: string; client: { firstName: string; lastName: string } }

const ALERT_TYPES = ["COMPORTAMIENTO", "SALUD", "ENTRENAMIENTO", "SOCIAL", "ALIMENTACION", "OTRO"];

export function HerramientasPage() {
  // `cumplimiento` has no page of its own -- the alerts tab is its only daycare-facing surface,
  // so entitlement is checked here rather than on the route. The estimator is a local
  // calculator with no API behind it and is always available, which is why this page is not
  // gated as a whole.
  const { hasModule, fullAccess } = useAuth();
  // `cumplimiento` grants both alerts and contracts; neither has a route of its own.
  const canSeeCumplimiento = fullAccess || hasModule("cumplimiento");
  const [tab, setTab] = useState<Tab>(canSeeCumplimiento ? "alertas" : "estimador");

  // If the module is turned off mid-session the open tab has to give way, otherwise the page
  // keeps rendering a tab whose requests now 403.
  useEffect(() => {
    if (!canSeeCumplimiento && (tab === "alertas" || tab === "contratos")) setTab("estimador");
  }, [canSeeCumplimiento, tab]);

  const tabs = ([
    ...(canSeeCumplimiento
      ? ([["alertas", "Alertas y Avisos", Bell], ["contratos", "Contratos", FileText]] as const)
      : []),
    ["estimador", "Estimaciones", BarChart3] as const,
  ]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="Herramientas" subtitle={<>{canSeeCumplimiento ? "Alertas, contratos y estimaciones" : "Estimaciones"}</>} />
      {tabs.length > 1 && (
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {tabs.map(([t, label, Icon]) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon size={15} className="inline-block mr-1.5" />{label}
            </button>
          ))}
        </div>
      )}
      {tab === "alertas" && canSeeCumplimiento && <AlertasTab />}
      {tab === "contratos" && canSeeCumplimiento && <ContratosTab />}
      {tab === "estimador" && <EstimadorTab />}
    </div>
  );
}

function AlertasTab() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [resolvedFilter, setResolvedFilter] = useState("false");
  const [form, setForm] = useState({ petId: "", type: "SALUD", severity: "MEDIA" as "ALTA" | "MEDIA" | "BAJA", title: "", description: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (resolvedFilter) params.set("resolved", resolvedFilter);
    const [a, p] = await Promise.all([api.get<Alert[]>(`/alerts?${params}`), api.get<Pet[]>("/pets")]);
    setAlerts(a); setPets(p);
    setLoading(false);
  }, [resolvedFilter]);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: string) {
    await api.patch(`/alerts/${id}/resolve`, {});
    load();
  }

  async function save() {
    setSaving(true);
    try {
      await api.post("/alerts", { ...form, petId: form.petId || undefined });
      setShowForm(false); setForm({ petId: "", type: "SALUD", severity: "MEDIA", title: "", description: "" });
      load();
    } finally { setSaving(false); }
  }

  const openCount = alerts.filter(a => !a.isResolved).length;

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex gap-2 items-center">
          {openCount > 0 && <span className="badge bg-red-100 text-red-700"><AlertTriangle size={13} className="inline-block mr-1" />{openCount} activa{openCount > 1 ? "s" : ""}</span>}
          <select className="input w-36" value={resolvedFilter} onChange={e => setResolvedFilter(e.target.value)}>
            <option value="false">Activas</option>
            <option value="true">Resueltas</option>
            <option value="">Todas</option>
          </select>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus size={16} /> Nueva Alerta</button>
      </div>

      {loading ? <PageLoader /> : alerts.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <CheckCircle size={40} className="mx-auto mb-2 text-green-400" />
          Sin alertas {resolvedFilter === "false" ? "activas" : ""}
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(a => (
            <div key={a.id} className={`card p-4 flex gap-4 ${a.isResolved ? "opacity-60" : ""}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${a.severity === "ALTA" ? "bg-red-100" : a.severity === "MEDIA" ? "bg-yellow-100" : "bg-green-100"}`}>
                <AlertTriangle size={18} className={a.severity === "ALTA" ? "text-red-600" : a.severity === "MEDIA" ? "text-yellow-600" : "text-green-600"} />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{a.title}</p>
                    {a.pet && <p className="text-xs text-gray-500"><PawPrint size={13} className="inline-block mr-1" />{a.pet.name} — {a.pet.client.firstName} {a.pet.client.lastName}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge color={SEVERITY_COLOR[a.severity]}>{a.severity}</Badge>
                    <Badge color="bg-gray-100 text-gray-600">{a.type}</Badge>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-1">{a.description}</p>
              </div>
              {!a.isResolved && (
                <button onClick={() => resolve(a.id)} className="btn-success btn-sm shrink-0 self-center">
                  <CheckCircle size={14} /> Resolver
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nueva Alerta / Aviso" size="md"
        footer={<>
          <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null} Guardar</button>
        </>}>
        <div className="space-y-4">
          <div>
            <label className="label">Mascota (opcional)</label>
            <select className="input" value={form.petId} onChange={e => setForm(f => ({ ...f, petId: e.target.value }))}>
              <option value="">— Sin mascota específica —</option>
              {pets.map(p => <option key={p.id} value={p.id}>{p.name} — {p.client.firstName} {p.client.lastName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {ALERT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Severidad</label>
              <select className="input" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as "ALTA" | "MEDIA" | "BAJA" }))}>
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
                <option value="BAJA">Baja</option>
              </select>
            </div>
          </div>
          <div><label className="label">Título *</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><label className="label">Descripción *</label><textarea className="input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        </div>
      </Modal>
    </>
  );
}

function EstimadorTab() {
  const [planes, setPlanes] = useState({ dias2: 10, dias3: 15, dias4: 15, dias5: 6, precioDia: 12 });
  const [ventas, setVentas] = useState({ reservasMes: 30, ticketPromedio: 35, serviciosExtra: 5, precioExtra: 20 });

  const totalPlanesIngresos = (planes.dias2 * 2 + planes.dias3 * 3 + planes.dias4 * 4 + planes.dias5 * 5) * planes.precioDia;
  const totalVentasIngresos = ventas.reservasMes * ventas.ticketPromedio + ventas.serviciosExtra * ventas.precioExtra;

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">Estimación Planes Mensuales</h2>
        <div className="space-y-3">
          {[
            { key: "dias2" as const, label: "Clientes 2 días/semana" },
            { key: "dias3" as const, label: "Clientes 3 días/semana" },
            { key: "dias4" as const, label: "Clientes 4 días/semana" },
            { key: "dias5" as const, label: "Clientes 5 días/semana" },
            { key: "precioDia" as const, label: "Precio por día ($)" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <label className="text-sm text-gray-700">{label}</label>
              <input className="input w-24 text-right" type="number" min="0" value={planes[key]} onChange={e => setPlanes(p => ({ ...p, [key]: +e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="border-t pt-4">
          <div className="bg-indigo-50 rounded-xl p-4 text-center">
            <p className="text-sm text-indigo-600 font-medium">Estimación de ingreso mensual</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">${totalPlanesIngresos.toLocaleString()}</p>
            <p className="text-xs text-indigo-500 mt-1">{planes.dias2 + planes.dias3 + planes.dias4 + planes.dias5} clientes totales</p>
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">Estimación de Ventas</h2>
        <div className="space-y-3">
          {[
            { key: "reservasMes" as const, label: "Reservas por mes" },
            { key: "ticketPromedio" as const, label: "Ticket promedio ($)" },
            { key: "serviciosExtra" as const, label: "Servicios adicionales" },
            { key: "precioExtra" as const, label: "Precio servicio adicional ($)" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <label className="text-sm text-gray-700">{label}</label>
              <input className="input w-24 text-right" type="number" min="0" value={ventas[key]} onChange={e => setVentas(p => ({ ...p, [key]: +e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="border-t pt-4">
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <p className="text-sm text-green-600 font-medium">Estimación de ventas mensuales</p>
            <p className="text-3xl font-bold text-green-700 mt-1">${totalVentasIngresos.toLocaleString()}</p>
            <p className="text-xs text-green-500 mt-1">{ventas.reservasMes} reservas + {ventas.serviciosExtra} extras</p>
          </div>
        </div>
      </div>
    </div>
  );
}
