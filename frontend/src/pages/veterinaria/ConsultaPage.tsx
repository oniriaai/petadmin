import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, FileText, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { PAYMENT_METHODS, fmt, fmtCurrency, fmtDateTime } from "../../lib/utils";
import {
  TRIAGE,
  VISIT_STATUS,
  VISIT_TYPES,
  errorMessage,
  petAge,
  veterinariaApi,
  type VetService,
  type VetStaff,
  type VisitDetail,
} from "./api";

const SOAP_FIELDS = [
  ["anamnesis", "Anamnesis", "Lo que cuenta el tutor: evolución, dieta, medicación previa"],
  ["physicalExam", "Examen físico", "Hallazgos por sistema"],
  ["assessment", "Valoración", "Interpretación clínica y diagnósticos diferenciales"],
  ["plan", "Plan", "Tratamiento, exámenes solicitados e indicaciones para casa"],
] as const;
type SoapField = (typeof SOAP_FIELDS)[number][0];

const round2 = (value: number) => Math.round(value * 100) / 100;
const numberOrUndefined = (value: string) => (value.trim() === "" ? undefined : Number(value));

export function ConsultaPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [services, setServices] = useState<VetService[]>([]);
  const [staff, setStaff] = useState<VetStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [soap, setSoap] = useState<Record<SoapField, string>>({
    anamnesis: "",
    physicalExam: "",
    assessment: "",
    plan: "",
  });
  const [reason, setReason] = useState("");
  const [veterinarianId, setVeterinarianId] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [savingRecord, setSavingRecord] = useState(false);
  const [showClose, setShowClose] = useState(false);

  const apply = useCallback((loaded: VisitDetail) => {
    setVisit(loaded);
    setSoap({
      anamnesis: loaded.anamnesis ?? "",
      physicalExam: loaded.physicalExam ?? "",
      assessment: loaded.assessment ?? "",
      plan: loaded.plan ?? "",
    });
    setReason(loaded.reason ?? "");
    setVeterinarianId(loaded.veterinarian?.id ?? "");
    setFollowUpDate(loaded.followUpDate ? loaded.followUpDate.slice(0, 10) : "");
  }, []);

  const reload = useCallback(async () => {
    try {
      // Reloads only the lists; the text being typed into the record is left alone.
      setVisit(await veterinariaApi.visit(id));
    } catch (e) {
      setError(errorMessage(e, "No se pudo cargar la consulta"));
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([veterinariaApi.visit(id), veterinariaApi.services(), veterinariaApi.staff()])
      .then(([loaded, loadedServices, loadedStaff]) => {
        apply(loaded);
        setServices(loadedServices);
        setStaff(loadedStaff);
      })
      .catch((e) => setError(errorMessage(e, "No se pudo cargar la consulta")))
      .finally(() => setLoading(false));
  }, [id, apply]);

  if (loading) return <PageLoader />;
  if (!visit) {
    return (
      <div className="p-6">
        <p className="text-red-600 text-sm" role="alert">
          {error || "Consulta no encontrada"}
        </p>
        <Link to="/veterinaria" className="btn-secondary mt-4 inline-flex">
          Volver a la agenda
        </Link>
      </div>
    );
  }

  const locked = ["CERRADA", "CANCELADA", "NO_ASISTIO"].includes(visit.status);
  const subtotal = round2(visit.charges.reduce((sum, c) => sum + c.quantity * c.unitPrice, 0));
  const run = async (action: () => Promise<unknown>, failure: string) => {
    setError("");
    setNotice("");
    try {
      await action();
      await reload();
    } catch (e) {
      setError(errorMessage(e, failure));
    }
  };

  const saveRecord = async (): Promise<boolean> => {
    setSavingRecord(true);
    setError("");
    try {
      apply(
        await veterinariaApi.updateVisit(visit.id, {
          ...soap,
          reason,
          veterinarianId: veterinarianId || null,
          followUpDate: followUpDate ? new Date(`${followUpDate}T12:00:00`).toISOString() : null,
        }),
      );
      setNotice("Registro clínico guardado.");
      return true;
    } catch (e) {
      setError(errorMessage(e, "No se pudo guardar el registro clínico"));
      return false;
    } finally {
      setSavingRecord(false);
    }
  };

  const setStatus = (status: "EN_CONSULTA" | "CANCELADA" | "NO_ASISTIO") =>
    run(() => veterinariaApi.setStatus(visit.id, status), "No se pudo cambiar el estado");

  const { pet, client, reservation } = visit;
  const status = VISIT_STATUS[visit.status];

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <button
              className="icon-button -ml-2 text-gray-500 hover:text-gray-800"
              onClick={() => navigate("/veterinaria")}
              aria-label="Volver a la agenda"
            >
              <ArrowLeft size={20} />
            </button>
            {pet.name}
            <Badge color={status.color}>{status.label}</Badge>
            {visit.triage !== "NORMAL" && (
              <Badge color={TRIAGE[visit.triage]?.color}>{TRIAGE[visit.triage]?.label}</Badge>
            )}
          </span>
        }
        subtitle={`${VISIT_TYPES[visit.type] ?? visit.type} · ${fmtDateTime(reservation.checkIn)}${
          reservation.room ? ` · ${reservation.room.name}` : ""
        }`}
        actions={
          <>
            <Link to={`/veterinaria/pacientes/${pet.id}`} className="btn-secondary">
              <FileText size={16} /> Historia clínica
            </Link>
            {visit.status === "PROGRAMADA" && (
              <button className="btn-secondary" onClick={() => setStatus("NO_ASISTIO")}>
                No asistió
              </button>
            )}
            {!locked && visit.status !== "EN_CONSULTA" && (
              <button className="btn-secondary" onClick={() => setStatus("EN_CONSULTA")}>
                Iniciar consulta
              </button>
            )}
            {!locked && (
              <button
                className="btn-primary"
                disabled={savingRecord}
                // Closing freezes the record, so whatever is typed is saved first.
                onClick={async () => (await saveRecord()) && setShowClose(true)}
              >
                <Check size={16} /> Cerrar y cobrar
              </button>
            )}
          </>
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
      {notice && (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {notice}
        </div>
      )}

      <div className="card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div>
          <p className="text-xs text-muted">Paciente</p>
          <p className="font-medium text-gray-900">
            {pet.species === "cat" ? "Gato" : pet.species === "dog" ? "Perro" : pet.species}
            {pet.breed ? ` · ${pet.breed}` : ""}
          </p>
          <p className="text-muted">
            {pet.sex === "F" ? "Hembra" : "Macho"}
            {pet.isNeutered ? " esterilizado" : ""} · {petAge(pet.birthdate)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Peso</p>
          <p className="font-medium text-gray-900">{pet.weight ? `${pet.weight} kg` : "—"}</p>
          {pet.bloodType && <p className="text-muted">Grupo {pet.bloodType}</p>}
        </div>
        <div>
          <p className="text-xs text-muted">Tutor</p>
          <p className="font-medium text-gray-900">
            {client.firstName} {client.lastName}
          </p>
          <p className="text-muted">{client.phone ?? client.whatsapp ?? "Sin teléfono"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Atiende</p>
          <p className="font-medium text-gray-900">{visit.veterinarian?.name ?? "Sin asignar"}</p>
        </div>
        {(pet.allergies || pet.chronicConditions) && (
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
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-4 space-y-4 lg:col-span-2" aria-label="Registro clínico">
          <h2 className="font-semibold text-gray-900">Registro clínico</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="c-reason">
                Motivo de consulta
              </label>
              <input
                id="c-reason"
                className="input"
                value={reason}
                disabled={locked}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {SOAP_FIELDS.map(([field, label, hint]) => (
              <div key={field} className="sm:col-span-2">
                <label className="label" htmlFor={`c-${field}`}>
                  {label}
                </label>
                <textarea
                  id={`c-${field}`}
                  className="input"
                  rows={3}
                  placeholder={hint}
                  value={soap[field]}
                  disabled={locked}
                  onChange={(e) => setSoap((current) => ({ ...current, [field]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="label" htmlFor="c-vet">
                Veterinario
              </label>
              <select
                id="c-vet"
                className="input"
                value={veterinarianId}
                disabled={locked}
                onChange={(e) => setVeterinarianId(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {staff
                  .filter((member) => !member.isExternal)
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="c-follow">
                Próximo control
              </label>
              <input
                id="c-follow"
                type="date"
                className="input"
                value={followUpDate}
                disabled={locked}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
            </div>
          </div>
          {!locked && (
            <div className="flex justify-end">
              <button className="btn-primary" onClick={saveRecord} disabled={savingRecord}>
                {savingRecord ? <Spinner size={16} /> : "Guardar registro"}
              </button>
            </div>
          )}
        </section>

        <div className="space-y-5">
          <VitalsPanel visit={visit} locked={locked} run={run} />
          <DiagnosesPanel visit={visit} locked={locked} run={run} />
        </div>
      </div>

      <ChargesPanel
        visit={visit}
        services={services}
        locked={locked}
        subtotal={subtotal}
        run={run}
        onPaid={apply}
        onError={setError}
      />

      {!locked && (
        <div className="flex justify-end">
          <button
            className="btn-ghost text-red-600"
            onClick={() => {
              if (window.confirm("¿Cancelar esta consulta? Su hueco en la agenda quedará libre.")) {
                setStatus("CANCELADA");
              }
            }}
          >
            Cancelar consulta
          </button>
        </div>
      )}

      <CloseModal
        open={showClose}
        onClose={() => setShowClose(false)}
        visit={visit}
        subtotal={subtotal}
        onClosed={(closed) => {
          setShowClose(false);
          apply(closed);
          setNotice("Consulta cerrada y cobro registrado.");
        }}
      />
    </div>
  );
}

type Run = (action: () => Promise<unknown>, failure: string) => Promise<void>;

function VitalsPanel({ visit, locked, run }: { visit: VisitDetail; locked: boolean; run: Run }) {
  const empty = { weightKg: "", temperatureC: "", heartRate: "", respiratoryRate: "" };
  const [form, setForm] = useState(empty);
  const fields = [
    ["weightKg", "Peso (kg)", "0.1"],
    ["temperatureC", "Temp. (°C)", "0.1"],
    ["heartRate", "FC (lpm)", "1"],
    ["respiratoryRate", "FR (rpm)", "1"],
  ] as const;

  const submit = async () => {
    const body = Object.fromEntries(
      Object.entries(form)
        .map(([key, value]) => [key, numberOrUndefined(value)])
        .filter(([, value]) => value !== undefined),
    );
    if (Object.keys(body).length === 0) return;
    await run(() => veterinariaApi.addVitals(visit.id, body), "No se pudieron guardar los signos");
    setForm(empty);
  };

  return (
    <section className="card p-4 space-y-3" aria-label="Signos vitales">
      <h2 className="font-semibold text-gray-900">Signos vitales</h2>
      {visit.vitals.length === 0 ? (
        <p className="text-sm text-muted">Sin tomas en esta consulta.</p>
      ) : (
        <ul className="space-y-2">
          {visit.vitals.map((vitals) => (
            <li key={vitals.id} className="flex items-start justify-between gap-2 text-sm">
              <div>
                <p className="text-xs text-muted">{fmt(vitals.takenAt, "HH:mm")}</p>
                <p className="text-gray-800">
                  {[
                    vitals.weightKg != null && `${vitals.weightKg} kg`,
                    vitals.temperatureC != null && `${vitals.temperatureC} °C`,
                    vitals.heartRate != null && `FC ${vitals.heartRate}`,
                    vitals.respiratoryRate != null && `FR ${vitals.respiratoryRate}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {!locked && (
                <button
                  className="text-gray-400 hover:text-red-600 p-1"
                  aria-label="Quitar toma de signos vitales"
                  onClick={() =>
                    run(
                      () => veterinariaApi.removeChild(visit.id, "vitals", vitals.id),
                      "No se pudo quitar la toma",
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {fields.map(([key, label, step]) => (
              <div key={key}>
                <label className="label" htmlFor={`v-${key}`}>
                  {label}
                </label>
                <input
                  id={`v-${key}`}
                  type="number"
                  step={step}
                  min={0}
                  className="input"
                  value={form[key]}
                  onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <button className="btn-secondary btn-sm w-full" onClick={submit}>
            <Plus size={15} /> Registrar toma
          </button>
        </>
      )}
    </section>
  );
}

function DiagnosesPanel({ visit, locked, run }: { visit: VisitDetail; locked: boolean; run: Run }) {
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("PRESUNTIVO");
  const [isChronic, setIsChronic] = useState(false);

  const submit = async () => {
    if (!description.trim()) return;
    await run(
      () => veterinariaApi.addDiagnosis(visit.id, { description, kind, isChronic }),
      "No se pudo guardar el diagnóstico",
    );
    setDescription("");
    setIsChronic(false);
  };

  return (
    <section className="card p-4 space-y-3" aria-label="Diagnósticos">
      <h2 className="font-semibold text-gray-900">Diagnósticos</h2>
      {visit.diagnoses.length === 0 ? (
        <p className="text-sm text-muted">Sin diagnósticos registrados.</p>
      ) : (
        <ul className="space-y-2">
          {visit.diagnoses.map((diagnosis) => (
            <li key={diagnosis.id} className="flex items-start justify-between gap-2 text-sm">
              <div>
                <p className="text-gray-800">{diagnosis.description}</p>
                <p className="text-xs text-muted">
                  {diagnosis.kind === "DEFINITIVO" ? "Definitivo" : "Presuntivo"}
                  {diagnosis.isChronic ? " · crónico" : ""}
                </p>
              </div>
              {!locked && (
                <button
                  className="text-gray-400 hover:text-red-600 p-1"
                  aria-label={`Quitar diagnóstico ${diagnosis.description}`}
                  onClick={() =>
                    run(
                      () => veterinariaApi.removeChild(visit.id, "diagnoses", diagnosis.id),
                      "No se pudo quitar el diagnóstico",
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <>
          <input
            className="input"
            placeholder="Nuevo diagnóstico"
            aria-label="Nuevo diagnóstico"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <select
              className="input"
              aria-label="Tipo de diagnóstico"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="PRESUNTIVO">Presuntivo</option>
              <option value="DEFINITIVO">Definitivo</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm text-gray-700 whitespace-nowrap">
              <input
                type="checkbox"
                checked={isChronic}
                onChange={(e) => setIsChronic(e.target.checked)}
              />
              Crónico
            </label>
          </div>
          <button className="btn-secondary btn-sm w-full" onClick={submit}>
            <Plus size={15} /> Añadir diagnóstico
          </button>
        </>
      )}
    </section>
  );
}

function ChargesPanel({
  visit,
  services,
  locked,
  subtotal,
  run,
  onPaid,
  onError,
}: {
  visit: VisitDetail;
  services: VetService[];
  locked: boolean;
  subtotal: number;
  run: Run;
  onPaid: (visit: VisitDetail) => void;
  onError: (message: string) => void;
}) {
  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("EFECTIVO");
  const { reservation } = visit;
  const closed = visit.status === "CERRADA";

  const pickService = (id: string) => {
    setServiceId(id);
    const service = services.find((s) => s.id === id);
    if (service) {
      setDescription(service.name);
      setUnitPrice(String(service.basePrice));
    }
  };

  const add = async () => {
    if (!serviceId && !description.trim()) return;
    await run(
      () =>
        veterinariaApi.addCharge(visit.id, {
          ...(serviceId ? { vetServiceId: serviceId } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
          quantity: Number(quantity) || 1,
          ...(unitPrice.trim() !== "" ? { unitPrice: Number(unitPrice) } : {}),
        }),
      "No se pudo añadir el cargo",
    );
    setServiceId("");
    setDescription("");
    setQuantity("1");
    setUnitPrice("");
  };

  const pay = async () => {
    try {
      onPaid(
        await veterinariaApi.pay(visit.id, {
          amount: Number(payAmount) || reservation.pendingAmount,
          paymentMethod: payMethod,
        }),
      );
      setPayAmount("");
    } catch (e) {
      onError(errorMessage(e, "No se pudo registrar el abono"));
    }
  };

  return (
    <section className="card overflow-hidden" aria-label="Cargos">
      <div className="p-4 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Cargos de la consulta</h2>
        <p className="text-sm text-muted">
          Subtotal <span className="font-semibold text-gray-900">{fmtCurrency(subtotal)}</span>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Concepto</th>
              <th className="table-th">Cantidad</th>
              <th className="table-th">Precio</th>
              <th className="table-th">Importe</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {visit.charges.length === 0 && (
              <tr className="table-tr">
                <td className="table-td text-muted" colSpan={5}>
                  Todavía no hay cargos.
                </td>
              </tr>
            )}
            {visit.charges.map((charge) => (
              <tr key={charge.id} className="table-tr">
                <td className="table-td">{charge.description}</td>
                <td className="table-td tabular-nums">{charge.quantity}</td>
                <td className="table-td tabular-nums">{fmtCurrency(charge.unitPrice)}</td>
                <td className="table-td tabular-nums">
                  {fmtCurrency(charge.quantity * charge.unitPrice)}
                </td>
                <td className="table-td text-right">
                  {!locked && (
                    <button
                      className="text-gray-400 hover:text-red-600 p-1"
                      aria-label={`Quitar cargo ${charge.description}`}
                      onClick={() =>
                        run(
                          () => veterinariaApi.removeChild(visit.id, "charges", charge.id),
                          "No se pudo quitar el cargo",
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!locked && (
        <div className="p-4 border-t border-gray-100 grid gap-3 sm:grid-cols-12 items-end">
          <div className="sm:col-span-3">
            <label className="label" htmlFor="ch-service">
              Del catálogo
            </label>
            <select
              id="ch-service"
              className="input"
              value={serviceId}
              onChange={(e) => pickService(e.target.value)}
            >
              <option value="">Cargo libre</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-4">
            <label className="label" htmlFor="ch-description">
              Concepto
            </label>
            <input
              id="ch-description"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="sm:col-span-1">
            <label className="label" htmlFor="ch-quantity">
              Cant.
            </label>
            <input
              id="ch-quantity"
              type="number"
              min={0}
              step="0.5"
              className="input"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ch-price">
              Precio
            </label>
            <input
              id="ch-price"
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <button className="btn-secondary w-full" onClick={add}>
              <Plus size={15} /> Añadir
            </button>
          </div>
        </div>
      )}

      {closed && (
        <div className="p-4 border-t border-gray-100 space-y-3 text-sm">
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(
              [
                ["Subtotal", reservation.basePrice],
                ["Descuento", reservation.discountAmount],
                [`IVA ${reservation.vatPercent}%`, reservation.vatAmount],
                ["Total", reservation.totalAmount],
                ["Saldo", reservation.pendingAmount],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">{fmtCurrency(value)}</dd>
              </div>
            ))}
          </dl>
          {reservation.incomes.length > 0 && (
            <ul className="text-muted">
              {reservation.incomes.map((income) => (
                <li key={income.id}>
                  {fmtDateTime(income.date)} · {income.paymentMethod} · {fmtCurrency(income.total)}
                </li>
              ))}
            </ul>
          )}
          {reservation.pendingAmount > 0.005 && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label" htmlFor="pay-amount">
                  Abono
                </label>
                <input
                  id="pay-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  className="input w-32"
                  placeholder={String(reservation.pendingAmount)}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="pay-method">
                  Método
                </label>
                <select
                  id="pay-method"
                  className="input"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </select>
              </div>
              <button className="btn-primary" onClick={pay}>
                Registrar abono
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CloseModal({
  open,
  onClose,
  visit,
  subtotal,
  onClosed,
}: {
  open: boolean;
  onClose: () => void;
  visit: VisitDetail;
  subtotal: number;
  onClosed: (visit: VisitDetail) => void;
}) {
  const [discount, setDiscount] = useState("0");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDiscount("0");
      setAmountPaid("");
      setError("");
    }
  }, [open]);

  const discountAmount = Math.min(Number(discount) || 0, subtotal);
  const vat = round2((subtotal - discountAmount) * (visit.reservation.vatPercent / 100));
  const total = round2(subtotal - discountAmount + vat);
  const paid = amountPaid.trim() === "" ? total : Number(amountPaid) || 0;

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      onClosed(
        await veterinariaApi.close(visit.id, { discountAmount, amountPaid: paid, paymentMethod }),
      );
    } catch (e) {
      setError(errorMessage(e, "No se pudo cerrar la consulta"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cerrar y cobrar"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Volver
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving || paid > total}>
            {saving ? <Spinner size={16} /> : `Cerrar y cobrar ${fmtCurrency(paid)}`}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {error && (
          <div
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}
        <p className="text-muted">
          Al cerrar, el registro clínico y los cargos quedan congelados y ya no se pueden editar.
        </p>
        <dl className="space-y-1">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{fmtCurrency(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>IVA {visit.reservation.vatPercent}%</dt>
            <dd className="tabular-nums">{fmtCurrency(vat)}</dd>
          </div>
          <div className="flex justify-between font-semibold text-gray-900 text-base">
            <dt>Total</dt>
            <dd className="tabular-nums">{fmtCurrency(total)}</dd>
          </div>
        </dl>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="cl-discount">
              Descuento
            </label>
            <input
              id="cl-discount"
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="cl-paid">
              Cobra ahora
            </label>
            <input
              id="cl-paid"
              type="number"
              min={0}
              step="0.01"
              className="input"
              placeholder={String(total)}
              aria-invalid={paid > total}
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="cl-method">
              Método
            </label>
            <select
              id="cl-method"
              className="input"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
          </div>
        </div>
        {paid > total && <p className="text-red-600">El cobro no puede superar el total.</p>}
        {paid < total && (
          <p className="text-muted">Quedará un saldo pendiente de {fmtCurrency(total - paid)}.</p>
        )}
      </div>
    </Modal>
  );
}
