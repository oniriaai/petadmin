import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { PageLoader } from "../../components/ui/Spinner";
import { useAuth } from "../../lib/auth-context";
import { fmtDateTime } from "../../lib/utils";
import { errorMessage, petAge, veterinariaApi, type Stay } from "./api";

/** The discharge sheet the tutor takes home. The app's navigation is hidden when printing. */
export function AltaPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { daycare } = useAuth();
  const [stay, setStay] = useState<Stay | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    veterinariaApi
      .stay(id)
      .then(setStay)
      .catch((e) => setError(errorMessage(e, "No se pudo cargar la hospitalización")));
  }, [id]);

  if (error) {
    return (
      <p className="p-6 text-sm text-red-600" role="alert">
        {error}
      </p>
    );
  }
  if (!stay) return <PageLoader />;

  const { pet, visit } = stay;

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-4">
      <div className="flex justify-between print:hidden">
        <button className="btn-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Volver
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Imprimir
        </button>
      </div>

      <article className="card p-6 sm:p-8 space-y-6 text-sm text-gray-800 print:border-0 print:shadow-none print:p-0">
        <header className="border-b border-gray-200 pb-4">
          <h1 className="text-xl font-bold text-gray-900">{daycare?.name ?? "Clínica"}</h1>
          <p className="text-muted">
            {stay.status === "ALTA" ? "Hoja de alta hospitalaria" : "Resumen de hospitalización"}
          </p>
        </header>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Paciente</dt>
            <dd className="font-medium text-gray-900">{pet.name}</dd>
            <dd>
              {pet.species === "cat" ? "Gato" : pet.species === "dog" ? "Perro" : pet.species}
              {pet.breed ? ` · ${pet.breed}` : ""} · {petAge(pet.birthdate)}
              {pet.weight ? ` · ${pet.weight} kg` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Tutor</dt>
            <dd className="font-medium text-gray-900">
              {visit.client.firstName} {visit.client.lastName}
            </dd>
            <dd>{visit.client.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Ingreso</dt>
            <dd>
              {fmtDateTime(stay.admittedAt)} · {stay.room.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Alta</dt>
            <dd>{stay.dischargedAt ? fmtDateTime(stay.dischargedAt) : "Sigue ingresado"}</dd>
          </div>
        </dl>

        <Block title="Motivo del ingreso" text={stay.reason} />
        {stay.dischargeSummary && <Block title="Resumen" text={stay.dischargeSummary} />}

        {stay.orders.length > 0 && (
          <div>
            <p className="text-xs text-muted mb-1">Tratamiento recibido</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {stay.orders.map((order) => (
                <li key={order.id}>
                  {[order.description, order.dose, order.everyHours && `cada ${order.everyHours} h`]
                    .filter(Boolean)
                    .join(" · ")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {stay.homeCareInstructions && (
          <Block title="Cuidados en casa" text={stay.homeCareInstructions} />
        )}

        <footer className="pt-12">
          <div className="w-64 border-t border-gray-400 pt-2">
            <p className="font-medium text-gray-900">
              {visit.veterinarian?.name ?? "Médico veterinario"}
            </p>
            {visit.veterinarian?.licenseNumber && (
              <p>Matrícula {visit.veterinarian.licenseNumber}</p>
            )}
          </div>
        </footer>
      </article>
    </div>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-xs text-muted mb-1">{title}</p>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}
