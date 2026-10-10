import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Eye, Edit2, UserX, PawPrint, Phone, Dog, Cat } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { Badge } from "../../components/ui/Badge";
import { PageLoader } from "../../components/ui/Spinner";
import { ClienteForm } from "./ClienteForm";
import { PetForm } from "./PetForm";
import { PageHeader } from "../../components/layout/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";

interface Pet {
  id: string;
  name: string;
  species: string;
  breed?: string;
  sex: string;
  isActive: boolean;
}
interface Client {
  id: string;
  firstName: string;
  lastName: string;
  idNumber?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  birthdate?: string;
  city?: string;
  province?: string;
  isActive: boolean;
  createdAt: string;
  pets: Pet[];
}

const PAGE_SIZE = 20;

export function ClientesPage() {
  // The server refuses the delete without this permission, so the button is not offered.
  const canDelete = useAuth().can("registros.delete");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const requestSeqRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const [statusFilter, setStatusFilter] = useState("active");
  const [showForm, setShowForm] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [showPetForm, setShowPetForm] = useState(false);
  const [petFormClient, setPetFormClient] = useState<Client | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter]);

  const load = useCallback(async () => {
    const requestId = ++requestSeqRef.current;
    // Only the first load shows the skeleton: after that the rows stay up until the new ones
    // arrive, so the table does not blink on every search.
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter) params.set("status", statusFilter);
      const data = await api.get<Client[]>(`/clients?${params}`);
      // A slower, older answer must not replace a newer one.
      if (requestId === requestSeqRef.current) setClients(data);
    } finally {
      if (requestId === requestSeqRef.current) {
        hasLoadedRef.current = true;
        setLoading(false);
      }
    }
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(clients.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageClients = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return clients.slice(start, start + PAGE_SIZE);
  }, [clients, safePage]);

  async function deactivate(id: string) {
    if (!confirm("¿Desactivamos este cliente? Su historial se conserva.")) return;
    await api.del(`/clients/${id}`);
    load();
  }

  function openNewPet(client: Client) {
    setPetFormClient(client);
    setShowPetForm(true);
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Clientes"
        subtitle={<>{clients.length} clientes</>}
        actions={
          <button
            onClick={() => {
              setEditClient(null);
              setShowForm(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> Nuevo Cliente
          </button>
        }
      />

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            className="input pl-9"
            placeholder="Buscar por nombre, email o teléfono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-40"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <PageLoader />
        ) : clients.length === 0 ? (
          <EmptyState title="Todavía no hay clientes. ¿Registramos el primero?" />
        ) : (
          <>
            <div className="overflow-x-auto">
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
                  {pageClients.map((c) => (
                    <tr key={c.id} className="table-tr">
                      <td className="table-td">
                        <Link
                          to={`/clientes/${c.id}`}
                          className="font-semibold text-ink hover:text-action hover:underline"
                        >
                          {c.lastName}, {c.firstName}
                        </Link>
                        {c.idNumber && <p className="text-xs text-muted">CI: {c.idNumber}</p>}
                      </td>
                      <td className="table-td">
                        {c.phone && (
                          <p className="text-xs flex items-center gap-1">
                            <Phone size={11} />
                            {c.phone}
                          </p>
                        )}
                        {c.email && (
                          <p className="text-xs text-muted truncate max-w-36">{c.email}</p>
                        )}
                      </td>
                      <td className="table-td text-xs">
                        {[c.city, c.province].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="table-td">
                        <div className="flex flex-wrap gap-1">
                          {c.pets.slice(0, 3).map((p) => (
                            <Link
                              key={p.id}
                              to={`/animales/${p.id}`}
                              className="badge bg-info-soft text-info-ink hover:underline"
                            >
                              {p.species === "dog" ? <Dog size={14} /> : <Cat size={14} />} {p.name}
                            </Link>
                          ))}
                          {c.pets.length > 3 && (
                            <span className="badge bg-sunken text-muted">+{c.pets.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="table-td">
                        <Badge
                          color={
                            c.isActive ? "bg-success-soft text-success-ink" : "bg-sunken text-muted"
                          }
                        >
                          {c.isActive ? "Activo" : "Inactivo"}
                        </Badge>
                      </td>
                      <td className="table-td">
                        <div className="flex items-center gap-1">
                          <Link
                            to={`/clientes/${c.id}`}
                            className="btn-ghost btn-sm p-1.5"
                            title="Ver detalle"
                          >
                            <Eye size={14} />
                          </Link>
                          <button
                            onClick={() => {
                              setEditClient(c);
                              setShowForm(true);
                            }}
                            className="btn-ghost btn-sm p-1.5"
                            title="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => openNewPet(c)}
                            className="btn-ghost btn-sm p-1.5 text-action"
                            title="Agregar mascota"
                          >
                            <PawPrint size={14} />
                          </button>
                          {c.isActive && canDelete && (
                            <button
                              onClick={() => deactivate(c.id)}
                              className="btn-ghost btn-sm p-1.5 text-danger"
                              title="Desactivar"
                            >
                              <UserX size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-line-subtle flex items-center justify-between">
              <p className="text-xs text-muted">
                Mostrando {Math.min((safePage - 1) * PAGE_SIZE + 1, clients.length)}-
                {Math.min(safePage * PAGE_SIZE, clients.length)} de {clients.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="btn-ghost btn-sm"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <span className="text-xs text-muted">
                  {safePage}/{totalPages}
                </span>
                <button
                  className="btn-ghost btn-sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ClienteForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditClient(null);
        }}
        onSaved={load}
        client={editClient}
      />
      <PetForm
        open={showPetForm}
        onClose={() => {
          setShowPetForm(false);
          setPetFormClient(null);
        }}
        onSaved={load}
        client={petFormClient}
      />
    </div>
  );
}
