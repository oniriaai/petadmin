import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Edit2 } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { fmt } from "../../lib/utils";
import { BUSINESS_UNITS, businessUnitLabel } from "../../modules/shared/contracts";
import { PageHeader } from "../../components/layout/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { SectionCard } from "../../components/ui/SectionCard";
import { PageLoader } from "../../components/ui/Spinner";
import { Tabs } from "../../components/ui/Tabs";
import { PetForm } from "../clientes/PetForm";
import { HistoryTable, type HistoryEntry } from "./HistoryTable";
import { PetAvatar } from "./PetAvatar";

interface PetDetail {
  id: string;
  name: string;
  species: string;
  breed?: string;
  variety?: string;
  color?: string;
  sex: string;
  birthdate?: string;
  weight?: number;
  height?: number;
  microchip?: string;
  isNeutered: boolean;
  allergies?: string;
  notes?: string;
  bannerId?: string;
  photoUrl?: string;
  client: { id: string; firstName: string; lastName: string; phone?: string };
  vaccinations: Array<{ id: string; name: string; date: string; nextDue?: string }>;
  reservationPets: Array<{ reservation: HistoryEntry }>;
  checkInOuts: Array<{
    id: string;
    businessUnit: string;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    room?: { name: string } | null;
  }>;
}

export function AnimalPage() {
  const { petId } = useParams();
  const { user, hasModules } = useAuth();
  const [pet, setPet] = useState<PetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState("ALL");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setPet(await api.get<PetDetail>(`/pets/${petId}`));
    } catch {
      setPet(null);
    } finally {
      setLoading(false);
    }
  }, [petId]);

  useEffect(() => {
    void load();
  }, [load]);

  const history = useMemo<HistoryEntry[]>(() => {
    if (!pet) return [];
    const walkIns = pet.checkInOuts.map((c) => ({
      id: c.id,
      businessUnit: c.businessUnit,
      service: "GUARDERIA",
      status: c.checkOutTime ? "COMPLETADA" : "ACTIVA",
      checkIn: c.checkInTime,
      checkOut: c.checkOutTime,
      room: c.room,
    }));
    const when = (e: HistoryEntry) => e.checkIn ?? e.createdAt ?? "";
    return [...pet.reservationPets.map((r) => r.reservation), ...walkIns].sort((a, b) =>
      when(b).localeCompare(when(a)),
    );
  }, [pet]);

  if (loading) return <PageLoader />;
  if (!pet) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          title="No encontramos este animal."
          action={
            <Link to="/animales" className="btn-secondary">
              Volver a Animales
            </Link>
          }
        />
      </div>
    );
  }

  // Mirrors the route's own gate in the registry, so the link never leads to a refusal.
  const canOpenClinic =
    (user?.role === "admin" || user?.role === "veterinary" || user?.role === "superadmin") &&
    hasModules(["veterinaria", "reservas"]);
  const tabs = [
    { id: "ALL", label: "Todo", count: history.length },
    ...BUSINESS_UNITS.map((u) => ({
      id: u as string,
      label: businessUnitLabel(u),
      count: history.filter((e) => e.businessUnit === u).length,
    })),
  ];
  const shown = unit === "ALL" ? history : history.filter((e) => e.businessUnit === unit);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <Link to="/animales" className="text-sm text-muted hover:text-ink flex items-center gap-1">
        <ArrowLeft size={14} /> Animales
      </Link>
      <PageHeader
        icon={<PetAvatar pet={pet} size="large" />}
        title={pet.name}
        subtitle={
          <>
            {[pet.breed, pet.sex === "M" ? "Macho" : "Hembra", pet.isNeutered && "Esterilizado"]
              .filter(Boolean)
              .join(" · ")}
            <br />
            Tutor:{" "}
            <Link
              to={`/clientes/${pet.client.id}`}
              className="font-medium text-action hover:underline"
            >
              {pet.client.firstName} {pet.client.lastName}
            </Link>
            {pet.client.phone && ` · ${pet.client.phone}`}
          </>
        }
        actions={
          <button className="btn-secondary" onClick={() => setShowForm(true)}>
            <Edit2 size={15} /> Editar
          </button>
        }
      />

      {pet.allergies && (
        <div className="p-3 bg-danger-soft rounded-lg">
          <p className="label text-danger-ink flex items-center gap-1">
            <AlertCircle size={15} /> Alergias / Observaciones
          </p>
          <p className="text-sm text-danger-ink">{pet.allergies}</p>
        </div>
      )}

      <SectionCard title="Ficha" bodyClassName="p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {[
            ["Color", pet.color],
            ["Variedad", pet.variety],
            ["Microchip", pet.microchip],
            ["Peso", pet.weight ? `${pet.weight} kg` : null],
            ["Talla", pet.height ? `${pet.height} cm` : null],
            ["Nacimiento", pet.birthdate ? fmt(pet.birthdate) : null],
            ["ID Banner", pet.bannerId],
          ].map(([l, v]) =>
            v ? (
              <div key={l as string}>
                <p className="label">{l}</p>
                <p>{v}</p>
              </div>
            ) : null,
          )}
        </div>
        {pet.notes && (
          <div>
            <p className="label">Notas</p>
            <p className="text-sm text-muted">{pet.notes}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Historial">
        <Tabs items={tabs} value={unit} onChange={setUnit} label="Unidad" className="px-2" />
        {shown.length === 0 ? (
          <EmptyState compact title="Todavía no hay visitas registradas aquí." />
        ) : (
          <HistoryTable
            entries={shown}
            vetHref={canOpenClinic ? `/veterinaria/pacientes/${pet.id}` : undefined}
          />
        )}
      </SectionCard>

      {pet.vaccinations.length > 0 && (
        <SectionCard title="Vacunas">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th">Vacuna</th>
                <th className="table-th">Fecha</th>
                <th className="table-th">Próxima</th>
              </tr>
            </thead>
            <tbody>
              {pet.vaccinations.map((v) => (
                <tr key={v.id} className="table-tr">
                  <td className="table-td">{v.name}</td>
                  <td className="table-td">{fmt(v.date)}</td>
                  <td className="table-td">{v.nextDue ? fmt(v.nextDue) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}

      <PetForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => void load()}
        client={pet.client}
        pet={pet}
      />
    </div>
  );
}
