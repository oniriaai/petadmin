import { useState, useEffect } from "react";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { api } from "../../lib/api";

interface Provider {
  id?: string;
  name: string;
  idNumber?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  province?: string;
  product?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  provider?: Provider | null;
  onSaved: () => void;
}

export function ProviderForm({ open, onClose, provider, onSaved }: Props) {
  const [form, setForm] = useState({
    name: "",
    idNumber: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    province: "",
    product: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (provider) {
      setForm({
        name: provider.name || "",
        idNumber: provider.idNumber || "",
        email: provider.email || "",
        phone: provider.phone || "",
        address: provider.address || "",
        city: provider.city || "",
        province: provider.province || "",
        product: provider.product || "",
      });
    } else {
      setForm({
        name: "",
        idNumber: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        province: "",
        product: "",
      });
    }
  }, [provider, open]);

  async function save() {
    if (!form.name) return;
    setSaving(true);
    try {
      if (provider?.id) {
        await api.put(`/providers/${provider.id}`, form);
      } else {
        await api.post("/providers", form);
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error("Error saving provider:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={provider ? "Editar Proveedor" : "Nuevo Proveedor"}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving && <Spinner size={14} />} Guardar
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Nombre *</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Cédula / RUC</label>
          <input
            className="input"
            value={form.idNumber}
            onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Producto / Servicio</label>
          <input
            className="input"
            value={form.product}
            onChange={(e) => setForm({ ...form, product: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Teléfono</label>
          <input
            className="input"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
}
