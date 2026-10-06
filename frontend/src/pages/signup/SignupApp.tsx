import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { EnvelopeSimpleIcon as Envelope } from "@phosphor-icons/react/dist/csr/EnvelopeSimple";
import { WarningCircleIcon as Warning } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { Lockup } from "../../components/brand/Logo";
import { Spinner } from "../../components/ui/Spinner";
import {
  PlanChooser,
  QuoteLines,
  Segmented,
  initialChoice,
  type PlanChoice,
} from "../../components/billing/PlanChooser";
import {
  ADD_ON_NAMES,
  SignupError,
  UNIT_NAMES,
  formatMoney,
  planPriceCents,
  quoteFor,
  readReturnParams,
  signupApi,
  slugify,
  type Catalog,
  type CatalogPlan,
  type PlanUnit,
  type SignupCompleted,
} from "../../lib/billing";

/**
 * Signing up from the public page: the form, the return from PayPhone and the link a trial is
 * confirmed with.
 *
 * `main.tsx` mounts this on its own, outside the application's router and session, as it does
 * the landing: somebody who is not a customer yet has no use for the operator's code. It hands
 * over to the application by storing the session the server returns and loading `/`.
 *
 * Unlike the landing this page is light only, so the lockup is the light one: following the
 * visitor's colour scheme drew a white wordmark on the light canvas.
 */

type Mode = "PAID" | "TRIAL";

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <header className="border-b border-line-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <a href="/bienvenida" className="text-ink" aria-label="Argos Suite, página de inicio">
            <Lockup tone="light" className="w-36" />
          </a>
          <a href="/login" className="btn-ghost whitespace-nowrap">
            Ya tengo cuenta
          </a>
        </div>
      </header>
      {children}
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-line-subtle pt-8">
      <legend className="float-left mb-5 w-full font-display text-xl leading-tight text-ink">
        {title}
      </legend>
      <div className="clear-both space-y-5">{children}</div>
    </fieldset>
  );
}

interface FormValues {
  businessName: string;
  slug: string;
  legalName: string;
  taxId: string;
  phone: string;
  adminName: string;
  email: string;
  adminUsername: string;
  password: string;
}

const EMPTY: FormValues = {
  businessName: "",
  slug: "",
  legalName: "",
  taxId: "",
  phone: "",
  adminName: "",
  email: "",
  adminUsername: "",
  password: "",
};

function validate(values: FormValues, units: PlanUnit[], plan: CatalogPlan, mode: Mode) {
  const errors: Record<string, string> = {};
  if (!values.businessName.trim()) errors.businessName = "Escribe el nombre de tu negocio.";
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(values.slug)) {
    errors.slug = "Usa minúsculas, números y guiones, sin espacios.";
  }
  if (!/^\d{10}(\d{3})?$/.test(values.taxId.trim())) {
    errors.taxId = "Escribe la cédula (10 dígitos) o el RUC (13 dígitos).";
  }
  if (values.phone.replace(/\D/g, "").length < 9) errors.phone = "Escribe un teléfono válido.";
  if (!values.adminName.trim()) errors.adminName = "Escribe tu nombre.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = "Escribe un correo válido.";
  }
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(values.adminUsername)) {
    errors.adminUsername = "De 3 a 40 caracteres: letras, números, punto, guion o guion bajo.";
  }
  if (values.password.length < 8) errors.password = "Usa al menos 8 caracteres.";
  if (mode === "PAID" && units.length !== plan.unitCount) {
    errors.units = plan.unitCount === 1 ? "Elige una unidad." : `Elige ${plan.unitCount} unidades.`;
  }
  return errors;
}

