import { cls } from "../../lib/cls";
import {
  UNIT_NAMES,
  formatMoney,
  type BillingPeriod,
  type Catalog,
  type CatalogPlan,
  type PlanUnit,
  type Quote,
} from "../../lib/billing";

/**
 * Choosing a plan, its units and how to pay for it. Shared by the public signup and by the
 * subscription screen of a trial that is converting, so the two cannot drift apart.
 *
 * Depends on nothing from the application (no session, no router): the signup is its own chunk.
 */

export interface PlanChoice {
  planId: string;
  units: PlanUnit[];
  period: BillingPeriod;
}

/** The units a plan starts with: all of them when there is no choice, otherwise the first ones. */
export function defaultUnits(plan: CatalogPlan): PlanUnit[] {
  return plan.allowedUnits.slice(0, plan.unitCount);
}

export function initialChoice(
  catalog: Catalog,
  preferred?: { planId?: string | null; period?: BillingPeriod; units?: PlanUnit[] },
): PlanChoice {
  const plan =
    catalog.plans.find((candidate) => candidate.id === preferred?.planId) ??
    catalog.plans.find((candidate) => candidate.featured) ??
    catalog.plans[0];
  return {
    planId: plan.id,
    units: fitUnits(plan, preferred?.units ?? []),
    period: preferred?.period ?? "MONTHLY",
  };
}

/** Keeps what still fits the plan, then fills up to what it includes. */
function fitUnits(plan: CatalogPlan, current: readonly PlanUnit[]): PlanUnit[] {
  const kept = current.filter((unit) => plan.allowedUnits.includes(unit)).slice(0, plan.unitCount);
  const filler = plan.allowedUnits.filter((unit) => !kept.includes(unit));
  return [...kept, ...filler].slice(0, plan.unitCount);
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-1"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          disabled={disabled}
          onClick={() => onChange(option.id)}
          className={cls(
            "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
            value === option.id ? "bg-ink text-canvas" : "text-muted hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PlanChooser({
  catalog,
  choice,
  onChange,
  disabled,
  unitsError,
}: {
  catalog: Catalog;
  choice: PlanChoice;
  onChange: (choice: PlanChoice) => void;
  disabled?: boolean;
  unitsError?: string;
}) {
  const plan =
    catalog.plans.find((candidate) => candidate.id === choice.planId) ?? catalog.plans[0];
  const unitChoiceIsFixed = plan.allowedUnits.length === plan.unitCount;

  function toggleUnit(unit: PlanUnit) {
    let units: PlanUnit[];
    if (plan.unitCount === 1) units = [unit];
    else if (choice.units.includes(unit)) units = choice.units.filter((other) => other !== unit);
    // Full already: the new pick replaces the oldest one instead of being refused.
    else units = [...choice.units, unit].slice(-plan.unitCount);
    onChange({ ...choice, units });
  }

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Plan" className="space-y-2">
        {catalog.plans.map((candidate) => {
          const selected = candidate.id === plan.id;
          return (
            <label
              key={candidate.id}
              className={cls(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors",
                selected ? "border-ink bg-surface" : "border-line-subtle hover:border-line",
              )}
            >
              <input
                type="radio"
                name="plan"
                className="mt-1 accent-[var(--color-action)]"
                checked={selected}
                disabled={disabled}
                onChange={() =>
                  onChange({
                    ...choice,
                    planId: candidate.id,
                    units: fitUnits(candidate, choice.units),
                  })
                }
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="font-medium text-ink">{candidate.label}</span>
                  <span className="text-sm text-muted tabular-nums">
                    {formatMoney(
                      choice.period === "ANNUAL" ? candidate.annualCents : candidate.monthlyCents,
                    )}{" "}
                    {choice.period === "ANNUAL" ? "al año" : "al mes"}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-muted">{candidate.summary}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div>
        <p className="label" id="plan-units-label">
          {plan.unitCount === 1 ? "Tu unidad de negocio" : "Tus unidades de negocio"}
        </p>
        {unitChoiceIsFixed ? (
          <p className="text-sm text-muted">
            {plan.allowedUnits.map((unit) => UNIT_NAMES[unit]).join(", ")}
          </p>
        ) : (
          <div role="group" aria-labelledby="plan-units-label" className="flex flex-wrap gap-2">
            {plan.allowedUnits.map((unit, index) => {
              const checked = choice.units.includes(unit);
              return (
                <button
                  key={unit}
                  type="button"
                  data-field={index === 0 ? "units" : undefined}
                  aria-pressed={checked}
                  disabled={disabled}
                  onClick={() => toggleUnit(unit)}
                  className={cls(
                    "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
                    checked
                      ? "border-ink bg-ink text-canvas"
                      : "border-line text-muted hover:text-ink",
                  )}
                >
                  {UNIT_NAMES[unit]}
                </button>
              );
            })}
          </div>
        )}
        {unitsError && <p className="mt-1.5 text-sm text-danger-ink">{unitsError}</p>}
      </div>

      <div>
        <p className="label">Forma de pago</p>
        <Segmented
          label="Forma de pago"
          value={choice.period}
          disabled={disabled}
          onChange={(period) => onChange({ ...choice, period })}
          options={[
            { id: "MONTHLY", label: "Mensual" },
            { id: "ANNUAL", label: "Anual, 2 meses gratis" },
          ]}
        />
      </div>
    </div>
  );
}

/** The lines of a charge: price, founder discount, IVA and what the card pays. */
export function QuoteLines({
  quote,
  label,
  totalLabel,
  vatPercent,
  founderPercent,
}: {
  quote: Quote;
  label: string;
  totalLabel: string;
  vatPercent: number;
  founderPercent: number;
}) {
  return (
    <dl className="space-y-2 text-sm tabular-nums">
      <div className="flex justify-between gap-4">
        <dt className="text-muted">{label}</dt>
        <dd className="text-ink">{formatMoney(quote.subtotalCents)}</dd>
      </div>
      {quote.discountCents > 0 && (
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Precio fundador, {founderPercent}% menos</dt>
          <dd className="text-success-ink">−{formatMoney(quote.discountCents)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4">
        <dt className="text-muted">IVA {vatPercent}%</dt>
        <dd className="text-ink">{formatMoney(quote.taxCents)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t border-line-subtle pt-3">
        <dt className="font-medium text-ink">{totalLabel}</dt>
        <dd className="font-display text-3xl leading-none text-ink">
          {formatMoney(quote.totalCents)}
        </dd>
      </div>
    </dl>
  );
}
