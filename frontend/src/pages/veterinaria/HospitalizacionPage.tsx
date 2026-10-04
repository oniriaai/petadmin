import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BedDouble, Check, Plus, Printer } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { cls, fmtDateTime } from "../../lib/utils";
import { errorMessage, veterinariaApi, type Stay, type TreatmentOrder, type Ward } from "./api";

type Tab = "ward" | "discharged";
type Run = (action: () => Promise<unknown>, failure: string) => Promise<void>;

/** Doses falling within this window count as due now. */
const DUE_WINDOW_MS = 30 * 60_000;
const DAY_MS = 86_400_000;

const isDue = (order: TreatmentOrder, now: number) =>
  order.nextDueAt !== null && new Date(order.nextDueAt).getTime() <= now + DUE_WINDOW_MS;

const orderLine = (order: TreatmentOrder) =>
  [order.description, order.dose, order.route, order.everyHours && `cada ${order.everyHours} h`]
    .filter(Boolean)
    .join(" · ");

/** The ward: who is in which cage, what is due now, and the discharge desk. */
export function HospitalizacionPage() {
  const [tab, setTab] = useState<Tab>("ward");
  const [stays, setStays] = useState<Stay[]>([]);
  const [discharged, setDischarged] = useState<Stay[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [discharging, setDischarging] = useState<Stay | null>(null);
  const [skipping, setSkipping] = useState<TreatmentOrder | null>(null);

  const load = useCallback(async () => {
    try {
      const [loadedStays, loadedDischarged, loadedWards] = await Promise.all([
        veterinariaApi.stays("INGRESADO"),
        veterinariaApi.stays("ALTA"),
        veterinariaApi.wards(),
      ]);
      setStays(loadedStays);
      setDischarged(loadedDischarged);
      setWards(loadedWards);
      setError("");
    } catch (e) {
      setError(errorMessage(e, "No se pudo cargar la hospitalización"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run: Run = async (action, failure) => {
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e, failure));
    }
  };

  const now = Date.now();
  const due = stays
    .flatMap((stay) => stay.orders.filter((o) => isDue(o, now)).map((order) => ({ stay, order })))
    .sort((a, b) => (a.order.nextDueAt ?? "").localeCompare(b.order.nextDueAt ?? ""));

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Hospitalización"
        subtitle="Pacientes ingresados, hoja de tratamiento y altas"
      />

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {wards.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm" aria-label="Ocupación de las salas">
          {wards.map((ward) => (
            <li key={ward.id} className="card px-3 py-2">
              <span className="font-medium text-gray-900">{ward.name}</span>{" "}
              <span className={ward.occupied >= ward.capacity ? "text-red-700" : "text-muted"}>
                {ward.occupied}/{ward.capacity}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Hospitalización">
        {(
          [
            ["ward", `Ingresados (${stays.length})`],
            ["discharged", `Altas (${discharged.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={cls("btn-sm", tab === key ? "btn-primary" : "btn-secondary")}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader />
      ) : tab === "discharged" ? (
        discharged.length === 0 ? (
          <Empty text="Todavía no hay altas registradas." />
        ) : (
          <ul className="card divide-y divide-gray-100 text-sm">
            {discharged.map((stay) => (
              <li key={stay.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="font-medium text-gray-900">{stay.pet.name}</p>
                  <p className="text-xs text-muted">
                    {stay.room.name} · {fmtDateTime(stay.admittedAt)} →{" "}
                    {stay.dischargedAt ? fmtDateTime(stay.dischargedAt) : "—"}
                  </p>
                </div>
                <Link to={`/veterinaria/hospitalizacion/${stay.id}`} className="btn-ghost btn-sm">
                  <Printer size={15} /> Hoja de alta
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : stays.length === 0 ? (
        <Empty text="No hay pacientes hospitalizados. El ingreso se hace desde la consulta." />
      ) : (
        <>
          <section className="card p-4 space-y-3" aria-label="Tratamientos por administrar">
            <h2 className="font-semibold text-gray-900">Por administrar ahora ({due.length})</h2>
            {due.length === 0 ? (
              <p className="text-sm text-muted">Ninguna dosis pendiente en este momento.</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {due.map(({ stay, order }) => (
                  <li key={order.id} className="flex flex-wrap items-center gap-2 py-2">
                    <div className="flex-1 min-w-[14rem]">
                      <p className="text-gray-900">
                        <span className="font-medium">{stay.pet.name}</span> · {orderLine(order)}
                      </p>
                      <p className="text-xs text-muted">
                        {stay.room.name} · tocaba {fmtDateTime(order.nextDueAt ?? "")}
                      </p>
                    </div>
                    <DoseButtons order={order} run={run} onSkip={setSkipping} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            {stays.map((stay) => (
              <StayCard
                key={stay.id}
                stay={stay}
                now={now}
                run={run}
                onSkip={setSkipping}
                onDischarge={() => setDischarging(stay)}
              />
            ))}
          </div>
        </>
      )}

      <DischargeModal
        stay={discharging}
        onClose={() => setDischarging(null)}
        onDone={async () => {
          setDischarging(null);
          await load();
        }}
      />
      <SkipModal
        order={skipping}
        onClose={() => setSkipping(null)}
        onDone={async () => {
          setSkipping(null);
          await load();
        }}
      />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card p-10 text-center">
      <BedDouble size={28} className="mx-auto mb-2 text-gray-300" />
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

function DoseButtons({
  order,
  run,
  onSkip,
}: {
  order: TreatmentOrder;
  run: Run;
  onSkip: (order: TreatmentOrder) => void;
}) {
  // The slot is sent explicitly, so a second click on a stale screen is refused, not doubled.
  const slot = order.nextDueAt ? { scheduledAt: order.nextDueAt } : {};
  return (
    <span className="flex gap-2">
      <button
        className="btn-primary btn-sm"
        onClick={() =>
          run(() => veterinariaApi.recordDose(order.id, slot), "No se pudo registrar la dosis")
        }
      >
        <Check size={15} /> Administrada
      </button>
      <button className="btn-ghost btn-sm" onClick={() => onSkip(order)}>
        Omitir
      </button>
    </span>
  );
}

function StayCard({
  stay,
  now,
  run,
  onSkip,
  onDischarge,
}: {
  stay: Stay;
  now: number;
  run: Run;
  onSkip: (order: TreatmentOrder) => void;
  onDischarge: () => void;
}) {
  const [description, setDescription] = useState("");
  const [dose, setDose] = useState("");
  const [everyHours, setEveryHours] = useState("");
  const [temperature, setTemperature] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [respiratoryRate, setRespiratoryRate] = useState("");

  const days = Math.max(1, Math.ceil((now - new Date(stay.admittedAt).getTime()) / DAY_MS));
  const latest = stay.vitals[0];

  const addOrder = async () => {
    if (!description.trim()) return;
    await run(
      () =>
        veterinariaApi.addTreatmentOrder(stay.id, {
          description: description.trim(),
          ...(dose.trim() ? { dose: dose.trim() } : {}),
          ...(everyHours ? { everyHours: Number(everyHours) } : {}),
        }),
      "No se pudo añadir la indicación",
    );
    setDescription("");
    setDose("");
    setEveryHours("");
  };

  const addVitals = async () => {
    const body = {
      ...(temperature ? { temperatureC: Number(temperature) } : {}),
      ...(heartRate ? { heartRate: Number(heartRate) } : {}),
      ...(respiratoryRate ? { respiratoryRate: Number(respiratoryRate) } : {}),
    };
    if (Object.keys(body).length === 0) return;
    await run(
      () => veterinariaApi.addWardVitals(stay.id, body),
      "No se pudieron registrar los signos vitales",
    );
    setTemperature("");
    setHeartRate("");
    setRespiratoryRate("");
  };

  return (
    <article className="card p-4 space-y-4 text-sm" aria-label={`Ingreso de ${stay.pet.name}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">
            <Link to={`/veterinaria/consultas/${stay.visit.id}`} className="hover:underline">
              {stay.pet.name}
            </Link>
          </h2>
          <p className="text-xs text-muted">
            {stay.room.name} · día {days} · {stay.visit.client.firstName}{" "}
            {stay.visit.client.lastName}
            {stay.visit.client.phone ? ` · ${stay.visit.client.phone}` : ""}
          </p>
          <p className="text-gray-700 mt-1">{stay.reason}</p>
        </div>
        <button className="btn-secondary btn-sm" onClick={onDischarge}>
          Dar el alta
        </button>
      </header>

      {stay.pet.allergies && (
        <p className="flex items-center gap-1.5 text-red-700">
          <AlertTriangle size={15} /> Alergias: {stay.pet.allergies}
        </p>
      )}

      <div className="space-y-2">
        <h3 className="font-medium text-gray-900">Indicaciones</h3>
        {stay.orders.length === 0 ? (
          <p className="text-muted">Sin indicaciones todavía.</p>
        ) : (
          <ul className="space-y-2">
            {stay.orders.map((order) => {
              const last = order.administrations[0];
              return (
                <li key={order.id} className="rounded-lg border border-gray-200 p-2.5 space-y-1.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className={order.isActive ? "text-gray-900" : "text-muted line-through"}>
                      {orderLine(order)}
                    </p>
                    {!order.isActive ? (
                      <Badge>Suspendida</Badge>
                    ) : order.nextDueAt === null ? (
                      <Badge color="bg-emerald-100 text-emerald-800">Completa</Badge>
                    ) : isDue(order, now) ? (
                      <Badge color="bg-amber-100 text-amber-800">Toca ahora</Badge>
                    ) : (
                      <Badge>Próxima {fmtDateTime(order.nextDueAt)}</Badge>
                    )}
                  </div>
                  {last && (
                    <p className="text-xs text-muted">
                      Última:{" "}
                      {last.administeredAt
                        ? `administrada ${fmtDateTime(last.administeredAt)}${
                            last.administeredBy ? ` por ${last.administeredBy.name}` : ""
                          }`
                        : `omitida (${last.skippedReason ?? "sin motivo"})`}
                    </p>
                  )}
                  {order.isActive && (
                    <div className="flex flex-wrap items-center gap-2">
                      {order.nextDueAt !== null && (
                        <DoseButtons order={order} run={run} onSkip={onSkip} />
                      )}
                      <button
                        className="btn-ghost btn-sm text-red-600"
                        onClick={() =>
                          run(
                            () => veterinariaApi.stopTreatmentOrder(order.id),
                            "No se pudo suspender la indicación",
                          )
                        }
                      >
                        Suspender
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-12">
          <input
            className="input sm:col-span-5"
            placeholder="Medicamento o cuidado"
            aria-label={`Nueva indicación para ${stay.pet.name}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className="input sm:col-span-3"
            placeholder="Dosis y vía"
            aria-label="Dosis y vía"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
          />
          <input
            className="input sm:col-span-2"
            type="number"
            min={1}
            max={168}
            placeholder="Cada h"
            aria-label="Cada cuántas horas"
            value={everyHours}
            onChange={(e) => setEveryHours(e.target.value)}
          />
          <button className="btn-secondary btn-sm sm:col-span-2" onClick={addOrder}>
            <Plus size={15} /> Indicar
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium text-gray-900">Signos vitales</h3>
        <p className="text-muted">
          {latest
            ? `Última toma ${fmtDateTime(latest.takenAt)}: ${
                [
                  latest.temperatureC && `${latest.temperatureC} °C`,
                  latest.heartRate && `FC ${latest.heartRate}`,
                  latest.respiratoryRate && `FR ${latest.respiratoryRate}`,
                  latest.weightKg && `${latest.weightKg} kg`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "sin valores"
              }`
            : "Sin tomas durante el ingreso."}
        </p>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          <input
            className="input"
            type="number"
            step="0.1"
            placeholder="Temp. °C"
            aria-label="Temperatura"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
          />
          <input
            className="input"
            type="number"
            placeholder="FC"
            aria-label="Frecuencia cardíaca"
            value={heartRate}
            onChange={(e) => setHeartRate(e.target.value)}
          />
          <input
            className="input"
            type="number"
            placeholder="FR"
            aria-label="Frecuencia respiratoria"
            value={respiratoryRate}
            onChange={(e) => setRespiratoryRate(e.target.value)}
          />
          <button className="btn-secondary btn-sm" onClick={addVitals}>
            Registrar toma
          </button>
        </div>
      </div>
    </article>
  );
}

function DischargeModal({
  stay,
  onClose,
  onDone,
}: {
  stay: Stay | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [summary, setSummary] = useState("");
  const [homeCare, setHomeCare] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSummary("");
    setHomeCare("");
    setError("");
  }, [stay?.id]);

  const submit = async () => {
    if (!stay) return;
    if (!summary.trim()) {
      setError("El resumen del alta es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      await veterinariaApi.discharge(stay.id, {
        dischargeSummary: summary.trim(),
        ...(homeCare.trim() ? { homeCareInstructions: homeCare.trim() } : {}),
      });
      await onDone();
    } catch (e) {
      setError(errorMessage(e, "No se pudo registrar el alta"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={stay !== null}
      onClose={onClose}
      title={stay ? `Alta de ${stay.pet.name}` : "Alta"}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? <Spinner size={16} /> : "Registrar alta"}
          </button>
        </>
      }
    >
      {stay && (
        <div className="space-y-3 text-sm">
          {error && (
            <p className="text-red-600" role="alert">
              {error}
            </p>
          )}
          <p className="text-muted">
            {stay.dailyRate > 0
              ? "Al registrar el alta se añaden a la consulta los días de estancia a la tarifa diaria. La consulta se cierra y se cobra después."
              : "Este ingreso no tiene tarifa diaria: el alta no añade ningún cargo."}
          </p>
          <div>
            <label className="label" htmlFor="discharge-summary">
              Resumen del alta
            </label>
            <textarea
              id="discharge-summary"
              className="input"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="discharge-home">
              Cuidados en casa
            </label>
            <textarea
              id="discharge-home"
              className="input"
              rows={4}
              value={homeCare}
              onChange={(e) => setHomeCare(e.target.value)}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

function SkipModal({
  order,
  onClose,
  onDone,
}: {
  order: TreatmentOrder | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setReason("");
    setError("");
  }, [order?.id]);

  const submit = async () => {
    if (!order) return;
    if (!reason.trim()) {
      setError("Indica por qué no se administró.");
      return;
    }
    setSaving(true);
    try {
      await veterinariaApi.recordDose(order.id, {
        skippedReason: reason.trim(),
        ...(order.nextDueAt ? { scheduledAt: order.nextDueAt } : {}),
      });
      await onDone();
    } catch (e) {
      setError(errorMessage(e, "No se pudo registrar la omisión"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={order !== null}
      onClose={onClose}
      title="Omitir dosis"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? <Spinner size={16} /> : "Registrar omisión"}
          </button>
        </>
      }
    >
      {order && (
        <div className="space-y-3 text-sm">
          {error && (
            <p className="text-red-600" role="alert">
              {error}
            </p>
          )}
          <p className="text-gray-700">{orderLine(order)}</p>
          <div>
            <label className="label" htmlFor="skip-reason">
              Motivo
            </label>
            <input
              id="skip-reason"
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
