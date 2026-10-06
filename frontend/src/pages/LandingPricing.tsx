import { useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { cls } from "../lib/cls";
import {
  ADD_ON_NAMES,
  UNIT_NAMES,
  formatMoney,
  founderPriceCents,
  signupApi,
  type BillingPeriod,
  type Catalog,
  type CatalogPlan,
} from "../lib/billing";
import { EASE, Reveal } from "./LandingReveal";

/**
 * The price list on the public page.
 *
 * Every figure comes from `GET /signup/plans`, the same catalog the checkout charges from, so
 * the page cannot advertise a price the server would not honour. If the catalog cannot be read
 * the section is simply absent and the page falls back to "Escríbenos".
 *
 * The prices show whether or not they can be paid online. A deployment with no gateway (the
 * public demo) still has plans and may still offer the trial: there each plan leads to the
 * trial instead of to a checkout, or to nothing when neither is on offer.
 *
 * Set as a list, not a row of cards: five plans read as one ladder, each step adding to the one
 * above, and the eye compares the prices down a single column.
 */

function unitsLine(plan: CatalogPlan): string {
  if (plan.unitCount >= 3) return "Guardería, Peluquería y Veterinaria";
  if (plan.unitCount === 2) return "Dos unidades, las que elijas";
  if (plan.allowedUnits.length === 1) return UNIT_NAMES[plan.allowedUnits[0]];
  if (plan.allowedUnits.length === 2) {
    return `Una unidad: ${plan.allowedUnits.map((unit) => UNIT_NAMES[unit]).join(" o ")}`;
  }
  return "Una unidad, la que elijas";
}

function included(plan: CatalogPlan): string[] {
  return [
    unitsLine(plan),
    "Reservas y agenda",
    ...plan.modules.map((id) => ADD_ON_NAMES[id]).filter(Boolean),
  ];
}

function PeriodToggle({
  period,
  onChange,
}: {
  period: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
}) {
  const options: { id: BillingPeriod; label: string }[] = [
    { id: "MONTHLY", label: "Mensual" },
    { id: "ANNUAL", label: "Anual, 2 meses gratis" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Forma de pago"
      className="inline-flex rounded-lg border border-line bg-surface p-1"
    >
      {options.map((option) => {
        const selected = period === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={cls(
              "relative rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              selected ? "text-canvas" : "text-muted hover:text-ink",
            )}
          >
            {selected && (
              <m.span
                layoutId="period-pill"
                className="absolute inset-0 rounded-md bg-ink"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PlanRow({
  plan,
  period,
  catalog,
  index,
}: {
  plan: CatalogPlan;
  period: BillingPeriod;
  catalog: Catalog;
  index: number;
}) {
  const listCents = period === "ANNUAL" ? plan.annualCents : plan.monthlyCents;
  // The founder price is a price to pay now; with nothing to pay it would only mislead.
  const founder = catalog.founder.available && catalog.checkoutAvailable;
  const cents = founder ? founderPriceCents(listCents, catalog.founder.discountPercent) : listCents;
  const href = `/registro?plan=${plan.id}&periodo=${period === "ANNUAL" ? "anual" : "mensual"}`;
  const canBuy = catalog.checkoutAvailable;

  return (
    <m.li
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.5, delay: index * 0.05, ease: EASE }}
      className={cls(
        "grid grid-cols-1 gap-x-10 gap-y-5 px-5 py-7 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_auto] lg:items-center",
        // The recommended step is lifted onto the surface; the rest lie on the canvas.
        plan.featured && "rounded-xl bg-surface shadow-raised ring-1 ring-ink",
      )}
    >
      <div>
        <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-display text-2xl leading-tight text-ink">
          {plan.label}
          {plan.featured && (
            <span className="rounded-full bg-ink px-2.5 py-0.5 font-sans text-xs font-semibold text-canvas">
              Recomendado
            </span>
          )}
        </h3>
        <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-muted">{plan.summary}</p>
      </div>

      <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm text-ink sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {included(plan).map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Check
              size={15}
              weight="bold"
              className="mt-0.5 shrink-0 text-action"
              aria-hidden="true"
            />
            {item}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 lg:flex-col lg:items-end lg:justify-center">
        <AnimatePresence initial={false}>
          <m.p
            key={period}
            className="lg:text-right"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
          >
            {founder && (
              <s className="mr-2 text-base text-muted tabular-nums">
                <span className="sr-only">Precio normal </span>
                {formatMoney(listCents)}
              </s>
            )}
            <span className="font-display text-4xl leading-none text-ink tabular-nums">
              {formatMoney(cents)}
            </span>
            <span className="ml-1.5 text-sm text-muted">
              {period === "ANNUAL" ? "al año" : "al mes"}
            </span>
            {plan.veterinarySurcharge && (
              <span className="mt-1.5 block text-xs text-muted">
                {formatMoney(
                  period === "ANNUAL"
                    ? plan.veterinarySurcharge.annualCents
                    : plan.veterinarySurcharge.monthlyCents,
                )}{" "}
                más si la unidad es Veterinaria
              </span>
            )}
          </m.p>
        </AnimatePresence>
        {canBuy && (
          <a
            href={href}
            className={cls(
              "whitespace-nowrap",
              plan.featured ? "btn-primary px-5 py-2.5" : "btn-secondary",
            )}
          >
            Contratar {plan.label}
            <ArrowRight size={15} weight="bold" aria-hidden="true" />
          </a>
        )}
      </div>
    </m.li>
  );
}

export function Pricing() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("MONTHLY");

  useEffect(() => {
    let alive = true;
    signupApi
      .catalog()
      .then((data) => {
        if (alive) setCatalog(data);
      })
      .catch(() => {
        // No catalog, no prices: the rest of the page still offers a way to get in touch.
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!catalog || catalog.plans.length === 0) return null;
  const { founder, trial } = catalog;
  const canBuy = catalog.checkoutAvailable;

  return (
    <section id="precios" className="scroll-mt-16 border-t border-line-subtle">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="max-w-2xl font-display text-3xl leading-[1.15] text-ink md:text-4xl">
              Contratas solo lo que usas.
            </h2>
            <p className="mt-4 max-w-[58ch] leading-relaxed text-muted">
              Todos los planes incluyen usuarios, tutores y mascotas sin límite, y soporte por
              WhatsApp y correo. Los precios están en dólares y no incluyen el {catalog.vatPercent}%
              de IVA.
            </p>
          </div>
          <PeriodToggle period={period} onChange={setPeriod} />
        </Reveal>

        {founder.available && canBuy && (
          <Reveal delay={0.08} className="mt-8">
            <p className="rounded-lg border border-line bg-sunken px-4 py-3 text-sm leading-relaxed text-ink">
              <strong className="font-semibold">Precio fundador.</strong> Los primeros negocios
              pagan {founder.discountPercent}% menos durante {founder.months} meses.{" "}
              {founder.slotsLeft === 1 ? "Queda 1 lugar." : `Quedan ${founder.slotsLeft} lugares.`}
            </p>
          </Reveal>
        )}

        <ul className="mt-8 divide-y divide-line-subtle border-y border-line-subtle">
          {catalog.plans.map((plan, index) => (
            <PlanRow key={plan.id} plan={plan} period={period} catalog={catalog} index={index} />
          ))}
        </ul>

        {trial.available && (
          <Reveal className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[60ch] leading-relaxed text-muted">
              <span className="font-medium text-ink">
                {canBuy ? "¿Prefieres verlo antes de pagar?" : "Empieza con la prueba gratuita."}
              </span>{" "}
              Prueba Argos Suite {trial.days} días con todas las unidades y módulos. No pedimos
              tarjeta.
            </p>
            <a
              href="/registro?prueba=1"
              className={cls(
                "shrink-0 whitespace-nowrap",
                canBuy ? "btn-secondary" : "btn-primary px-5 py-2.5",
              )}
            >
              Probar {trial.days} días gratis
            </a>
          </Reveal>
        )}
      </div>
    </section>
  );
}
