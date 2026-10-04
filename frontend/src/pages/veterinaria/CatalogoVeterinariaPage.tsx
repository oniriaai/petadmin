import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { fmtCurrency } from "../../lib/utils";
import {
  SERVICE_CATEGORIES,
  errorMessage,
  veterinariaApi,
  type VetService,
  type VetStaff,
} from "./api";
import { Tabs } from "../../components/ui/Tabs";

type Tab = "services" | "staff";

/** Prices and who attends: the clinic's catalogue, editable by an administrator only. */
export function CatalogoVeterinariaPage() {
  const [tab, setTab] = useState<Tab>("services");
  const [services, setServices] = useState<VetService[]>([]);
  const [staff, setStaff] = useState<VetStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingService, setEditingService] = useState<VetService | "new" | null>(null);
  const [editingStaff, setEditingStaff] = useState<VetStaff | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const [loadedServices, loadedStaff] = await Promise.all([
        veterinariaApi.services(),
        veterinariaApi.staff(),
      ]);
      setServices(loadedServices);
      setStaff(loadedStaff);
      setError("");
    } catch (e) {
      setError(errorMessage(e, "No se pudo cargar el catálogo"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (action: () => Promise<unknown>, question: string) => {
    if (!window.confirm(question)) return;
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e, "No se pudo dar de baja"));
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Catálogo de la clínica"
        subtitle="Servicios con su precio y el personal veterinario"
        actions={
          <button
            className="btn-primary"
            onClick={() => (tab === "services" ? setEditingService("new") : setEditingStaff("new"))}
          >
            <Plus size={16} /> {tab === "services" ? "Nuevo servicio" : "Nuevo veterinario"}
          </button>
        }
      />

      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}

      <Tabs
        label="Secciones del catálogo"
        value={tab}
        onChange={setTab}
        items={[
          { id: "services", label: "Servicios", count: services.length },
          { id: "staff", label: "Veterinarios", count: staff.length },
        ]}
      />

      {loading ? (
        <PageLoader />
      ) : tab === "services" ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Servicio</th>
                  <th className="table-th">Categoría</th>
                  <th className="table-th">Duración</th>
                  <th className="table-th">Precio</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {services.length === 0 && (
                  <tr className="table-tr">
                    <td className="table-td text-muted" colSpan={5}>
                      Todavía no hay servicios. Sin catálogo, cada cargo se escribe a mano.
                    </td>
                  </tr>
                )}
                {services.map((service) => (
                  <tr key={service.id} className="table-tr">
                    <td className="table-td font-medium text-ink">{service.name}</td>
                    <td className="table-td">
                      {SERVICE_CATEGORIES[service.category] ?? service.category}
                    </td>
                    <td className="table-td tabular-nums">{service.durationMinutes} min</td>
                    <td className="table-td tabular-nums">{fmtCurrency(service.basePrice)}</td>
                    <td className="table-td text-right whitespace-nowrap">
                      <button
                        className="text-muted hover:text-ink p-1"
                        aria-label={`Editar ${service.name}`}
                        onClick={() => setEditingService(service)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="text-muted hover:text-danger p-1"
                        aria-label={`Dar de baja ${service.name}`}
                        onClick={() =>
                          remove(
                            () => veterinariaApi.removeService(service.id),
                            `¿Dar de baja "${service.name}"? Las consultas que ya lo cobraron no cambian.`,
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Veterinario</th>
                  <th className="table-th">Matrícula</th>
                  <th className="table-th">Especialidad</th>
                  <th className="table-th">Contacto</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {staff.length === 0 && (
                  <tr className="table-tr">
                    <td className="table-td text-muted" colSpan={5}>
                      Todavía no hay veterinarios registrados.
                    </td>
                  </tr>
                )}
                {staff.map((member) => (
                  <tr key={member.id} className="table-tr">
                    <td className="table-td">
                      <span className="font-medium text-ink">{member.name}</span>{" "}
                      {member.isExternal && <Badge>Externo</Badge>}
                      {member.user && (
                        <span className="block text-xs text-muted">
                          Usuario: {member.user.username}
                        </span>
                      )}
                    </td>
                    <td className="table-td">{member.licenseNumber || "—"}</td>
                    <td className="table-td">{member.specialty || member.clinic || "—"}</td>
                    <td className="table-td">{member.phone || member.email || "—"}</td>
                    <td className="table-td text-right whitespace-nowrap">
                      <button
                        className="text-muted hover:text-ink p-1"
                        aria-label={`Editar ${member.name}`}
                        onClick={() => setEditingStaff(member)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="text-muted hover:text-danger p-1"
                        aria-label={`Dar de baja ${member.name}`}
                        onClick={() =>
                          remove(
                            () => veterinariaApi.removeStaff(member.id),
                            `¿Dar de baja a ${member.name}? Sus consultas anteriores se conservan.`,
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ServiceModal
        editing={editingService}
        onClose={() => setEditingService(null)}
        onSaved={() => {
          setEditingService(null);
          load();
        }}
      />
      <StaffModal
        editing={editingStaff}
        onClose={() => setEditingStaff(null)}
        onSaved={() => {
          setEditingStaff(null);
          load();
        }}
      />
    </div>
  );
}

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="notice notice-danger" role="alert">
      {message}
    </div>
  );
}

function ServiceModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: VetService | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("CONSULTA");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [basePrice, setBasePrice] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) return;
    const service = editing === "new" ? null : editing;
    setName(service?.name ?? "");
    setCategory(service?.category ?? "CONSULTA");
    setDurationMinutes(String(service?.durationMinutes ?? 30));
    setBasePrice(String(service?.basePrice ?? 0));
    setError("");
  }, [editing]);

  const submit = async () => {
    if (!name.trim()) {
      setError("El servicio necesita un nombre.");
      return;
    }
    setSaving(true);
    setError("");
    const body = {
      name: name.trim(),
      category,
      durationMinutes: Number(durationMinutes) || 30,
      basePrice: Number(basePrice) || 0,
    };
    try {
      if (editing && editing !== "new") await veterinariaApi.updateService(editing.id, body);
      else await veterinariaApi.createService(body);
      onSaved();
    } catch (e) {
      setError(errorMessage(e, "No se pudo guardar el servicio"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={editing !== null}
      onClose={onClose}
      title={editing === "new" ? "Nuevo servicio" : "Editar servicio"}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? <Spinner size={16} /> : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div>
          <label className="label" htmlFor="sv-name">
            Nombre
          </label>
          <input
            id="sv-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="sv-category">
              Categoría
            </label>
            <select
              id="sv-category"
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {Object.entries(SERVICE_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sv-duration">
              Duración (min)
            </label>
            <input
              id="sv-duration"
              type="number"
              min={5}
              step={5}
              className="input"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="sv-price">
              Precio sin IVA
            </label>
            <input
              id="sv-price"
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function StaffModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: VetStaff | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [clinic, setClinic] = useState("");
  const [isExternal, setIsExternal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) return;
    const member = editing === "new" ? null : editing;
    setName(member?.name ?? "");
    setLicenseNumber(member?.licenseNumber ?? "");
    setSpecialty(member?.specialty ?? "");
    setPhone(member?.phone ?? "");
    setEmail(member?.email ?? "");
    setClinic(member?.clinic ?? "");
    setIsExternal(member?.isExternal ?? false);
    setError("");
  }, [editing]);

  const submit = async () => {
    if (!name.trim()) {
      setError("El veterinario necesita un nombre.");
      return;
    }
    setSaving(true);
    setError("");
    const body = {
      name: name.trim(),
      licenseNumber: licenseNumber.trim(),
      specialty: specialty.trim(),
      phone: phone.trim(),
      email: email.trim(),
      clinic: clinic.trim(),
      isExternal,
    };
    try {
      if (editing && editing !== "new") await veterinariaApi.updateStaff(editing.id, body);
      else await veterinariaApi.createStaff(body);
      onSaved();
    } catch (e) {
      setError(errorMessage(e, "No se pudo guardar el veterinario"));
    } finally {
      setSaving(false);
    }
  };

  const text = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    type = "text",
  ) => (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );

  return (
    <Modal
      open={editing !== null}
      onClose={onClose}
      title={editing === "new" ? "Nuevo veterinario" : "Editar veterinario"}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? <Spinner size={16} /> : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        {text("st-name", "Nombre", name, setName)}
        <div className="grid gap-4 sm:grid-cols-2">
          {text("st-license", "Matrícula profesional", licenseNumber, setLicenseNumber)}
          {text("st-specialty", "Especialidad", specialty, setSpecialty)}
          {text("st-phone", "Teléfono", phone, setPhone, "tel")}
          {text("st-email", "Email", email, setEmail, "email")}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={isExternal}
            onChange={(e) => setIsExternal(e.target.checked)}
          />
          Veterinario externo (remite pacientes, no atiende en esta clínica)
        </label>
        {isExternal && text("st-clinic", "Clínica de origen", clinic, setClinic)}
      </div>
    </Modal>
  );
}