function SignupForm({ catalog }: { catalog: Catalog }) {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const canPay = catalog.checkoutAvailable;
  const canTry = catalog.trial.available;

  const [mode, setMode] = useState<Mode>(
    (query.get("prueba") === "1" && canTry) || !canPay ? "TRIAL" : "PAID",
  );
  const [choice, setChoice] = useState<PlanChoice>(() =>
    initialChoice(catalog, {
      planId: query.get("plan"),
      period: query.get("periodo") === "anual" ? "ANNUAL" : "MONTHLY",
    }),
  );
  const plan =
    catalog.plans.find((candidate) => candidate.id === choice.planId) ?? catalog.plans[0];
  const { units, period } = choice;
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(
    query.get("cancelado") === "1"
      ? "Cancelaste el pago y no se hizo ningún cobro. Puedes intentarlo de nuevo cuando quieras."
      : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // The identifier and the username follow the business name until the visitor edits them.
  const slug = slugTouched ? values.slug : slugify(values.businessName);
  const adminUsername = usernameTouched
    ? values.adminUsername
    : slug
      ? `${slug.slice(0, 34)}_admin`
      : "";
  const effective = { ...values, slug, adminUsername };

  const set = (field: keyof FormValues) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const founderPercent = catalog.founder.available ? catalog.founder.discountPercent : 0;
  const quote = quoteFor(planPriceCents(plan, units, period), founderPercent, catalog.vatPercent);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validate(effective, units, plan, mode);
    if (!acceptTerms) found.acceptTerms = "Marca esta casilla para continuar.";
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      setFormError(null);
      formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const started = await signupApi.start({
        kind: mode,
        ...(mode === "PAID" ? { planId: plan.id, units } : {}),
        period,
        businessName: effective.businessName.trim(),
        slug: effective.slug,
        legalName: effective.legalName.trim() || undefined,
        taxId: effective.taxId.trim(),
        phone: effective.phone.trim(),
        email: effective.email.trim(),
        adminName: effective.adminName.trim(),
        adminUsername: effective.adminUsername,
        password: effective.password,
        saveCard: mode === "PAID" && saveCard,
        acceptTerms,
      });
      if (started.next === "payment") {
        // A full navigation: PayPhone's page must not be framed, and it sends the browser back.
        window.location.assign(started.redirectUrl);
        return;
      }
      setSentTo(started.email);
    } catch (error) {
      if (error instanceof SignupError) {
        setErrors(error.fieldErrors);
        setFormError(
          Object.keys(error.fieldErrors).length > 0 ? "Revisa los campos marcados." : error.message,
        );
      } else {
        setFormError("Algo falló de nuestro lado. Inténtalo de nuevo en un momento.");
      }
      setIsSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <Notice
        icon={<Envelope size={26} aria-hidden="true" />}
        title="Revisa tu correo"
        action={{ href: "/bienvenida", label: "Volver al inicio" }}
      >
        <p>
          Enviamos un enlace a <strong className="font-semibold text-ink">{sentTo}</strong>. Ábrelo
          para crear tu espacio y empezar los {catalog.trial.days} días de prueba.
        </p>
        <p>El enlace vale 48 horas. Si no lo ves, mira en la carpeta de correo no deseado.</p>
      </Notice>
    );
  }

  const input = (field: keyof FormValues) => ({
    id: `signup-${field}`,
    "data-field": field,
    className: "input",
    disabled: isSubmitting,
    "aria-invalid": errors[field] ? (true as const) : undefined,
    "aria-describedby": errors[field] ? `signup-${field}-error` : undefined,
  });

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 lg:px-8 lg:pt-14">
      <h1 className="max-w-3xl font-display text-4xl leading-[1.1] text-ink md:text-5xl">
        Crea tu espacio en Argos Suite
      </h1>
      <p className="mt-4 max-w-[60ch] leading-relaxed text-muted">
        Un formulario y entras hoy mismo. Tus datos quedan en un espacio solo para tu negocio.
      </p>

      {canPay && canTry && (
        <div className="mt-8">
          <Segmented
            label="Cómo quieres empezar"
            value={mode}
            onChange={setMode}
            options={[
              { id: "PAID", label: "Contratar un plan" },
              { id: "TRIAL", label: `Probar ${catalog.trial.days} días gratis` },
            ]}
          />
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={onSubmit}
        noValidate
        className="mt-10 grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
      >
        <div className="space-y-10">
          {mode === "PAID" ? (
            <Section title="Tu plan">
              <PlanChooser
                catalog={catalog}
                choice={choice}
                disabled={isSubmitting}
                unitsError={errors.units}
                onChange={(next) => {
                  setChoice(next);
                  setErrors((current) => ({ ...current, units: "" }));
                }}
              />
            </Section>
          ) : (
            <Section title="Tu prueba">
              <p className="max-w-[62ch] text-sm leading-relaxed text-muted">
                Durante {catalog.trial.days} días tienes Guardería, Peluquería y Veterinaria con
                todos los módulos. No pedimos tarjeta. Los recordatorios a tutores salen por correo;
                WhatsApp se activa al contratar un plan. Al terminar eliges el plan que te sirva y
                conservas todo lo que hayas cargado.
              </p>
            </Section>
          )}

          <Section title="Tu negocio">
            <Field id="signup-businessName" label="Nombre comercial" error={errors.businessName}>
              <input
                {...input("businessName")}
                value={values.businessName}
                onChange={set("businessName")}
                autoComplete="organization"
                placeholder="Patitas Felices"
              />
            </Field>
            <Field
              id="signup-slug"
              label="Identificador"
              hint="Nombra tu espacio y no se puede cambiar después. Minúsculas, números y guiones."
              error={errors.slug}
            >
              <input
                {...input("slug")}
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  set("slug")(event);
                }}
                autoCapitalize="none"
                spellCheck={false}
                placeholder="patitas-felices"
              />
            </Field>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                id="signup-taxId"
                label="RUC o cédula"
                hint="A nombre de quien se registra el cobro."
                error={errors.taxId}
              >
                <input
                  {...input("taxId")}
                  value={values.taxId}
                  onChange={set("taxId")}
                  inputMode="numeric"
                  placeholder="1790012345001"
                />
              </Field>
              <Field id="signup-phone" label="Teléfono" error={errors.phone}>
                <input
                  {...input("phone")}
                  value={values.phone}
                  onChange={set("phone")}
                  type="tel"
                  autoComplete="tel"
                  placeholder="099 123 4567"
                />
              </Field>
            </div>
            <Field id="signup-legalName" label="Razón social (opcional)" error={errors.legalName}>
              <input
                {...input("legalName")}
                value={values.legalName}
                onChange={set("legalName")}
                placeholder="Patitas Felices S.A.S."
              />
            </Field>
          </Section>

          <Section title="Tu cuenta">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field id="signup-adminName" label="Tu nombre" error={errors.adminName}>
                <input
                  {...input("adminName")}
                  value={values.adminName}
                  onChange={set("adminName")}
                  autoComplete="name"
                />
              </Field>
              <Field
                id="signup-email"
                label="Correo"
                hint={
                  mode === "TRIAL"
                    ? "Aquí llega el enlace para activar la prueba."
                    : "Aquí llegan los recibos."
                }
                error={errors.email}
              >
                <input
                  {...input("email")}
                  value={values.email}
                  onChange={set("email")}
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                id="signup-adminUsername"
                label="Usuario"
                hint="Con él inicias sesión. Después creas los de tu equipo."
                error={errors.adminUsername}
              >
                <input
                  {...input("adminUsername")}
                  value={adminUsername}
                  onChange={(event) => {
                    setUsernameTouched(true);
                    set("adminUsername")(event);
                  }}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field
                id="signup-password"
                label="Contraseña"
                hint="Al menos 8 caracteres."
                error={errors.password}
              >
                <input
                  {...input("password")}
                  value={values.password}
                  onChange={set("password")}
                  type="password"
                  autoComplete="new-password"
                />
              </Field>
            </div>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="card p-6 sm:p-7">
            <h2 className="font-display text-xl leading-tight text-ink">
              {mode === "PAID" ? `Plan ${plan.label}` : `Prueba de ${catalog.trial.days} días`}
            </h2>
            {mode === "PAID" ? (
              <>
                <p className="mt-1.5 text-sm text-muted">
                  {[
                    ...units.map((unit) => UNIT_NAMES[unit]),
                    "Reservas y agenda",
                    ...plan.modules.map((id) => ADD_ON_NAMES[id]).filter(Boolean),
                  ].join(" · ")}
                </p>
                <div className="mt-5 border-t border-line-subtle pt-5">
                  <QuoteLines
                    quote={quote}
                    label={`${period === "ANNUAL" ? "Un año" : "Un mes"} de ${plan.label}`}
                    totalLabel="Pagas hoy"
                    vatPercent={catalog.vatPercent}
                    founderPercent={catalog.founder.discountPercent}
                  />
                </div>
                {quote.discountCents > 0 && (
                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    El precio fundador se mantiene {catalog.founder.months} meses.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Hoy no pagas nada. Te avisamos por correo antes de que termine.
              </p>
            )}

            <div className="mt-6 space-y-3 border-t border-line-subtle pt-5">
              {mode === "PAID" && (
                <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted">
                  <input
                    type="checkbox"
                    className="mt-1 accent-[var(--color-action)]"
                    checked={saveCard}
                    onChange={(event) => setSaveCard(event.target.checked)}
                    disabled={isSubmitting}
                  />
                  <span>
                    Guardar mi tarjeta para renovar el plan automáticamente. Puedes quitarla cuando
                    quieras; sin ella te avisamos y renuevas tú.
                  </span>
                </label>
              )}
              <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted">
                <input
                  type="checkbox"
                  data-field="acceptTerms"
                  className="mt-1 accent-[var(--color-action)]"
                  checked={acceptTerms}
                  onChange={(event) => {
                    setAcceptTerms(event.target.checked);
                    setErrors((current) => ({ ...current, acceptTerms: "" }));
                  }}
                  disabled={isSubmitting}
                  aria-invalid={errors.acceptTerms ? true : undefined}
                />
                <span>
                  {mode === "PAID"
                    ? "Acepto contratar este plan y que estos datos se usen para crear y administrar mi cuenta."
                    : "Acepto que estos datos se usen para crear y administrar mi cuenta de prueba."}
                  {errors.acceptTerms && (
                    <span className="mt-1 block text-danger-ink">{errors.acceptTerms}</span>
                  )}
                </span>
              </label>
            </div>

            {formError && (
              <p role="alert" className="notice notice-danger mt-5">
                <Warning size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary mt-5 w-full justify-center py-3 text-base"
            >
              {isSubmitting ? <Spinner size={16} /> : null}
              {mode === "PAID"
                ? isSubmitting
                  ? "Abriendo el pago…"
                  : `Continuar al pago de ${formatMoney(quote.totalCents)}`
                : isSubmitting
                  ? "Creando tu prueba…"
                  : "Empezar la prueba"}
              {!isSubmitting && <ArrowRight size={16} weight="bold" aria-hidden="true" />}
            </button>
            {mode === "PAID" && (
              <p className="mt-3 text-xs leading-relaxed text-muted">
                El pago se hace con tarjeta en la página de PayPhone. Argos Suite no ve ni guarda el
                número de tu tarjeta.
              </p>
            )}
          </div>
        </aside>
      </form>
    </main>
  );
}

function Notice({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:py-24">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-sunken text-muted">
        {icon}
      </div>
      <h1 className="mt-6 font-display text-3xl leading-tight text-ink md:text-4xl">{title}</h1>
      <div className="mt-4 space-y-3 leading-relaxed text-muted">{children}</div>
      {action && (
        <a href={action.href} className="btn-secondary mt-8">
          {action.label}
        </a>
      )}
    </main>
  );
}

/**
 * Completing a signup is not repeatable: the first answer carries the session and a second one
 * does not. React runs an effect twice in development, so the request is made once per page
 * load and both runs read the same promise.
 */
let completion: Promise<SignupCompleted> | null = null;

/** Hands the new session to the application, the way its own login stores one. */
function enterWorkspace(result: Extract<SignupCompleted, { status: "provisioned" }>) {
  try {
    localStorage.setItem("token", result.token);
    localStorage.setItem("user", JSON.stringify(result.user));
    localStorage.removeItem("activeBusinessUnit");
    localStorage.removeItem("pinnedDaycareId");
  } catch {
    // Storage refused (a private window): the account exists, so signing in by hand works.
    window.location.replace("/login");
    return;
  }
  window.location.replace("/");
}

function Completing({
  start,
  working,
  retry,
}: {
  start: (() => Promise<SignupCompleted>) | null;
  working: string;
  retry: { href: string; label: string };
}) {
  const [state, setState] = useState<
    { kind: "working" } | { kind: "already" } | { kind: "error"; message: string }
  >(start ? { kind: "working" } : { kind: "error", message: "A este enlace le faltan datos." });

  useEffect(() => {
    if (!start) return;
    let alive = true;
    completion ??= start();
    completion
      .then((result) => {
        if (!alive) return;
        if (result.status === "provisioned") enterWorkspace(result);
        else setState({ kind: "already" });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setState({
          kind: "error",
          message:
            error instanceof SignupError
              ? error.message
              : "Algo falló de nuestro lado. Inténtalo de nuevo en un momento.",
        });
      });
    return () => {
      alive = false;
    };
  }, [start]);

  if (state.kind === "working") {
    return (
      <main
        className="mx-auto grid min-h-[60dvh] max-w-xl place-items-center px-4 text-muted"
        role="status"
      >
        <span className="flex items-center gap-3">
          <Spinner size={18} />
          {working}
        </span>
      </main>
    );
  }
  if (state.kind === "already") {
    return (
      <Notice
        icon={<ArrowRight size={24} aria-hidden="true" />}
        title="Tu espacio ya está creado"
        action={{ href: "/login", label: "Iniciar sesión" }}
      >
        <p>Este enlace ya se usó. Entra con el usuario y la contraseña que elegiste.</p>
      </Notice>
    );
  }
  return (
    <Notice
      icon={<Warning size={26} aria-hidden="true" />}
      title="No pudimos completar el registro"
      action={retry}
    >
      <p role="alert">{state.message}</p>
    </Notice>
  );
}

function FormLoader() {
  const [state, setState] = useState<Catalog | "loading" | "unavailable">("loading");

  useEffect(() => {
    let alive = true;
    signupApi
      .catalog()
      .then((catalog) => {
        if (!alive) return;
        const open = catalog.checkoutAvailable || catalog.trial.available;
        setState(open && catalog.plans.length > 0 ? catalog : "unavailable");
      })
      .catch(() => {
        if (alive) setState("unavailable");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <main className="grid min-h-[60dvh] place-items-center text-muted" role="status">
        <span className="flex items-center gap-3">
          <Spinner size={18} />
          Cargando planes…
        </span>
      </main>
    );
  }
  if (state === "unavailable") {
    return (
      <Notice
        icon={<Warning size={26} aria-hidden="true" />}
        title="El registro en línea no está disponible ahora"
        action={{ href: "/bienvenida", label: "Volver al inicio" }}
      >
        <p>Inténtalo de nuevo en unos minutos, o escríbenos y te damos de alta nosotros.</p>
      </Notice>
    );
  }
  return <SignupForm catalog={state} />;
}

export default function SignupApp() {
  const path = window.location.pathname.replace(/\/+$/, "");
  const search = window.location.search;

  // Stable across renders: `Completing` runs it from an effect keyed on its identity.
  const start = useMemo(() => {
    if (path === "/registro/resultado") {
      const { id, clientTransactionId, ctoken } = readReturnParams(search);
      if (!id || !clientTransactionId) return null;
      return () => signupApi.confirm({ id, clientTransactionId, ctoken });
    }
    if (path === "/registro/verificar") {
      const token = new URLSearchParams(search).get("token");
      return token ? () => signupApi.verify(token) : null;
    }
    return null;
  }, [path, search]);

  useEffect(() => {
    document.title = "Crea tu espacio · Argos Suite";
  }, []);

  return (
    <Frame>
      {path === "/registro/resultado" ? (
        <Completing
          start={start}
          working="Confirmando tu pago y creando tu espacio…"
          retry={{ href: "/registro", label: "Volver al registro" }}
        />
      ) : path === "/registro/verificar" ? (
        <Completing
          start={start}
          working="Creando tu espacio…"
          retry={{ href: "/registro?prueba=1", label: "Pedir la prueba de nuevo" }}
        />
      ) : (
        <FormLoader />
      )}
    </Frame>
  );
}
