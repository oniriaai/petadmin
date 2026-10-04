import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BedDouble, Plus, Printer, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { fmtDateTime } from "../../lib/utils";
import {
  CONSENT_TYPES,
  LAB_FLAGS,
  LAB_KINDS,
  LAB_STATUS,
  PROCEDURE_KINDS,
  PROCEDURE_STATUS,
  errorMessage,
  veterinariaApi,
  type VisitDetail,
  type Ward,
} from "./api";

type Run = (action: () => Promise<unknown>, failure: string) => Promise<void>;

interface PanelProps {
  visit: VisitDetail;
  locked: boolean;
  run: Run;
}

/** Starting text for each consent, which the veterinarian edits before the tutor signs. */
const CONSENT_TEMPLATES: Record<string, string> = {
  CIRUGIA:
    "Autorizo la realización del procedimiento quirúrgico indicado. Se me han explicado su naturaleza, sus riesgos, las posibles complicaciones y las alternativas, y acepto los costos asociados.",
  ANESTESIA:
    "Autorizo la administración de anestesia o sedación. Se me ha explicado que todo procedimiento anestésico conlleva riesgos, incluso en pacientes sanos.",
  HOSPITALIZACION:
    "Autorizo la hospitalización de mi mascota y los tratamientos que el equipo médico considere necesarios durante su estancia, y acepto los costos diarios informados.",
  EUTANASIA:
    "Solicito y autorizo la eutanasia humanitaria de mi mascota. Declaro ser su propietario o responsable y que se me han explicado el procedimiento y su carácter irreversible.",
};

