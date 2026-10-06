import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { ArrowRightBold, CheckBold } from "../components/icons/PublicIcons";
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
import { EASE, Reveal, revealStyle, useReveal, useSlidingPill } from "./LandingReveal";

/**
 * The price list on the public page.
 *
 * Every figure comes from `GET /signup/plans`, the same catalog the checkout charges from, so
 * the page cannot advertise a price the server would not honour. If the catalog cannot be read
 * the section is removed and the page falls back to "Escríbenos".
 *
 * While the catalog is on its way the section is already there, with its heading and a
 * placeholder about the height of the list: a section that appeared when the answer arrived
 * pushed everything under it down the page, under the eyes of whoever had scrolled that far.
 * The placeholder cannot know the catalog's exact height (the rows are shorter with nothing to
 * buy, the founder notice comes and goes), so `Pricing` also scrolls by the difference for a
 * reader who is already past the section. Browsers' own scroll anchoring does not do it here.
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
  const slider = useSlidingPill(period);
  return (
    <div
      ref={slider.group}
      role="radiogroup"
      aria-label="Forma de pago"
      className="relative inline-flex rounded-lg border border-line bg-surface p-1"
    >
      {slider.pill("rounded-md bg-ink")}
      {options.map((option) => {
        const selected = period === option.id;
        return (
          <button
            key={option.id}
            ref={slider.option(option.id)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={cls(
              "relative rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              selected ? "text-canvas" : "text-muted hover:text-ink",
            )}
          >
            {option.label}
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
  const ref = useReveal<HTMLLIElement>(0.4);

  return (
    <li
      ref={ref}
      style={revealStyle({ delay: index * 0.05, rise: 14, duration: 0.5 })}
      className={cls(
        "landing-reveal grid grid-cols-1 gap-x-10 gap-y-5 px-5 py-7 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_auto] lg:items-center",
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
            <CheckBold size={15} className="mt-0.5 shrink-0 text-action" aria-hidden="true" />
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
            <ArrowRightBold size={15} aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * Stands in for the list and the trial offer while the catalog loads. The heights are those the
 * five plans take at each breakpoint, so the page below barely moves when they arrive. The
 * founder notice has no place kept: it shows only while founder places remain.
 */
function PricingPlaceholder() {
  return (
    <div aria-hidden="true">
      <ul className="mt-8 divide-y divide-line-subtle border-y border-line-subtle">
        {[0, 1, 2, 3, 4].map((row) => (
          <li
            key={row}
            className="grid min-h-[24.5rem] grid-cols-1 content-start gap-x-10 gap-y-5 px-5 py-7 sm:min-h-[17.5rem] sm:px-8 lg:min-h-[12rem] lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_auto] lg:items-center xl:min-h-[10.75rem]"
          >
            <div>
              <div className="skeleton h-7 w-40" />
              <div className="skeleton mt-3 h-10 w-full max-w-[46ch]" />
            </div>
            <div className="skeleton h-16 w-full" />
            <div className="skeleton h-10 w-36" />
          </li>
        ))}
      </ul>
      <div className="skeleton mt-10 h-[8.25rem] w-full sm:h-[4.875rem] md:h-[3.25rem]" />
    </div>
  );
}

