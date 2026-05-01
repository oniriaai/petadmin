import React, { useState, useEffect } from "react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { Spinner } from "../../components/ui/Spinner";
import { ImageUpload } from "../../components/ui/ImageUpload";

interface Client { id: string; firstName: string; lastName: string }
interface Pet { id: string; name: string; species: string; breed?: string; variety?: string; color?: string; sex: string; birthdate?: string; weight?: number; height?: number; microchip?: string; isNeutered?: boolean; allergies?: string; notes?: string; bannerId?: string; photoUrl?: string }
interface Props { open: boolean; onClose: () => void; onSaved: () => void; client: Client | null; pet?: Pet | null }

export function PetForm({ open, onClose, onSaved, client, pet }: Props) {
  const [form, setForm] = useState({ name: "", species: "dog", breed: "", variety: "", color: "", sex: "M", birthdate: "", weight: "", height: "", microchip: "", isNeutered: false, allergies: "", notes: "", bannerId: "", photoUrl: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [originalPhotoUrl, setOriginalPhotoUrl] = useState<string>("");

  useEffect(() => {
    if (pet) {
      setForm({ name: pet.name, species: pet.species, breed: pet.breed ?? "", variety: pet.variety ?? "", color: pet.color ?? "", sex: pet.sex, birthdate: pet.birthdate ? pet.birthdate.slice(0, 10) : "", weight: pet.weight?.toString() ?? "", height: pet.height?.toString() ?? "", microchip: pet.microchip ?? "", isNeutered: pet.isNeutered ?? false, allergies: pet.allergies ?? "", notes: pet.notes ?? "", bannerId: pet.bannerId ?? "", photoUrl: pet.photoUrl ?? "" });
      setOriginalPhotoUrl(pet.photoUrl ?? "");
    } else {
      setForm({ name: "", species: "dog", breed: "", variety: "", color: "", sex: "M", birthdate: "", weight: "", height: "", microchip: "", isNeutered: false, allergies: "", notes: "", bannerId: "", photoUrl: "" });
      setOriginalPhotoUrl("");
    }
    setError("");
  }, [pet, open]);

  const setS = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const deleteImageFromB2 = async (imageUrl: string) => {
    try {
      console.log("[PetForm] Deleting image:", imageUrl);
      await api.post("/storage/remove", { key: imageUrl });
      console.log("[PetForm] Image deleted successfully");
    } catch (error) {
      console.error("Error removing image from B2:", error);
      // Don't throw - allow form to continue even if B2 deletion fails
    }
  };

  async function save() {
    if (!form.name) { setError("El nombre es obligatorio"); return; }
    if (!client && !pet) { setError("No hay cliente asociado"); return; }
    setSaving(true); setError("");
    try {
      // If image was replaced, delete the old one from B2
      if (originalPhotoUrl && form.photoUrl && originalPhotoUrl !== form.photoUrl) {
        await deleteImageFromB2(originalPhotoUrl);
      }
      
      const body = { ...form, weight: form.weight ? +form.weight : undefined, height: form.height ? +form.height : undefined, birthdate: form.birthdate || undefined, clientId: client?.id };
      if (pet) await api.put(`/pets/${pet.id}`, body);
      else await api.post("/pets", body);
      onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Error al guardar"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${pet ? "Editar" : "Nueva"} Mascota${client ? ` — ${client.firstName} ${client.lastName}` : ""}`} size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner size={14} /> : null} {pet ? "Guardar cambios" : "Registrar mascota"}
          </button>
        </>
      }>
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        
        <div className="flex justify-center pb-4">
          <ImageUpload 
            value={form.photoUrl} 
            onChange={(url) => setForm(p => ({ ...p, photoUrl: url }))}
            onDelete={deleteImageFromB2}
            petName={form.name}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Nombre *</label><input className="input" value={form.name} onChange={setS("name")} /></div>
          <div>
            <label className="label">Especie</label>
            <select className="input" value={form.species} onChange={setS("species")}>
              <option value="dog">🐶 Perro</option>
              <option value="cat">🐱 Gato</option>
            </select>
          </div>
          <div><label className="label">Raza</label><input className="input" value={form.breed} onChange={setS("breed")} /></div>
          <div><label className="label">Variedad</label><input className="input" value={form.variety} onChange={setS("variety")} /></div>
          <div><label className="label">Color</label><input className="input" value={form.color} onChange={setS("color")} /></div>
          <div>
            <label className="label">Sexo</label>
            <select className="input" value={form.sex} onChange={setS("sex")}>
              <option value="M">Macho</option>
              <option value="F">Hembra</option>
            </select>
          </div>
          <div><label className="label">Fecha de nacimiento</label><input className="input" type="date" value={form.birthdate} onChange={setS("birthdate")} /></div>
          <div><label className="label">Peso (kg)</label><input className="input" type="number" step="0.1" value={form.weight} onChange={setS("weight")} /></div>
          <div><label className="label">Talla (cm)</label><input className="input" type="number" step="0.5" value={form.height} onChange={setS("height")} /></div>
          <div><label className="label">Microchip</label><input className="input" value={form.microchip} onChange={setS("microchip")} /></div>
          <div><label className="label">ID Banner</label><input className="input" value={form.bannerId} onChange={setS("bannerId")} /></div>
          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" id="neutered" checked={form.isNeutered} onChange={e => setForm(p => ({ ...p, isNeutered: e.target.checked }))} className="w-4 h-4 rounded" />
            <label htmlFor="neutered" className="text-sm text-gray-700 cursor-pointer">Esterilizado/a</label>
          </div>
          <div className="col-span-2"><label className="label">Alergias / Observaciones médicas</label><textarea className="input" rows={2} value={form.allergies} onChange={setS("allergies")} /></div>
          <div className="col-span-2"><label className="label">Notas adicionales</label><textarea className="input" rows={2} value={form.notes} onChange={setS("notes")} /></div>
        </div>
      </div>
    </Modal>
  );
}
