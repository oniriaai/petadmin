import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { PageLoader } from "../../components/ui/Spinner";
import { useAuth } from "../../lib/auth-context";
import { fmt } from "../../lib/utils";
import { errorMessage, petAge, veterinariaApi, type PrintablePrescription } from "./api";

/** One prescription laid out for paper. The app's navigation is hidden when printing. */
export function RecetaPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { daycare } = useAuth();
  const [prescription, setPrescription] = useState<PrintablePrescription | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    veterinariaApi
      .prescription(id)
      .then(setPrescription)
      .catch((e) => setError(errorMessage(e, "No se pudo cargar la receta")));
  }, [id]);

  if (error) {
    return (
      <p className="p-6 text-sm text-danger" role="alert">
        {error}
      </p>
    );
  }
  if (!prescription) return <PageLoader />;

  const { pet, veterinarian } = prescription;

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

      <article className="card p-6 sm:p-8 space-y-6 text-sm text-ink print:border-0 print:shadow-none print:p-0">
        <header className="flex flex-wrap justify-between gap-4 border-b border-line-subtle pb-4">
          <div>
            <h1 className="font-display text-2xl leading-tight text-ink">
              {daycare?.name ?? "Clínica"}
            </h1>
            <p className="text-muted">Receta veterinaria</p>
          </div>
          <p className="text-right">
            <span className="block text-xs text-muted">Fecha</span>
            {fmt(prescription.issuedAt, "d 'de' MMMM 'de' yyyy")}
          </p>
        </header>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Paciente</dt>
            <dd className="font-medium text-ink">{pet.name}</dd>
            <dd>
              {pet.species === "cat" ? "Gato" : pet.species === "dog" ? "Perro" : pet.species}
              {pet.breed ? ` · ${pet.breed}` : ""} · {petAge(pet.birthdate)}
              {pet.weight ? ` · ${pet.weight} kg` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Tutor</dt>
            <dd className="font-medium text-ink">
              {pet.client.firstName} {pet.client.lastName}
            </dd>
            <dd>{[pet.client.idNumber, pet.client.phone].filter(Boolean).join(" · ") || "—"}</dd>
          </div>
        </dl>

        <ol className="space-y-4 list-decimal pl-5">
          {prescription.items.map((item) => (
            <li key={item.id}>
              <p className="font-semibold text-ink">
                {item.drug}
                {item.presentation ? ` (${item.presentation})` : ""}
              </p>
              <p>
                {item.dose}, {item.frequency}
                {item.durationDays ? `, durante ${item.durationDays} días` : ""}
                {item.route ? `. Vía ${item.route}` : ""}
              </p>
              {item.instructions && <p className="text-muted">{item.instructions}</p>}
            </li>
          ))}
        </ol>

        {prescription.notes && (
          <div>
            <p className="text-xs text-muted">Indicaciones</p>
            <p>{prescription.notes}</p>
          </div>
        )}

        <footer className="pt-12">
          <div className="w-64 border-t border-line pt-2">
            <p className="font-medium text-ink">{veterinarian?.name ?? "Médico veterinario"}</p>
            {veterinarian?.licenseNumber && <p>Matrícula {veterinarian.licenseNumber}</p>}
          </div>
        </footer>
      </article>
    </div>
  );
}
