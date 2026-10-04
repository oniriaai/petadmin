import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PawPrint, Search } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { PageLoader } from "../../components/ui/Spinner";
import { petsApi, type PetListRecord } from "../../modules/shared/api";
import { errorMessage } from "./api";

const SPECIES: Record<string, string> = { dog: "Perro", cat: "Gato" };

/** The patient finder: every pet of the daycare, opening onto its clinical history. */
export function PacientesPage() {
  const [pets, setPets] = useState<PetListRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Debounced, so typing a name is one request rather than one per letter.
    const timer = window.setTimeout(() => {
      setLoading(true);
      petsApi
        .list(search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "")
        .then((loaded) => {
          setPets(loaded);
          setError("");
        })
        .catch((e) => setError(errorMessage(e, "No se pudieron cargar los pacientes")))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="Pacientes" subtitle="Historia clínica por paciente" />

      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}

      <div className="card p-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            className="input pl-9"
            placeholder="Buscar por nombre, raza o microchip"
            aria-label="Buscar paciente"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : pets.length === 0 ? (
        <div className="card p-10 text-center">
          <PawPrint size={28} className="mx-auto mb-2 text-faint" />
          <p className="text-sm text-muted">
            {search
              ? "Ningún paciente coincide con la búsqueda."
              : "Todavía no hay pacientes. Se registran desde Animales."}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Paciente</th>
                  <th className="table-th">Especie y raza</th>
                  <th className="table-th">Tutor</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {pets.map((pet) => (
                  <tr key={pet.id} className="table-tr">
                    <td className="table-td font-medium text-ink">{pet.name}</td>
                    <td className="table-td">
                      {SPECIES[pet.species] ?? pet.species}
                      {pet.breed ? ` · ${pet.breed}` : ""}
                    </td>
                    <td className="table-td">
                      {pet.client ? `${pet.client.firstName} ${pet.client.lastName}` : "—"}
                    </td>
                    <td className="table-td text-right">
                      <Link
                        to={`/veterinaria/pacientes/${pet.id}`}
                        className="btn-secondary btn-sm"
                      >
                        Historia clínica
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