/** Surgeries and other procedures. A surgery or a euthanasia starts only with a signed consent. */
export function ProceduresPanel({ visit, locked, run }: PanelProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("PROCEDIMIENTO");
  const [asaRisk, setAsaRisk] = useState("");
  const [finishing, setFinishing] = useState<string | null>(null);
  const [findings, setFindings] = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    await run(
      () =>
        veterinariaApi.addProcedure(visit.id, {
          name: name.trim(),
          kind,
          ...(asaRisk ? { asaRisk: Number(asaRisk) } : {}),
        }),
      "No se pudo registrar el procedimiento",
    );
    setName("");
    setAsaRisk("");
  };

  const finish = async (id: string) => {
    await run(
      () =>
        veterinariaApi.finishProcedure(id, findings.trim() ? { findings: findings.trim() } : {}),
      "No se pudo finalizar el procedimiento",
    );
    setFinishing(null);
    setFindings("");
  };

  return (
    <section className="card p-4 space-y-3" aria-label="Procedimientos">
      <h2 className="section-title">Cirugías y procedimientos</h2>
      {visit.procedures.length === 0 ? (
        <p className="text-sm text-muted">Sin procedimientos en esta consulta.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {visit.procedures.map((procedure) => {
            const status = PROCEDURE_STATUS[procedure.status];
            return (
              <li key={procedure.id} className="rounded-lg border border-line-subtle p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{procedure.name}</p>
                    <p className="text-xs text-muted">
                      {PROCEDURE_KINDS[procedure.kind] ?? procedure.kind}
                      {procedure.asaRisk ? ` · ASA ${procedure.asaRisk}` : ""}
                      {procedure.veterinarian ? ` · ${procedure.veterinarian.name}` : ""}
                      {procedure.startAt ? ` · inicio ${fmtDateTime(procedure.startAt)}` : ""}
                    </p>
                  </div>
                  <Badge color={status?.color}>{status?.label ?? procedure.status}</Badge>
                </div>
                {procedure.findings && <p className="text-muted">{procedure.findings}</p>}
                {!locked && procedure.status === "PROGRAMADO" && (
                  <div className="flex gap-2">
                    <button
                      className="btn-primary btn-sm"
                      onClick={() =>
                        run(
                          () => veterinariaApi.startProcedure(procedure.id),
                          "No se pudo iniciar el procedimiento",
                        )
                      }
                    >
                      Iniciar
                    </button>
                    <button
                      className="text-muted hover:text-danger p-1"
                      aria-label={`Quitar ${procedure.name}`}
                      onClick={() =>
                        run(
                          () => veterinariaApi.removeChild(visit.id, "procedures", procedure.id),
                          "No se pudo quitar el procedimiento",
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
                {procedure.status === "EN_CURSO" &&
                  (finishing === procedure.id ? (
                    <div className="space-y-2">
                      <textarea
                        className="input"
                        rows={3}
                        placeholder="Hallazgos y técnica empleada"
                        aria-label="Hallazgos del procedimiento"
                        value={findings}
                        onChange={(e) => setFindings(e.target.value)}
                      />
                      {procedure.kind === "EUTANASIA" && (
                        <p className="text-xs text-danger-ink">
                          Al finalizar, el paciente quedará registrado como fallecido.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button className="btn-primary btn-sm" onClick={() => finish(procedure.id)}>
                          Confirmar fin
                        </button>
                        <button className="btn-ghost btn-sm" onClick={() => setFinishing(null)}>
                          Volver
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => setFinishing(procedure.id)}
                    >
                      Finalizar
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      {!locked && (
        <div className="grid gap-2 sm:grid-cols-12">
          <input
            className="input sm:col-span-5"
            placeholder="Procedimiento"
            aria-label="Nombre del procedimiento"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="input sm:col-span-3"
            aria-label="Tipo de procedimiento"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {Object.entries(PROCEDURE_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="input sm:col-span-2"
            aria-label="Riesgo anestésico ASA"
            value={asaRisk}
            onChange={(e) => setAsaRisk(e.target.value)}
          >
            <option value="">ASA</option>
            {[1, 2, 3, 4, 5].map((risk) => (
              <option key={risk} value={risk}>
                ASA {risk}
              </option>
            ))}
          </select>
          <button className="btn-secondary btn-sm sm:col-span-2" onClick={submit}>
            <Plus size={15} /> Añadir
          </button>
        </div>
      )}
    </section>
  );
}

/** Laboratory tests and imaging studies requested in this visit, with any result received. */
export function LabOrdersPanel({ visit, locked, run }: PanelProps) {
  const [kind, setKind] = useState("LABORATORIO");
  const [test, setTest] = useState("");
  const [externalLab, setExternalLab] = useState("");

  const submit = async () => {
    if (!test.trim()) return;
    await run(
      () =>
        veterinariaApi.addLabOrder(visit.id, {
          kind,
          test: test.trim(),
          ...(externalLab.trim() ? { externalLab: externalLab.trim() } : {}),
        }),
      "No se pudo solicitar el examen",
    );
    setTest("");
    setExternalLab("");
  };

  return (
    <section className="card p-4 space-y-3" aria-label="Laboratorio e imagen">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Laboratorio e imagen</h2>
        {visit.labOrders.length > 0 && (
          <Link to="/veterinaria/laboratorio" className="btn-ghost btn-sm">
            Registrar resultados
          </Link>
        )}
      </div>
      {visit.labOrders.length === 0 ? (
        <p className="text-sm text-muted">Sin exámenes solicitados.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {visit.labOrders.map((order) => {
            const status = LAB_STATUS[order.status];
            return (
              <li key={order.id} className="rounded-lg border border-line-subtle p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{order.test}</p>
                    <p className="text-xs text-muted">
                      {LAB_KINDS[order.kind] ?? order.kind}
                      {order.externalLab ? ` · ${order.externalLab}` : ""}
                    </p>
                  </div>
                  <span className="flex items-center gap-1">
                    <Badge color={status?.color}>{status?.label ?? order.status}</Badge>
                    {!locked && order.status === "SOLICITADO" && (
                      <button
                        className="text-muted hover:text-danger p-1"
                        aria-label={`Quitar ${order.test}`}
                        onClick={() =>
                          run(
                            () => veterinariaApi.removeChild(visit.id, "lab-orders", order.id),
                            "No se pudo quitar la orden",
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </span>
                </div>
                {order.resultSummary && <p className="text-muted">{order.resultSummary}</p>}
                {order.values.length > 0 && (
                  <ul className="text-xs text-muted space-y-0.5">
                    {order.values.map((value) => (
                      <li key={value.id}>
                        {value.analyte}: <span className="font-medium">{value.value}</span>{" "}
                        {value.unit}
                        {value.referenceRange ? ` (ref. ${value.referenceRange})` : ""}
                        {value.flag && value.flag !== "NORMAL" && (
                          <Badge color={LAB_FLAGS[value.flag]?.color} className="ml-2">
                            {LAB_FLAGS[value.flag]?.label ?? value.flag}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!locked && (
        <div className="grid gap-2 sm:grid-cols-12">
          <select
            className="input sm:col-span-3"
            aria-label="Tipo de examen"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {Object.entries(LAB_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            className="input sm:col-span-4"
            placeholder="Examen o estudio"
            aria-label="Examen o estudio"
            value={test}
            onChange={(e) => setTest(e.target.value)}
          />
          <input
            className="input sm:col-span-3"
            placeholder="Laboratorio externo"
            aria-label="Laboratorio externo"
            value={externalLab}
            onChange={(e) => setExternalLab(e.target.value)}
          />
          <button className="btn-secondary btn-sm sm:col-span-2" onClick={submit}>
            <Plus size={15} /> Solicitar
          </button>
        </div>
      )}
    </section>
  );
}

/** The tutor's informed consents: drafted here, printed, then recorded as signed. */
export function ConsentsPanel({ visit, locked, run }: PanelProps) {
  const tutor = `${visit.client.firstName} ${visit.client.lastName}`.trim();
  const [type, setType] = useState("CIRUGIA");
  const [text, setText] = useState(CONSENT_TEMPLATES.CIRUGIA);
  const [drafting, setDrafting] = useState(false);
  const [signing, setSigning] = useState<string | null>(null);
  const [signedBy, setSignedBy] = useState(tutor);

  const pickType = (next: string) => {
    setType(next);
    setText(CONSENT_TEMPLATES[next] ?? "");
  };

  const submit = async () => {
    if (!text.trim()) return;
    await run(
      () => veterinariaApi.addConsent(visit.id, { type, text: text.trim() }),
      "No se pudo crear el consentimiento",
    );
    setDrafting(false);
  };

  const sign = async (id: string) => {
    if (!signedBy.trim()) return;
    await run(
      () => veterinariaApi.signConsent(id, signedBy.trim()),
      "No se pudo registrar la firma",
    );
    setSigning(null);
  };

  return (
    <section className="card p-4 space-y-3" aria-label="Consentimientos">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Consentimientos</h2>
        {!locked && !drafting && (
          <button className="btn-secondary btn-sm" onClick={() => setDrafting(true)}>
            <Plus size={15} /> Nuevo
          </button>
        )}
      </div>
      {visit.consents.length === 0 && !drafting && (
        <p className="text-sm text-muted">Sin consentimientos en esta consulta.</p>
      )}
      <ul className="space-y-2 text-sm">
        {visit.consents.map((consent) => (
          <li key={consent.id} className="rounded-lg border border-line-subtle p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-ink">{CONSENT_TYPES[consent.type] ?? consent.type}</p>
              <span className="flex items-center gap-1">
                {consent.signedAt ? (
                  <Badge color="bg-success-soft text-success-ink">Firmado</Badge>
                ) : (
                  <Badge color="bg-warning-soft text-warning-ink">Sin firmar</Badge>
                )}
                <Link
                  to={`/veterinaria/consentimientos/${consent.id}`}
                  className="btn-ghost btn-sm"
                >
                  <Printer size={15} /> Imprimir
                </Link>
                {!locked && !consent.signedAt && (
                  <button
                    className="text-muted hover:text-danger p-1"
                    aria-label={`Eliminar consentimiento de ${CONSENT_TYPES[consent.type]}`}
                    onClick={() =>
                      run(
                        () => veterinariaApi.removeChild(visit.id, "consents", consent.id),
                        "No se pudo eliminar el consentimiento",
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </span>
            </div>
            {consent.signedAt ? (
              <p className="text-xs text-muted">
                {consent.signedByName} · {fmtDateTime(consent.signedAt)}
              </p>
            ) : signing === consent.id ? (
              <div className="flex flex-wrap gap-2">
                <input
                  className="input flex-1 min-w-[12rem]"
                  aria-label="Nombre de quien firma"
                  value={signedBy}
                  onChange={(e) => setSignedBy(e.target.value)}
                />
                <button className="btn-primary btn-sm" onClick={() => sign(consent.id)}>
                  Confirmar firma
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setSigning(null)}>
                  Volver
                </button>
              </div>
            ) : (
              <button className="btn-secondary btn-sm" onClick={() => setSigning(consent.id)}>
                Registrar firma del tutor
              </button>
            )}
          </li>
        ))}
      </ul>
      {drafting && (
        <div className="space-y-2">
          <select
            className="input"
            aria-label="Tipo de consentimiento"
            value={type}
            onChange={(e) => pickType(e.target.value)}
          >
            {Object.entries(CONSENT_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <textarea
            className="input"
            rows={5}
            aria-label="Texto del consentimiento"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setDrafting(false)}>
              Descartar
            </button>
            <button className="btn-primary btn-sm" onClick={submit}>
              Crear consentimiento
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Admits the patient to a ward, or shows the stay this visit already opened. */
export function AdmissionPanel({ visit, locked, run }: PanelProps) {
  const active = visit.hospitalizations.find((stay) => stay.status === "INGRESADO");
  const past = visit.hospitalizations.filter((stay) => stay.status === "ALTA");
  const [wards, setWards] = useState<Ward[]>([]);
  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [reason, setReason] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    veterinariaApi
      .wards()
      .then((loaded) => {
        setWards(loaded);
        setRoomId((current) => current || loaded.find((w) => w.occupied < w.capacity)?.id || "");
      })
      .catch((e) => setError(errorMessage(e, "No se pudieron cargar las salas")));
  }, [open]);

  const submit = async () => {
    if (!roomId || !reason.trim()) {
      setError("Elige una sala e indica el motivo del ingreso.");
      return;
    }
    setError("");
    await run(
      () =>
        veterinariaApi.admit(visit.id, {
          roomId,
          reason: reason.trim(),
          dailyRate: Number(dailyRate) || 0,
        }),
      "No se pudo ingresar al paciente",
    );
    setOpen(false);
    setReason("");
  };

  return (
    <section className="card p-4 space-y-3" aria-label="Hospitalización">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Hospitalización</h2>
        {!locked && !active && !open && (
          <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
            <BedDouble size={15} /> Ingresar
          </button>
        )}
      </div>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {active && (
        <div className="rounded-lg border border-veterinary-200 bg-veterinary-50 p-3 text-sm">
          <p className="font-medium text-ink">
            Ingresado en {active.room.name} desde {fmtDateTime(active.admittedAt)}
          </p>
          <p className="text-muted">{active.reason}</p>
          <p className="text-xs text-muted mt-1">
            La consulta se cierra y se cobra después del alta, que añade los días de estancia.
          </p>
          <Link to="/veterinaria/hospitalizacion" className="btn-secondary btn-sm mt-2 inline-flex">
            Ir a la hoja de tratamiento
          </Link>
        </div>
      )}
      {past.map((stay) => (
        <p key={stay.id} className="text-sm text-muted">
          Alta de {stay.room.name} el {stay.dischargedAt ? fmtDateTime(stay.dischargedAt) : "—"}.{" "}
          <Link to={`/veterinaria/hospitalizacion/${stay.id}`} className="underline">
            Hoja de alta
          </Link>
        </p>
      ))}
      {!active && past.length === 0 && !open && (
        <p className="text-sm text-muted">El paciente no está hospitalizado.</p>
      )}
      {open && (
        <div className="space-y-2">
          <select
            className="input"
            aria-label="Sala de hospitalización"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          >
            <option value="">Sala…</option>
            {wards.map((ward) => (
              <option key={ward.id} value={ward.id} disabled={ward.occupied >= ward.capacity}>
                {ward.name} · {ward.occupied}/{ward.capacity} ocupadas
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Motivo del ingreso"
            aria-label="Motivo del ingreso"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            placeholder="Tarifa diaria (se cobra al alta)"
            aria-label="Tarifa diaria"
            value={dailyRate}
            onChange={(e) => setDailyRate(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Descartar
            </button>
            <button className="btn-primary btn-sm" onClick={submit}>
              Ingresar paciente
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
