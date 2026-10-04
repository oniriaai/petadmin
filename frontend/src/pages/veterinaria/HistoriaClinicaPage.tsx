import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Pencil, Plus, Printer } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { fmt, fmtDateTime } from "../../lib/utils";
import {
  CONSENT_TYPES,
  LAB_FLAGS,
  PREVENTIVE_KINDS,
  PROCEDURE_KINDS,
  PROCEDURE_STATUS,
  VISIT_STATUS,
  VISIT_TYPES,
  errorMessage,
  petAge,
  veterinariaApi,
  type ClinicRoom,
  type PatientHistory,
  type VetService,
  type VetStaff,
} from "./api";
import { NuevaConsultaModal } from "./NuevaConsultaModal";

export function HistoriaClinicaPage() {
  const { petId = "" } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState<PatientHistory | null>(null);
  const [services, setServices] = useState<VetService[]>([]);
  const [staff, setStaff] = useState<VetStaff[]>([]);
  const [rooms, setRooms] = useState<ClinicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const load = useCallback(async () => {
    try {
      setHistory(await veterinariaApi.history(petId));
      setError("");
    } catch (e) {
      setError(errorMessage(e, "No se pudo cargar la historia clínica"));
    } finally {
      setLoading(false);
    }
  }, [petId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const openNew = async () => {
    try {
      if (services.length === 0) {
        const [loadedServices, loadedStaff, loadedRooms] = await Promise.all([
          veterinariaApi.services(),
          veterinariaApi.staff(),
          veterinariaApi.rooms(),
        ]);
        setServices(loadedServices);
        setStaff(loadedStaff);
        setRooms(loadedRooms);
      }
      setShowNew(true);
    } catch (e) {
      setError(errorMessage(e, "No se pudo cargar el catálogo de la clínica"));
    }
  };

  if (loading) return <PageLoader />;
  if (!history) {
    return (
      <div className="p-6">
        <p className="text-red-600 text-sm" role="alert">
          {error || "Paciente no encontrado"}
        </p>
        <Link to="/veterinaria/pacientes" className="btn-secondary mt-4 inline-flex">
          Volver a pacientes
        </Link>
      </div>
    );
  }

  const {
    pet,
    visits,
    vitals,
    chronicDiagnoses,
    preventives,
    prescriptions,
    hospitalizations,
    procedures,
    labOrders,
    consents,
  } = history;
  const weights = vitals.filter((v) => v.weightKg != null).slice(0, 8);
  const today = new Date();

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <button
              className="icon-button -ml-2 text-gray-500 hover:text-gray-800 print:hidden"
              onClick={() => navigate("/veterinaria/pacientes")}
              aria-label="Volver a pacientes"
            >
              <ArrowLeft size={20} />
            </button>
            {pet.name}
            {pet.deceasedAt && <Badge color="bg-gray-800 text-white">Fallecido</Badge>}
          </span>
        }
        subtitle={`Tutor: ${pet.client.firstName} ${pet.client.lastName}${
          pet.client.phone ? ` · ${pet.client.phone}` : ""
        }`}
        actions={
          <span className="flex flex-wrap gap-2 print:hidden">
            <button className="btn-secondary" onClick={() => window.print()}>
              <Printer size={16} /> Imprimir
            </button>
            <button className="btn-secondary" onClick={() => setShowEdit(true)}>
              <Pencil size={16} /> Datos clínicos
            </button>
            {!pet.deceasedAt && (
              <button className="btn-primary" onClick={openNew}>
                <Plus size={16} /> Nueva consulta
              </button>
            )}
          </span>
        }
      />

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div>
          <p className="text-xs text-muted">Especie y raza</p>
          <p className="font-medium text-gray-900">
            {pet.species === "cat" ? "Gato" : pet.species === "dog" ? "Perro" : pet.species}
            {pet.breed ? ` · ${pet.breed}` : ""}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Sexo y edad</p>
          <p className="font-medium text-gray-900">
            {pet.sex === "F" ? "Hembra" : "Macho"}
            {pet.isNeutered ? " esterilizado" : ""} · {petAge(pet.birthdate)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Peso y grupo sanguíneo</p>
          <p className="font-medium text-gray-900">
            {pet.weight ? `${pet.weight} kg` : "Sin peso"} · {pet.bloodType || "sin grupo"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Microchip</p>
          <p className="font-medium text-gray-900">{pet.microchip || "—"}</p>
        </div>
        {(pet.allergies || pet.chronicConditions || chronicDiagnoses.length > 0) && (
          <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 flex gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              {pet.allergies && (
                <p>
                  <strong>Alergias:</strong> {pet.allergies}
                </p>
              )}
              {pet.chronicConditions && (
                <p>
                  <strong>Condiciones crónicas:</strong> {pet.chronicConditions}
                </p>
              )}
              {chronicDiagnoses.length > 0 && (
                <p>
                  <strong>Diagnósticos crónicos:</strong>{" "}
                  {chronicDiagnoses.map((d) => d.description).join(", ")}
                </p>
              )}
            </div>
          </div>
        )}
        {pet.deceasedAt && (
          <p className="sm:col-span-2 lg:col-span-4 text-gray-700">
            Fallecido el {fmt(pet.deceasedAt)}
            {pet.deathCause ? `: ${pet.deathCause}` : ""}
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-3" aria-label="Consultas">
          <h2 className="font-semibold text-gray-900">Consultas ({visits.length})</h2>
          {visits.length === 0 && (
            <p className="card p-6 text-sm text-muted text-center">
              Este paciente todavía no tiene consultas en la clínica.
            </p>
          )}
          {visits.map((visit) => (
            <article key={visit.id} className="card p-4 space-y-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-gray-900">
                  {fmtDateTime(visit.reservation.checkIn)} · {VISIT_TYPES[visit.type] ?? visit.type}
                </p>
                <span className="flex items-center gap-2">
                  <Badge color={VISIT_STATUS[visit.status].color}>
                    {VISIT_STATUS[visit.status].label}
                  </Badge>
                  <Link
                    to={`/veterinaria/consultas/${visit.id}`}
                    className="btn-ghost btn-sm print:hidden"
                  >
                    Abrir
                  </Link>
                </span>
              </div>
              <p className="text-muted">{visit.veterinarian?.name ?? "Sin veterinario asignado"}</p>
              {visit.reason && (
                <p>
                  <strong>Motivo:</strong> {visit.reason}
                </p>
              )}
              {visit.diagnoses.length > 0 && (
                <p>
                  <strong>Diagnóstico:</strong>{" "}
                  {visit.diagnoses
                    .map((d) => `${d.description}${d.kind === "PRESUNTIVO" ? " (presuntivo)" : ""}`)
                    .join("; ")}
                </p>
              )}
              {visit.assessment && (
                <p>
                  <strong>Valoración:</strong> {visit.assessment}
                </p>
              )}
              {visit.plan && (
                <p>
                  <strong>Plan:</strong> {visit.plan}
                </p>
              )}
            </article>
          ))}
        </section>

        <div className="space-y-5">
          <section className="card p-4 space-y-2 text-sm" aria-label="Evolución del peso">
            <h2 className="font-semibold text-gray-900">Peso</h2>
            {weights.length === 0 ? (
              <p className="text-muted">Sin tomas de peso.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {weights.map((v) => (
                  <li key={v.id} className="flex justify-between py-1.5">
                    <span className="text-muted">{fmt(v.takenAt)}</span>
                    <span className="font-medium tabular-nums">{v.weightKg} kg</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4 space-y-2 text-sm" aria-label="Vacunas">
            <h2 className="font-semibold text-gray-900">Vacunas</h2>
            {pet.vaccinations.length === 0 ? (
              <p className="text-muted">Sin vacunas registradas.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {pet.vaccinations.map((vaccination) => {
                  const overdue = vaccination.nextDue && new Date(vaccination.nextDue) < today;
                  return (
                    <li key={vaccination.id} className="py-1.5">
                      <p className="font-medium text-gray-900">{vaccination.name}</p>
                      <p className="text-muted">
                        {fmt(vaccination.date)}
                        {vaccination.lotNumber ? ` · lote ${vaccination.lotNumber}` : ""}
                        {vaccination.nextDue && (
                          <span className={overdue ? "text-red-600 font-medium" : ""}>
                            {" "}
                            · refuerzo {fmt(vaccination.nextDue)}
                            {overdue ? " (vencido)" : ""}
                          </span>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card p-4 space-y-2 text-sm" aria-label="Desparasitaciones">
            <h2 className="font-semibold text-gray-900">Desparasitaciones y preventivos</h2>
            {preventives.length === 0 ? (
              <p className="text-muted">Sin preventivos registrados.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {preventives.map((preventive) => {
                  const overdue = preventive.nextDue && new Date(preventive.nextDue) < today;
                  return (
                    <li key={preventive.id} className="py-1.5">
                      <p className="font-medium text-gray-900">{preventive.product}</p>
                      <p className="text-muted">
                        {PREVENTIVE_KINDS[preventive.kind] ?? preventive.kind} ·{" "}
                        {fmt(preventive.date)}
                        {preventive.nextDue && (
                          <span className={overdue ? "text-red-600 font-medium" : ""}>
                            {" "}
                            · próxima {fmt(preventive.nextDue)}
                            {overdue ? " (vencida)" : ""}
                          </span>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {prescriptions.length > 0 && (
            <section className="card p-4 space-y-2 text-sm" aria-label="Recetas">
              <h2 className="font-semibold text-gray-900">Recetas</h2>
              <ul className="divide-y divide-gray-100">
                {prescriptions.map((prescription) => (
                  <li key={prescription.id} className="py-1.5">
                    <Link
                      to={`/veterinaria/recetas/${prescription.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {fmt(prescription.issuedAt)}
                    </Link>
                    <p className="text-muted">
                      {prescription.items.map((item) => item.drug).join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {labOrders.length > 0 && (
            <section className="card p-4 space-y-2 text-sm" aria-label="Laboratorio e imagen">
              <h2 className="font-semibold text-gray-900">Laboratorio e imagen</h2>
              <ul className="divide-y divide-gray-100">
                {labOrders.map((order) => (
                  <li key={order.id} className="py-1.5">
                    <p className="font-medium text-gray-900">
                      {order.test}{" "}
                      <span className="font-normal text-muted">{fmt(order.requestedAt)}</span>
                    </p>
                    <p className="text-muted">
                      {order.resultSummary ??
                        (order.status === "RESULTADO" ? "Con resultado" : "Pendiente de resultado")}
                    </p>
                    {order.values.map((value) => (
                      <p key={value.id} className="text-xs text-gray-700">
                        {value.analyte}: {value.value} {value.unit}
                        {value.flag && value.flag !== "NORMAL"
                          ? ` · ${LAB_FLAGS[value.flag]?.label ?? value.flag}`
                          : ""}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {procedures.length > 0 && (
            <section className="card p-4 space-y-2 text-sm" aria-label="Cirugías y procedimientos">
              <h2 className="font-semibold text-gray-900">Cirugías y procedimientos</h2>
              <ul className="divide-y divide-gray-100">
                {procedures.map((procedure) => (
                  <li key={procedure.id} className="py-1.5">
                    <p className="font-medium text-gray-900">
                      {procedure.name}{" "}
                      <span className="font-normal text-muted">
                        {fmt(procedure.startAt ?? procedure.createdAt)}
                      </span>
                    </p>
                    <p className="text-muted">
                      {PROCEDURE_KINDS[procedure.kind] ?? procedure.kind} ·{" "}
                      {PROCEDURE_STATUS[procedure.status]?.label ?? procedure.status}
                    </p>
                    {procedure.findings && <p className="text-gray-700">{procedure.findings}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hospitalizations.length > 0 && (
            <section className="card p-4 space-y-2 text-sm" aria-label="Hospitalizaciones">
              <h2 className="font-semibold text-gray-900">Hospitalizaciones</h2>
              <ul className="divide-y divide-gray-100">
                {hospitalizations.map((stay) => (
                  <li key={stay.id} className="py-1.5">
                    <Link
                      to={`/veterinaria/hospitalizacion/${stay.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {fmt(stay.admittedAt)}
                      {stay.dischargedAt ? ` – ${fmt(stay.dischargedAt)}` : " · ingresado"}
                    </Link>
                    <p className="text-muted">{stay.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {consents.length > 0 && (
            <section className="card p-4 space-y-2 text-sm" aria-label="Consentimientos">
              <h2 className="font-semibold text-gray-900">Consentimientos</h2>
              <ul className="divide-y divide-gray-100">
                {consents.map((consent) => (
                  <li key={consent.id} className="py-1.5">
                    <Link
                      to={`/veterinaria/consentimientos/${consent.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {CONSENT_TYPES[consent.type] ?? consent.type}
                    </Link>
                    <p className="text-muted">
                      {consent.signedAt
                        ? `Firmado por ${consent.signedByName} el ${fmt(consent.signedAt)}`
                        : "Sin firmar"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pet.documents.length > 0 && (
            <section className="card p-4 space-y-2 text-sm" aria-label="Documentos">
              <h2 className="font-semibold text-gray-900">Documentos</h2>
              <ul className="divide-y divide-gray-100">
                {pet.documents.map((document) => (
                  <li key={document.id} className="flex justify-between py-1.5">
                    <span>{document.name}</span>
                    <span className="text-muted">{fmt(document.uploadedAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <NuevaConsultaModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(visit) => navigate(`/veterinaria/consultas/${visit.id}`)}
        services={services}
        staff={staff}
        rooms={rooms}
        patientClientId={pet.client.id}
        patientPetId={pet.id}
        day={fmt(today, "yyyy-MM-dd")}
      />

      <PatientModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        history={history}
        onSaved={() => {
          setShowEdit(false);
          load();
        }}
      />
    </div>
  );
}

function PatientModal({
  open,
  onClose,
  history,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  history: PatientHistory;
  onSaved: () => void;
}) {
  const { pet } = history;
  const [bloodType, setBloodType] = useState("");
  const [allergies, setAllergies] = useState("");
  const [chronicConditions, setChronicConditions] = useState("");
  const [deceased, setDeceased] = useState(false);
  const [deceasedAt, setDeceasedAt] = useState("");
  const [deathCause, setDeathCause] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setBloodType(pet.bloodType ?? "");
    setAllergies(pet.allergies ?? "");
    setChronicConditions(pet.chronicConditions ?? "");
    setDeceased(Boolean(pet.deceasedAt));
    setDeceasedAt((pet.deceasedAt ?? new Date().toISOString()).slice(0, 10));
    setDeathCause(pet.deathCause ?? "");
    setError("");
  }, [open, pet]);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await veterinariaApi.updatePatient(pet.id, {
        bloodType: bloodType.trim() || null,
        allergies: allergies.trim() || null,
        chronicConditions: chronicConditions.trim() || null,
        deceasedAt: deceased ? new Date(`${deceasedAt}T12:00:00`).toISOString() : null,
        deathCause: deceased ? deathCause.trim() || null : null,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e, "No se pudieron guardar los datos clínicos"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Datos clínicos de ${pet.name}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? <Spinner size={16} /> : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}
        <div>
          <label className="label" htmlFor="pt-blood">
            Grupo sanguíneo
          </label>
          <input
            id="pt-blood"
            className="input"
            value={bloodType}
            onChange={(e) => setBloodType(e.target.value)}
            placeholder="DEA 1.1 positivo, tipo A…"
          />
        </div>
        <div>
          <label className="label" htmlFor="pt-allergies">
            Alergias
          </label>
          <textarea
            id="pt-allergies"
            className="input"
            rows={2}
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="pt-chronic">
            Condiciones crónicas
          </label>
          <textarea
            id="pt-chronic"
            className="input"
            rows={2}
            value={chronicConditions}
            onChange={(e) => setChronicConditions(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={deceased}
            onChange={(e) => setDeceased(e.target.checked)}
          />
          El paciente falleció
        </label>
        {deceased && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pt-deceased">
                Fecha
              </label>
              <input
                id="pt-deceased"
                type="date"
                className="input"
                value={deceasedAt}
                onChange={(e) => setDeceasedAt(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="pt-cause">
                Causa
              </label>
              <input
                id="pt-cause"
                className="input"
                value={deathCause}
                onChange={(e) => setDeathCause(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
