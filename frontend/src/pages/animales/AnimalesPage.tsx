import React, { useEffect, useState, useCallback } from "react";
import { Search, Eye, Edit2 } from "lucide-react";
import { api } from "../../lib/api";
import { fmt } from "../../lib/utils";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader } from "../../components/ui/Spinner";
import { PetForm } from "../clientes/PetForm";

interface Pet {
  id: string; name: string; species: string; breed?: string; variety?: string; color?: string; sex: string;
  birthdate?: string; weight?: number; height?: number; microchip?: string; isNeutered: boolean;
  allergies?: string; notes?: string; bannerId?: string; isActive: boolean;
  client: { id: string; firstName: string; lastName: string; phone?: string; email?: string };
  vaccinations: Array<{ id: string; name: string; date: string; nextDue?: string }>;
}

export function AnimalesPage() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [species, setSpecies] = useState("");
  const [selected, setSelected] = useState<Pet | null>(null);
  const [editPet, setEditPet] = useState<Pet | null>(null);
  const [showPetForm, setShowPetForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (species) params.set("species", species);
      const data = await api.get<Pet[]>(`/pets?${params}`);
      setPets(data);
    } finally { setLoading(false); }
  }, [search, species]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="page-title">Animales</h1>
        <p className="text-gray-500 text-sm mt-1">{pets.length} mascotas registradas</p>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar por nombre, raza, microchip…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-40" value={species} onChange={e => setSpecies(e.target.value)}>
          <option value="">Todas las especies</option>
          <option value="dog">Perros</option>
          <option value="cat">Gatos</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading ? <PageLoader /> : pets.length === 0 ? (
          <p className="text-center text-gray-400 py-16">Sin animales encontrados</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Animal</th>
                <th className="table-th">Dueño</th>
                <th className="table-th">Raza / Color</th>
                <th className="table-th">Datos</th>
                <th className="table-th">Microchip</th>
                <th className="table-th">Estado</th>
                <th className="table-th">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pets.map(p => (
                <tr key={p.id} className="table-tr">
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{p.species === "dog" ? "🐶" : "🐱"}</span>
                      <div>
                        <p className="font-semibold text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.sex === "M" ? "Macho" : "Hembra"}{p.isNeutered ? " · Esterilizado" : ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-td">
                    <p className="text-sm font-medium">{p.client.firstName} {p.client.lastName}</p>
                    <p className="text-xs text-gray-400">{p.client.phone ?? ""}</p>
                  </td>
                  <td className="table-td text-xs">
                    <p>{p.breed ?? "—"}</p>
                    {p.color && <p className="text-gray-400">{p.color}</p>}
                  </td>
                  <td className="table-td text-xs">
                    {p.weight && <p>Peso: {p.weight} kg</p>}
                    {p.birthdate && <p>Nac: {fmt(p.birthdate)}</p>}
                  </td>
                  <td className="table-td text-xs">{p.microchip ?? "—"}</td>
                  <td className="table-td">
                    <Badge color={p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                      {p.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                    {p.allergies && <Badge color="bg-red-100 text-red-700" className="ml-1">Alergia</Badge>}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSelected(p)} className="btn-ghost btn-sm p-1.5" title="Ver ficha"><Eye size={14} /></button>
                      <button onClick={() => { setEditPet(p); setShowPetForm(true); }} className="btn-ghost btn-sm p-1.5" title="Editar"><Edit2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PetForm open={showPetForm} onClose={() => { setShowPetForm(false); setEditPet(null); }} onSaved={load} client={editPet ? editPet.client : null} pet={editPet} />

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Ficha de ${selected?.name}`} size="lg">
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <span className="text-5xl">{selected.species === "dog" ? "🐶" : "🐱"}</span>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selected.name}</h2>
                <p className="text-gray-500 text-sm">{selected.breed} · {selected.sex === "M" ? "Macho" : "Hembra"}{selected.isNeutered ? " · Esterilizado" : ""}</p>
                <p className="text-sm mt-1">Dueño: <strong>{selected.client.firstName} {selected.client.lastName}</strong> · {selected.client.phone}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {[
                ["Color", selected.color], ["Variedad", selected.variety], ["Microchip", selected.microchip],
                ["Peso", selected.weight ? `${selected.weight} kg` : null], ["Talla", selected.height ? `${selected.height} cm` : null],
                ["Nacimiento", fmt(selected.birthdate)], ["ID Banner", selected.bannerId],
              ].map(([l, v]) => v ? (
                <div key={l as string}><p className="label">{l}</p><p>{v}</p></div>
              ) : null)}
            </div>
            {selected.allergies && <div className="p-3 bg-red-50 rounded-lg"><p className="label text-red-700">⚠️ Alergias / Observaciones</p><p className="text-sm text-red-800">{selected.allergies}</p></div>}
            {selected.notes && <div><p className="label">Notas</p><p className="text-sm text-gray-600">{selected.notes}</p></div>}
            {selected.vaccinations.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Vacunas</h3>
                <table className="w-full text-sm">
                  <thead><tr><th className="table-th">Vacuna</th><th className="table-th">Fecha</th><th className="table-th">Próxima</th></tr></thead>
                  <tbody>
                    {selected.vaccinations.map(v => (
                      <tr key={v.id} className="table-tr">
                        <td className="table-td">{v.name}</td>
                        <td className="table-td">{fmt(v.date)}</td>
                        <td className="table-td">{v.nextDue ? fmt(v.nextDue) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
