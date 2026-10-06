import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleAlert, CreditCard } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { SectionCard } from "../../components/ui/SectionCard";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import {
  PlanChooser,
  QuoteLines,
  initialChoice,
  type PlanChoice,
} from "../../components/billing/PlanChooser";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import {
  UNIT_NAMES,
  formatLongDate,
  formatMoney,
  planPriceCents,
  quoteFor,
  readReturnParams,
  signupApi,
  type Catalog,
} from "../../lib/billing";
import { billingApi, type BillingState } from "./api";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  TRIALING: { label: "En prueba", className: "bg-info-soft text-info-ink" },
  ACTIVE: { label: "Al día", className: "bg-success-soft text-success-ink" },
  PAST_DUE: { label: "Pago pendiente", className: "bg-warning-soft text-warning-ink" },
  SUSPENDED: { label: "Suspendida", className: "bg-danger-soft text-danger-ink" },
  CANCELED: { label: "Cancelada", className: "bg-sunken text-muted" },
};

const PAYMENT_KINDS: Record<string, string> = {
  SIGNUP: "Alta",
  CONVERSION: "Primer pago",
  RENEWAL: "Renovación automática",
  MANUAL: "Renovación",
};

const PAYMENT_STATUS: Record<string, string> = {
  APPROVED: "Aprobado",
  DECLINED: "Rechazado",
  REVERSED: "Reversado",
};

/**
 * Settling the return from PayPhone is not repeatable in parallel: React runs an effect twice
 * in development, and two confirmations racing would have the second one ask PayPhone about a
 * payment the first already settled. One request per transaction, shared by both runs.
 */
const confirmations = new Map<string, Promise<BillingState>>();

function Headline({ state }: { state: BillingState }) {
  const { subscription } = state;
  if (subscription.status === "SUSPENDED") {
    return (
      <p role="alert" className="notice notice-danger">
        <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          {subscription.currentPeriodEnd
            ? "Tu suscripción está suspendida porque no recibimos el pago de la renovación."
            : "Tu prueba gratuita terminó."}{" "}
          Tus datos siguen guardados y el acceso vuelve en cuanto pagues.
        </span>
      </p>
    );
  }
  if (subscription.status === "PAST_DUE") {
    return (
      <p role="alert" className="notice notice-warning">
        <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          El pago de tu plan está pendiente.
          {subscription.suspendsAt &&
            ` Si no llega, el acceso se suspende el ${formatLongDate(subscription.suspendsAt)}.`}
        </span>
      </p>
    );
  }
  if (subscription.status === "TRIALING" && subscription.trialEndsAt) {
    return (
      <p className="notice notice-info">
        <span>
          Tu prueba gratuita va hasta el {formatLongDate(subscription.trialEndsAt)}. Elige un plan
          antes de esa fecha para seguir sin interrupción; conservas todo lo que hayas cargado.
        </span>
      </p>
    );
  }
  return null;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.05em] text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