export function Pricing({
  onCatalog,
}: {
  /** Told what the deployment offers once it is known: the catalog, or null when there is none. */
  onCatalog?: (catalog: Catalog | null) => void;
}) {
  // null while the catalog is on its way; "absent" once it is known there is none to show.
  const [catalog, setCatalog] = useState<Catalog | "absent" | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("MONTHLY");

  useEffect(() => {
    let alive = true;
    signupApi
      .catalog()
      .then((data) => {
        if (!alive) return;
        setCatalog(data.plans.length > 0 ? data : "absent");
        onCatalog?.(data.plans.length > 0 ? data : null);
      })
      .catch(() => {
        // No catalog, no prices: the rest of the page still offers a way to get in touch.
        if (!alive) return;
        setCatalog("absent");
        onCatalog?.(null);
      });
    return () => {
      alive = false;
    };
  }, [onCatalog]);

  // What the section last measured, to tell by how much it has just changed. Watched and not
  // only read when the catalog lands: the rows go on settling after that render (text wraps
  // once it is laid out at its real width), and each change would move the page again.
  const section = useRef<HTMLElement>(null);
  const measured = useRef<{ bottom: number; height: number } | null>(null);
  // Where the reader had scrolled to, kept from the scroll events. Near the foot of the page a
  // section that shrinks makes the browser pull the scroll back before anyone can read it.
  const scrolledTo = useRef(0);
  useEffect(() => {
    const read = () => {
      scrolledTo.current = window.scrollY;
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);
  useLayoutEffect(() => {
    const node = section.current;
    function settle() {
      const before = measured.current;
      const height = node?.offsetHeight ?? 0;
      const from = scrolledTo.current;
      // Past the section: most of what is on screen comes after its end, so that stays put.
      const past = before !== null && before.bottom - from <= window.innerHeight / 2;
      if (before && past && height !== before.height) {
        scrolledTo.current = from + height - before.height;
        window.scrollTo({ top: scrolledTo.current, behavior: "instant" });
      }
      measured.current = node
        ? { bottom: node.getBoundingClientRect().bottom + window.scrollY, height }
        : null;
    }
    settle();
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(settle);
    observer.observe(node);
    return () => observer.disconnect();
  }, [catalog]);

  if (catalog === "absent") return null;
  const canBuy = catalog?.checkoutAvailable ?? false;

  return (
    <section ref={section} id="precios" className="scroll-mt-16 border-t border-line-subtle">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="max-w-2xl font-display text-3xl leading-[1.15] text-ink md:text-4xl">
              Contratas solo lo que usas.
            </h2>
            <p className="mt-4 max-w-[58ch] leading-relaxed text-muted">
              Todos los planes incluyen usuarios, tutores y mascotas sin límite, y soporte por
              WhatsApp y correo. Los precios están en dólares y no incluyen el{" "}
              {catalog && `${catalog.vatPercent}% de `}IVA.
            </p>
          </div>
          <PeriodToggle period={period} onChange={setPeriod} />
        </Reveal>

        {!catalog && <PricingPlaceholder />}

        {catalog?.founder.available && canBuy && (
          <Reveal delay={0.08} className="mt-8">
            <p className="rounded-lg border border-line bg-sunken px-4 py-3 text-sm leading-relaxed text-ink">
              <strong className="font-semibold">Precio fundador.</strong> Los primeros negocios
              pagan {catalog.founder.discountPercent}% menos durante {catalog.founder.months} meses.{" "}
              {catalog.founder.slotsLeft === 1
                ? "Queda 1 lugar."
                : `Quedan ${catalog.founder.slotsLeft} lugares.`}
            </p>
          </Reveal>
        )}

        {catalog && (
          <ul className="mt-8 divide-y divide-line-subtle border-y border-line-subtle">
            {catalog.plans.map((plan, index) => (
              <PlanRow key={plan.id} plan={plan} period={period} catalog={catalog} index={index} />
            ))}
          </ul>
        )}

        {catalog?.trial.available && (
          <Reveal className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[60ch] leading-relaxed text-muted">
              <span className="font-medium text-ink">
                {canBuy ? "¿Prefieres verlo antes de pagar?" : "Empieza con la prueba gratuita."}
              </span>{" "}
              Prueba Argos Suite {catalog.trial.days} días con todas las unidades y módulos. No
              pedimos tarjeta.
            </p>
            <a
              href="/registro?prueba=1"
              className={cls(
                "shrink-0 whitespace-nowrap",
                canBuy ? "btn-secondary" : "btn-primary px-5 py-2.5",
              )}
            >
              Probar {catalog.trial.days} días gratis
            </a>
          </Reveal>
        )}
      </div>
    </section>
  );
}
