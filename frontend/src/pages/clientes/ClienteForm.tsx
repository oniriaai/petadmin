import React, { useState, useEffect } from "react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { clientsApi } from "../../modules/shared/api";
import { Spinner } from "../../components/ui/Spinner";

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  idNumber?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  language?: string;
  birthdate?: string;
  notes?: string;
}
interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  client: Client | null;
}

export function ClienteForm({ open, onClose, onSaved, client }: Props) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    idNumber: "",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    city: "",
    province: "",
    language: "es",
    birthdate: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (client)
      setForm({
        firstName: client.firstName,
        lastName: client.lastName,
        idNumber: client.idNumber ?? "",
        phone: client.phone ?? "",
        whatsapp: client.whatsapp ?? "",
        email: client.email ?? "",
        address: client.address ?? "",
        city: client.city ?? "",
        province: client.province ?? "",
        language: client.language ?? "es",
        birthdate: client.birthdate ?? "",
        notes: client.notes ?? "",
      });
    else
      setForm({
        firstName: "",
        lastName: "",
        idNumber: "",
        phone: "",
        whatsapp: "",
        email: "",
        address: "",
        city: "",
        province: "",
        language: "es",
        birthdate: "",
        notes: "",
      });
    setError("");
  }, [client, open]);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));

  async function save() {
    if (!form.firstName || !form.lastName) {
      setError("Nombre y apellido son obligatorios");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (client) await api.put(`/clients/${client.id}`, form);
      else await clientsApi.create(form);
      onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos guardar los cambios. Inténtalo de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? "Editar Cliente" : "Nuevo Cliente"}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner size={14} /> : null} {client ? "Guardar cambios" : "Crear cliente"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="text-sm text-danger bg-danger-soft rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={form.firstName} onChange={set("firstName")} />
          </div>
          <div>
            <label className="label">Apellido *</label>
            <input className="input" value={form.lastName} onChange={set("lastName")} />
          </div>
          <div>
            <label className="label">Cédula / ID</label>
            <input className="input" value={form.idNumber} onChange={set("idNumber")} />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={form.phone} onChange={set("phone")} />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input className="input" value={form.whatsapp} onChange={set("whatsapp")} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={set("email")} />
          </div>
          <div>
            <label className="label">Fecha de nacimiento</label>
            <input
              className="input"
              type="date"
              value={form.birthdate}
              onChange={set("birthdate")}
            />
          </div>
          <div className="col-span-2">
            <label className="label">Dirección</label>
            <input className="input" value={form.address} onChange={set("address")} />
          </div>
          <div>
            <label className="label">Ciudad</label>
            <input className="input" value={form.city} onChange={set("city")} />
          </div>
          <div>
            <label className="label">Provincia</label>
            <input className="input" value={form.province} onChange={set("province")} />
          </div>
          <div>
            <label className="label">Idioma preferido</label>
            <select className="input" value={form.language} onChange={set("language")}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Notas</label>
            <textarea className="input" rows={3} value={form.notes} onChange={set("notes")} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