export function SuscripcionPage() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<BillingState | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [choice, setChoice] = useState<PlanChoice | null>(null);
  const [saveCard, setSaveCard] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "info" | "danger";
    text: string;
  } | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [isRemovingCard, setIsRemovingCard] = useState(false);

  const message = (error: unknown) =>
    error instanceof ApiError
      ? error.message
      : "Algo falló de nuestro lado. Inténtalo de nuevo en un momento.";

  const load = useCallback(async () => {
    try {
      setState(await billingApi.state());
      setLoadError(null);
    } catch (error) {
      setLoadError(message(error));
    }
  }, []);

  // On arrival: either this is the browser coming back from PayPhone, or a plain visit.
  useEffect(() => {
    const search = window.location.search;
    const { id, clientTransactionId, ctoken } = readReturnParams(search);
    const cancelled = new URLSearchParams(search).get("cancelado") === "1";
    let alive = true;

    if (id && clientTransactionId) {
      let pending = confirmations.get(clientTransactionId);
      if (!pending) {
        pending = billingApi.confirm({ id, clientTransactionId, ctoken });
        confirmations.set(clientTransactionId, pending);
      }
      pending
        .then(async (next) => {
          if (!alive) return;
          setState(next);
          setNotice({ tone: "success", text: "Recibimos tu pago. Gracias." });
          // The workspace was closed while suspended: the session has to learn it is open again.
          await refreshSession();
        })
        .catch(async (error: unknown) => {
          if (!alive) return;
          setNotice({ tone: "danger", text: message(error) });
          await load();
        })
        // The ids are single-use; leaving them in the address would retry them on a reload.
        .finally(() => alive && navigate("/suscripcion", { replace: true }));
    } else {
      if (cancelled) {
        setNotice({ tone: "info", text: "Cancelaste el pago y no se hizo ningún cobro." });
        navigate("/suscripcion", { replace: true });
      }
      void load();
    }
    return () => {
      alive = false;
    };
    // Runs once: it reads the address the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The plan picker is only for a daycare that has not paid yet.
  const needsPlan = state?.nextPayment?.kind === "CONVERSION";
  useEffect(() => {
    if (!needsPlan || catalog) return;
    let alive = true;
    signupApi
      .catalog()
      .then((data) => {
        if (!alive) return;
        setCatalog(data);
        setChoice(initialChoice(data, { units: state?.subscription.units }));
      })
      .catch((error: unknown) => {
        if (alive) setNotice({ tone: "danger", text: message(error) });
      });
    return () => {
      alive = false;
    };
  }, [needsPlan, catalog, state?.subscription.units]);

  async function pay() {
    setIsPaying(true);
    setNotice(null);
    try {
      const { redirectUrl } = await billingApi.checkout(
        needsPlan && choice ? { ...choice, saveCard } : { saveCard },
      );
      // A full navigation: PayPhone's page must not be framed, and it sends the browser back.
      window.location.assign(redirectUrl);
    } catch (error) {
      setNotice({ tone: "danger", text: message(error) });
      setIsPaying(false);
    }
  }

  async function removeCard() {
    setIsRemovingCard(true);
    try {
      setState(await billingApi.removeCard());
      setNotice({
        tone: "info",
        text: "Quitamos tu tarjeta. Te avisaremos por correo cuando toque renovar.",
      });
      await refreshSession();
    } catch (error) {
      setNotice({ tone: "danger", text: message(error) });
    } finally {
      setIsRemovingCard(false);
    }
  }

  if (loadError && !state) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl space-y-5">
        <PageHeader title="Suscripción" />
        {notice && <p className={`notice notice-${notice.tone}`}>{notice.text}</p>}
        <p className="notice notice-info">{loadError}</p>
      </div>
    );
  }
  if (!state) return <PageLoader />;

  const { subscription, nextPayment } = state;
  const status = STATUS_LABELS[subscription.status] ?? STATUS_LABELS.CANCELED;

  const chosenPlan =
    needsPlan && catalog && choice
      ? (catalog.plans.find((plan) => plan.id === choice.planId) ?? null)
      : null;
  const founderPercent = catalog && state.founderAvailable ? catalog.founder.discountPercent : 0;
  const quote =
    nextPayment?.quote ??
    (chosenPlan && choice
      ? quoteFor(
          planPriceCents(chosenPlan, choice.units, choice.period),
          founderPercent,
          state.vatPercent,
        )
      : null);
  const payPeriod = needsPlan ? choice?.period : subscription.period;
  const payLabel = needsPlan ? chosenPlan?.label : subscription.planLabel;
  const canPay =
    quote !== null && (!needsPlan || (chosenPlan && choice?.units.length === chosenPlan.unitCount));

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-5">
      <PageHeader
        title="Suscripción"
        subtitle="El plan de tu negocio en Argos Suite, sus pagos y la tarjeta con la que se renueva."
      />

      {notice && (
        <p
          role={notice.tone === "danger" ? "alert" : "status"}
          className={`notice notice-${notice.tone}`}
        >
          {notice.text}
        </p>
      )}
      <Headline state={state} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="space-y-5">
          <SectionCard
            title={subscription.status === "TRIALING" ? "Tu prueba" : "Tu plan"}
            action={<span className={`badge ${status.className}`}>{status.label}</span>}
            bodyClassName="p-4 sm:p-5"
          >
            <p className="font-display text-2xl leading-tight text-ink">
              {subscription.currentPeriodEnd
                ? `Plan ${subscription.planLabel}`
                : "Prueba gratuita, todo incluido"}
            </p>
            <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <Fact label="Unidades">
                {subscription.units.map((unit) => UNIT_NAMES[unit]).join(", ") || "—"}
              </Fact>
              {subscription.currentPeriodEnd ? (
                <>
                  <Fact label="Pagado hasta">{formatLongDate(subscription.currentPeriodEnd)}</Fact>
                  <Fact label="Precio">
                    <span className="tabular-nums">{formatMoney(subscription.priceCents)}</span>{" "}
                    {subscription.period === "ANNUAL" ? "al año" : "al mes"}, más IVA
                  </Fact>
                  {subscription.founderUntil && (
                    <Fact label="Precio fundador">
                      Hasta el {formatLongDate(subscription.founderUntil)}
                    </Fact>
                  )}
                </>
              ) : (
                <Fact label="La prueba termina">
                  {formatLongDate(subscription.trialEndsAt) || "—"}
                </Fact>
              )}
            </dl>
          </SectionCard>

          {subscription.currentPeriodEnd && (
            <SectionCard
              title="Tarjeta para renovar"
              icon={<CreditCard size={15} aria-hidden="true" />}
              bodyClassName="p-4 sm:p-5"
            >
              {subscription.card ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink">
                    {subscription.card.brand ?? "Tarjeta"}
                    {subscription.card.lastDigits && (
                      <span className="tabular-nums">
                        {" "}
                        terminada en {subscription.card.lastDigits}
                      </span>
                    )}
                    <span className="block text-muted">
                      El plan se renueva solo con esta tarjeta el día que vence.
                    </span>
                  </p>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={removeCard}
                    disabled={isRemovingCard}
                  >
                    {isRemovingCard ? <Spinner size={13} /> : null}
                    Quitar tarjeta
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  No hay una tarjeta guardada. Te avisamos por correo unos días antes de que venza
                  el plan y lo renuevas desde aquí. Si prefieres que se renueve solo, marca la
                  opción de guardar la tarjeta en tu próximo pago.
                </p>
              )}
            </SectionCard>
          )}

          {state.payments.length > 0 && (
            <SectionCard title="Pagos">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="table-th">Fecha</th>
                      <th className="table-th">Concepto</th>
                      <th className="table-th">Estado</th>
                      <th className="table-th text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.payments.map((payment) => (
                      <tr key={payment.id} className="table-tr">
                        <td className="table-td whitespace-nowrap">
                          {formatLongDate(payment.createdAt)}
                        </td>
                        <td className="table-td">
                          {PAYMENT_KINDS[payment.kind] ?? payment.kind} · {payment.planLabel}
                        </td>
                        <td className="table-td">
                          {PAYMENT_STATUS[payment.status] ?? payment.status}
                        </td>
                        <td className="table-td text-right tabular-nums">
                          {formatMoney(payment.totalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>

        {nextPayment && (
          <SectionCard
            title={needsPlan ? "Elige tu plan" : "Renovar el plan"}
            className="lg:sticky lg:top-20"
            bodyClassName="p-4 sm:p-5 space-y-5"
          >
            {needsPlan &&
              (catalog && choice ? (
                <PlanChooser
                  catalog={catalog}
                  choice={choice}
                  onChange={setChoice}
                  disabled={isPaying}
                />
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted" role="status">
                  <Spinner size={14} /> Cargando planes…
                </p>
              ))}

            {quote && (
              <div className={needsPlan ? "border-t border-line-subtle pt-5" : undefined}>
                <QuoteLines
                  quote={quote}
                  label={`${payPeriod === "ANNUAL" ? "Un año" : "Un mes"} de ${payLabel ?? ""}`}
                  totalLabel="Pagas hoy"
                  vatPercent={state.vatPercent}
                  founderPercent={catalog?.founder.discountPercent ?? 30}
                />
                {nextPayment.periodEnd && (
                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    Cubre hasta el {formatLongDate(nextPayment.periodEnd)}.
                  </p>
                )}
              </div>
            )}

            <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted">
              <input
                type="checkbox"
                className="mt-1 accent-[var(--color-action)]"
                checked={saveCard}
                onChange={(event) => setSaveCard(event.target.checked)}
                disabled={isPaying}
              />
              <span>
                Guardar esta tarjeta para renovar el plan automáticamente. Puedes quitarla cuando
                quieras.
              </span>
            </label>

            <button
              className="btn-primary w-full justify-center py-2.5"
              onClick={pay}
              disabled={isPaying || !canPay}
            >
              {isPaying ? <Spinner size={16} /> : null}
              {isPaying
                ? "Abriendo el pago…"
                : quote
                  ? `Pagar ${formatMoney(quote.totalCents)}`
                  : "Pagar"}
            </button>
            <p className="text-xs leading-relaxed text-muted">
              El pago se hace con tarjeta en la página de PayPhone. Argos Suite no ve ni guarda el
              número de tu tarjeta.
            </p>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
