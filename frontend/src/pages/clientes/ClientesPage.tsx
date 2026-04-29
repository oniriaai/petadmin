import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, Eye, Edit2, UserX, PawPrint, Phone } from "lucide-react";
import { api } from "../../lib/api";
import { fmt, fmtCurrency } from "../../lib/utils";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { ClienteForm } from "./ClienteForm";
import { PetForm } from "./PetForm";

interface Pet { id: string; name: string; species: string; breed?: string; sex: string; isActive: boolean }
interface Client {
  id: string; firstName: string; lastName: string; idNumber?: string; phone?: string; whatsapp?: string;
  email?: string; city?: string; province?: string; isActive: boolean; createdAt: string;
  pets: Pet[];
}

export function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [showForm, setShowForm] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showPetForm, setShowPetForm] = useState(false);
  const [petFormClient, setPetFormClient] = useState<Client | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const data = await api.get<Client[]>(`/clients?${params}`);
      setClients(data);
    } finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function deactivate(id: string) {
    if (!confirm("¿Desactivar este cliente?")) return;
    await api.del(`/clients/${id}`);
    load();
  }

  function openNewPet(client: Client) {
    setPetFormClient(client);
    setShowPetForm(true);
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Perfil del Cliente</h1>
          <p className="text-gray-500 text-sm mt-1">{clients.length} clientes</p>
        </div>
        <button onClick={() => { setEditClient(null); setShowForm(true); }} className="btn-primary">
          <Plus size={16} /> Nuevo Cliente
        </button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar por nombre, email o teléfono…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading ? <PageLoader /> : clients.length === 0 ? (
          <p className="text-center text-gray-400 py-16">Sin clientes. ¡Registra el primero!</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Cliente</th>
                <th className="table-th">Contacto</th>
                <th className="table-th">Localidad</th>
                <th className="table-th">Mascotas</th>
                <th className="table-th">Estado</th>
                <th className="table-th">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} className="table-tr">
                  <td className="table-td">
                    <p className="font-semibold text-gray-900">{c.lastName}, {c.firstName}</p>
                    {c.idNumber && <p className="text-xs text-gray-400">CI: {c.idNumber}</p>}
                  </td>
                  <td className="table-td">
                    {c.phone && <p className="text-xs flex items-center gap-1"><Phone size={11} />{c.phone}</p>}
                    {c.email && <p className="text-xs text-gray-400 truncate max-w-36">{c.email}</p>}
                  </td>
                  <td className="table-td text-xs">{[c.city, c.province].filter(Boolean).join(", ") || "—"}</td>
                  <td className="table-td">
                    <div className="flex flex-wrap gap-1">
                      {c.pets.slice(0, 3).map(p => (
                        <span key={p.id} className="badge bg-indigo-50 text-indigo-700">
                          {p.species === "dog" ? "🐶" : "🐱"} {p.name}
                        </span>
                      ))}
                      {c.pets.length > 3 && <span className="badge bg-gray-100 text-gray-500">+{c.pets.length - 3}</span>}
                    </div>
                  </td>
                  <td className="table-td">
                    <Badge color={c.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                      {c.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSelectedClient(c)} className="btn-ghost btn-sm p-1.5" title="Ver detalle"><Eye size={14} /></button>
                      <button onClick={() => { setEditClient(c); setShowForm(true); }} className="btn-ghost btn-sm p-1.5" title="Editar"><Edit2 size={14} /></button>
                      <button onClick={() => openNewPet(c)} className="btn-ghost btn-sm p-1.5 text-indigo-600" title="Agregar mascota"><PawPrint size={14} /></button>
                      {c.isActive && <button onClick={() => deactivate(c.id)} className="btn-ghost btn-sm p-1.5 text-red-500" title="Desactivar"><UserX size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ClienteForm open={showForm} onClose={() => { setShowForm(false); setEditClient(null); }} onSaved={load} client={editClient} />
      <PetForm open={showPetForm} onClose={() => { setShowPetForm(false); setPetFormClient(null); }} onSaved={load} client={petFormClient} />

      <Modal open={!!selectedClient} onClose={() => setSelectedClient(null)} title="Perfil del Cliente" size="lg">
        {selectedClient && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="label">Nombre completo</p><p className="font-semibold">{selectedClient.firstName} {selectedClient.lastName}</p></div>
              <div><p className="label">Cédula</p><p>{selectedClient.idNumber ?? "—"}</p></div>
              <div><p className="label">Teléfono</p><p>{selectedClient.phone ?? "—"}</p></div>
              <div><p className="label">WhatsApp</p><p>{selectedClient.whatsapp ?? "—"}</p></div>
              <div><p className="label">Email</p><p>{selectedClient.email ?? "—"}</p></div>
              <div><p className="label">Ciudad / Provincia</p><p>{[selectedClient.city, selectedClient.province].filter(Boolean).join(", ") || "—"}</p></div>
              <div><p className="label">Cliente desde</p><p>{fmt(selectedClient.createdAt)}</p></div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Mascotas registradas</h3>
              {selectedClient.pets.length === 0 ? (
                <p className="text-gray-400 text-sm">Sin mascotas registradas</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {selectedClient.pets.map(p => (
                    <div key={p.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <span className="text-xl">{p.species === "dog" ? "🐶" : "🐱"}</span>
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.breed ?? p.species} · {p.sex === "M" ? "Macho" : "Hembra"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
