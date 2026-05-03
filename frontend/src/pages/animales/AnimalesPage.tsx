import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Search, Eye, Edit2 } from "lucide-react";
import { api } from "../../lib/api";
import { fmt } from "../../lib/utils";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { PetForm } from "../clientes/PetForm";

interface Pet {
  id: string; name: string; species: string; breed?: string; variety?: string; color?: string; sex: string;
  birthdate?: string; weight?: number; height?: number; microchip?: string; isNeutered: boolean;
  allergies?: string; notes?: string; bannerId?: string; photoUrl?: string; isActive: boolean;
  client: { id: string; firstName: string; lastName: string; phone?: string; email?: string };
  vaccinations: Array<{ id: string; name: string; date: string; nextDue?: string }>;
}

const PAGE_SIZE = 20;

function PetAvatar({ pet, size = "small" }: { pet: Pet; size?: "small" | "large" }) {
  const [broken, setBroken] = useState(false);
  const isSmall = size === "small";
  const wrapperClass = isSmall
    ? "w-10 h-10 rounded-full"
    : "w-20 h-20 rounded-2xl";

  if (pet.photoUrl && !broken) {
    return (
      <img
        src={pet.photoUrl}
        alt={pet.name}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={`${wrapperClass} object-cover ${isSmall ? "border border-gray-100" : "border-2 border-white shadow-sm"}`}
      />
    );
  }

  return (
    <span className={`${isSmall ? "text-2xl" : "text-5xl"} ${wrapperClass} flex items-center justify-center ${isSmall ? "bg-gray-50" : "bg-white shadow-sm"}`}>
      {pet.species === "dog" ? "🐶" : "🐱"}
    </span>
  );
}

export function AnimalesPage() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [species, setSpecies] = useState("");
  const [selected, setSelected] = useState<Pet | null>(null);
  const [editPet, setEditPet] = useState<Pet | null>(null);
  const [showPetForm, setShowPetForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, species]);

  const load = useCallback(async (opts?: { forceInitial?: boolean }) => {
    const requestId = ++requestSeqRef.current;
    const isFirstLoad = opts?.forceInitial || pets.length === 0;

    if (isFirstLoad) setIsInitialLoading(true);
    else setIsRefreshing(true);

    setError(null);

    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (species) params.set("species", species);
      const data = await api.get<Pet[]>(`/pets?${params.toString()}`);
      if (requestId === requestSeqRef.current) {
        setPets(data);
      }
    } catch (e) {
      if (requestId === requestSeqRef.current) {
        const message = e instanceof Error ? e.message : "No se pudo cargar animales";
        setError(message);
      }
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [debouncedSearch, species, pets.length]);

  useEffect(() => { void load({ forceInitial: true }); }, [load]);

  const totalPages = Math.max(1, Math.ceil(pets.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPets = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return pets.slice(start, start + PAGE_SIZE);
  }, [pets, safePage]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Animales</h1>
          <p className="text-gray-500 text-sm mt-1">{pets.length} mascotas registradas</p>
        </div>
        {isRefreshing && (
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <Spinner size={14} />
            Actualizando...
          </div>
        )}
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
        {isInitialLoading ? <PageLoader /> : pets.length === 0 ? (
          <p className="text-center text-gray-400 py-16">Sin animales encontrados</p>
        ) : (
          <>
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
                {paginatedPets.map(p => (
                  <tr key={p.id} className="table-tr">
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <PetAvatar pet={p} size="small" />
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

            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Mostrando {Math.min((safePage - 1) * PAGE_SIZE + 1, pets.length)}-{Math.min(safePage * PAGE_SIZE, pets.length)} de {pets.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="btn-ghost btn-sm"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <span className="text-xs text-gray-500">{safePage}/{totalPages}</span>
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

      {error && (
        <div className="card p-3 border border-red-100 bg-red-50 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700">{error}</p>
          <button className="btn-ghost btn-sm" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}

      <PetForm open={showPetForm} onClose={() => { setShowPetForm(false); setEditPet(null); }} onSaved={() => void load()} client={editPet ? editPet.client : null} pet={editPet} />

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Ficha de ${selected?.name}`} size="lg">
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <PetAvatar pet={selected} size="large" />
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
