import { useEffect, useState, useCallback } from "react";
import { Plus, CheckCircle, AlertTriangle, PawPrint } from "lucide-react";
import { api } from "../../lib/api";
import { SEVERITY_COLOR } from "../../lib/utils";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { PageHeader } from "../../components/layout/PageHeader";

interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  isResolved: boolean;
  createdAt: string;
  pet?: { id: string; name: string; client: { firstName: string; lastName: string } };
}
interface Pet {
  id: string;
  name: string;
  client: { firstName: string; lastName: string };
}

const ALERT_TYPES = ["COMPORTAMIENTO", "SALUD", "ENTRENAMIENTO", "SOCIAL", "ALIMENTACION", "OTRO"];

// Alerts are the only surface of `cumplimiento`; the route is gated on it in the registry.
export function HerramientasPage() {
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="Alertas" subtitle="Avisos operativos y sanitarios por mascota" />
      <AlertasTab />
    </div>
  );
}

function AlertasTab() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [resolvedFilter, setResolvedFilter] = useState("false");
  const [form, setForm] = useState({
    petId: "",
    type: "SALUD",
    severity: "MEDIA" as "ALTA" | "MEDIA" | "BAJA",
    title: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (resolvedFilter) params.set("resolved", resolvedFilter);
    const [a, p] = await Promise.all([
      api.get<Alert[]>(`/alerts?${params}`),
      api.get<Pet[]>("/pets"),
    ]);
    setAlerts(a);
    setPets(p);
    setLoading(false);
  }, [resolvedFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id: string) {
    await api.patch(`/alerts/${id}/resolve`, {});
    load();
  }

  async function save() {
    setSaving(true);
    try {
      await api.post("/alerts", { ...form, petId: form.petId || undefined });
      setShowForm(false);
      setForm({ petId: "", type: "SALUD", severity: "MEDIA", title: "", description: "" });
      load();
    } finally {
      setSaving(false);
    }
  }

  const openCount = alerts.filter((a) => !a.isResolved).length;

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex gap-2 items-center">
          {openCount > 0 && (
            <span className="badge bg-danger-soft text-danger-ink">
              <AlertTriangle size={13} className="inline-block mr-1" />
              {openCount} activa{openCount > 1 ? "s" : ""}
            </span>
          )}
          <select
            className="input w-36"
            value={resolvedFilter}
            onChange={(e) => setResolvedFilter(e.target.value)}
          >
            <option value="false">Activas</option>
            <option value="true">Resueltas</option>
            <option value="">Todas</option>
          </select>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={16} /> Nueva Alerta
        </button>
      </div>

      {loading ? (
        <PageLoader />
      ) : alerts.length === 0 ? (
        <div className="card p-12 text-center text-muted">
          <CheckCircle size={40} className="mx-auto mb-2 text-success" />
          Sin alertas {resolvedFilter === "false" ? "activas" : ""}
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <div key={a.id} className={`card p-4 flex gap-4 ${a.isResolved ? "opacity-60" : ""}`}>
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${a.severity === "ALTA" ? "bg-danger-soft" : a.severity === "MEDIA" ? "bg-warning-soft" : "bg-success-soft"}`}
              >
                <AlertTriangle
                  size={18}
                  className={
                    a.severity === "ALTA"
                      ? "text-danger"
                      : a.severity === "MEDIA"
                        ? "text-warning-ink"
                        : "text-success"
                  }
                />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{a.title}</p>
                    {a.pet && (
                      <p className="text-xs text-muted">
                        <PawPrint size={13} className="inline-block mr-1" />
                        {a.pet.name} · {a.pet.client.firstName} {a.pet.client.lastName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge color={SEVERITY_COLOR[a.severity]}>{a.severity}</Badge>
                    <Badge color="bg-sunken text-muted">{a.type}</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted mt-1">{a.description}</p>
              </div>
              {!a.isResolved && (
                <button
                  onClick={() => resolve(a.id)}
                  className="btn-success btn-sm shrink-0 self-center"
                >
                  <CheckCircle size={14} /> Resolver
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Nueva Alerta / Aviso"
        size="md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? <Spinner size={14} /> : null} Guardar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Mascota (opcional)</label>
            <select
              className="input"
              value={form.petId}
              onChange={(e) => setForm((f) => ({ ...f, petId: e.target.value }))}
            >
              <option value="">Sin mascota específica</option>
              {pets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.client.firstName} {p.client.lastName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo</label>
              <select
                className="input"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {ALERT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Severidad</label>
              <select
                className="input"
                value={form.severity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, severity: e.target.value as "ALTA" | "MEDIA" | "BAJA" }))
                }
              >
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
                <option value="BAJA">Baja</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Título *</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Descripción *</label>
            <textarea
              className="input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
