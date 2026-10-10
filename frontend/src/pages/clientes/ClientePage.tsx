import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Edit2, Plus } from "lucide-react";
import { api } from "../../lib/api";
import { fmt } from "../../lib/utils";
import { PageHeader } from "../../components/layout/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { SectionCard } from "../../components/ui/SectionCard";
import { PageLoader } from "../../components/ui/Spinner";
import { HistoryTable, type HistoryEntry } from "../animales/HistoryTable";
import { PetAvatar } from "../animales/PetAvatar";
import { ClienteForm } from "./ClienteForm";
import { PetForm } from "./PetForm";

interface ClientDetail {
  id: string;
  firstName: string;
  lastName: string;
  idNumber?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  birthdate?: string;
  city?: string;
  province?: string;
  notes?: string;
  createdAt: string;
  pets: Array<{
    id: string;
    name: string;
    species: string;
    breed?: string;
    sex: string;
    photoUrl?: string;
    isActive: boolean;
  }>;
  reservations: Array<HistoryEntry & { pets: Array<{ pet: { name: string } }> }>;
}

export function ClientePage() {
  const { clientId } = useParams();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPetForm, setShowPetForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setClient(await api.get<ClientDetail>(`/clients/${clientId}`));
    } catch {
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <PageLoader />;
  if (!client) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          title="No encontramos este cliente."
          action={
            <Link to="/clientes" className="btn-secondary">
              Volver a Clientes
            </Link>
          }
        />
      </div>
    );
  }

  const pets = client.pets.filter((p) => p.isActive);
  const activity = client.reservations.map((r) => ({
    ...r,
    pets: r.pets.map((p) => p.pet.name).join(", "),
  }));

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <Link to="/clientes" className="text-sm text-muted hover:text-ink flex items-center gap-1">
        <ArrowLeft size={14} /> Clientes
      </Link>
      <PageHeader
        title={`${client.firstName} ${client.lastName}`}
        subtitle={<>Cliente desde {fmt(client.createdAt)}</>}
        actions={
          <button className="btn-secondary" onClick={() => setShowForm(true)}>
            <Edit2 size={15} /> Editar
          </button>
        }
      />

      <SectionCard title="Datos de contacto" bodyClassName="p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {[
            ["Cédula", client.idNumber],
            ["Teléfono", client.phone],
            ["WhatsApp", client.whatsapp],
            ["Email", client.email],
            ["Dirección", client.address],
            ["Ciudad / Provincia", [client.city, client.province].filter(Boolean).join(", ")],
            ["Fecha de nacimiento", client.birthdate ? fmt(client.birthdate) : null],
          ].map(([l, v]) => (
            <div key={l as string}>
              <p className="label">{l}</p>
              <p className="break-words">{v || "—"}</p>
            </div>
          ))}
        </div>
        {client.notes && (
          <div>
            <p className="label">Notas</p>
            <p className="text-sm text-muted">{client.notes}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Mascotas"
        action={
          <button className="btn-ghost btn-sm text-action" onClick={() => setShowPetForm(true)}>
            <Plus size={14} /> Agregar mascota
          </button>
        }
        bodyClassName="p-4 sm:p-5"
      >
        {pets.length === 0 ? (
          <EmptyState compact title="Este tutor todavía no tiene mascotas registradas." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {pets.map((p) => (
              <Link
                key={p.id}
                to={`/animales/${p.id}`}
                className="flex items-center gap-3 p-3 bg-sunken rounded-lg hover:ring-1 hover:ring-action"
              >
                <PetAvatar pet={p} />
                <div className="min-w-0">
                  <p className="font-medium text-sm text-ink truncate">{p.name}</p>
                  <p className="text-xs text-muted truncate">
                    {p.breed ?? (p.species === "dog" ? "Perro" : "Gato")} ·{" "}
                    {p.sex === "M" ? "Macho" : "Hembra"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Actividad reciente">
        {activity.length === 0 ? (
          <EmptyState compact title="Todavía no hay visitas registradas." />
        ) : (
          <HistoryTable entries={activity} />
        )}
      </SectionCard>

      <ClienteForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => void load()}
        client={client}
      />
      <PetForm
        open={showPetForm}
        onClose={() => setShowPetForm(false)}
        onSaved={() => void load()}
        client={client}
      />
    </div>
  );
}
