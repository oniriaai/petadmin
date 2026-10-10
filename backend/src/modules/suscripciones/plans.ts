import { BUSINESS_UNITS, type BusinessUnit } from "../../middleware/auth";

/**
 * The plans a visitor can buy from the public page (docs/argos-suite-pricing-proposal.md).
 *
 * A plan is nothing the rest of the system knows about: it is a price and a preset of the
 * business units and product modules the console already toggles. Buying one writes those, and
 * from then on the tenant is gated by its entitlements like any other.
 *
 * Money is integer cents throughout. Prices are before IVA.
 */

export const BILLING_PERIODS = ["MONTHLY", "ANNUAL"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return (BILLING_PERIODS as readonly unknown[]).includes(value);
}

/** The product module that goes with each unit. */
const UNIT_MODULE: Record<BusinessUnit, string> = {
  DAYCARE: "guarderia",
  GROOMING: "peluqueria",
  VETERINARY: "veterinaria",
};

const MANAGEMENT_MODULES = ["finanzas", "inventario", "informes", "cumplimiento"] as const;

export interface Plan {
  id: string;
  label: string;
  /** One line for the pricing card. */
  summary: string;
  monthlyCents: number;
  /** Ten months: two free. */
  annualCents: number;
  /** How many units the buyer picks, out of `allowedUnits`. */
  unitCount: number;
  allowedUnits: readonly BusinessUnit[];
  /** Added to the price when Veterinaria is among the units picked. */
  veterinarySurcharge?: { monthlyCents: number; annualCents: number };
  /** Product modules on top of Reservas and the units' own. */
  addOns: readonly string[];
  /** The plan the page recommends. */
  featured?: true;
}

export const PLANS: readonly Plan[] = [
  {
    id: "inicial",
    label: "Inicial",
    summary: "Una unidad, Guardería o Peluquería, con reservas y agenda.",
    monthlyCents: 2900,
    annualCents: 29000,
    unitCount: 1,
    allowedUnits: ["DAYCARE", "GROOMING"],
    addOns: [],
  },
  {
    id: "inicial-veterinaria",
    label: "Inicial Veterinaria",
    summary: "La clínica: agenda de consultas e historia clínica.",
    monthlyCents: 3900,
    annualCents: 39000,
    unitCount: 1,
    allowedUnits: ["VETERINARY"],
    addOns: [],
  },
  {
    id: "negocio",
    label: "Negocio",
    summary: "Una unidad con finanzas, inventario, informes y alertas.",
    monthlyCents: 4900,
    annualCents: 49000,
    unitCount: 1,
    allowedUnits: BUSINESS_UNITS,
    veterinarySurcharge: { monthlyCents: 1000, annualCents: 10000 },
    addOns: MANAGEMENT_MODULES,
  },
  {
    id: "integral",
    label: "Integral",
    summary: "Dos unidades con todos los módulos y los recordatorios automáticos.",
    monthlyCents: 8900,
    annualCents: 89000,
    unitCount: 2,
    allowedUnits: BUSINESS_UNITS,
    addOns: [...MANAGEMENT_MODULES, "recordatorios"],
    featured: true,
  },
  {
    id: "integral-3",
    label: "Integral 3",
    summary: "Las tres unidades con todos los módulos y los recordatorios automáticos.",
    monthlyCents: 10900,
    annualCents: 109000,
    unitCount: 3,
    allowedUnits: BUSINESS_UNITS,
    addOns: [...MANAGEMENT_MODULES, "recordatorios"],
  },
];

/** What a free trial runs on: everything, so nothing is discovered missing after paying. */
export const TRIAL_PLAN_ID = "integral-3";
export const TRIAL_DAYS = 30;

export const FOUNDER_DISCOUNT_PERCENT = 30;
export const FOUNDER_MONTHS = 12;

export function founderSlots(): number {
  const parsed = Number(process.env.FOUNDER_SLOTS);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 20;
}

/** IVA charged on top of every price. Ecuador's, unless the deployment says otherwise. */
export function billingVatPercent(): number {
  const parsed = Number(process.env.BILLING_VAT_PERCENT);
  return process.env.BILLING_VAT_PERCENT && Number.isFinite(parsed) && parsed >= 0 ? parsed : 15;
}

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === id);
}

export class PlanError extends Error {}

/**
 * The units a buyer picked, checked against the plan and returned in canonical order.
 * Throws `PlanError` with a message fit to show.
 */
export function resolvePlanUnits(plan: Plan, units: readonly string[]): BusinessUnit[] {
  const picked = new Set(units.map((unit) => unit.trim().toUpperCase()));
  const resolved = BUSINESS_UNITS.filter((unit) => picked.has(unit));
  if (resolved.length !== picked.size) {
    throw new PlanError("Unidad de negocio inválida");
  }
  if (resolved.some((unit) => !plan.allowedUnits.includes(unit))) {
    throw new PlanError(`El plan ${plan.label} no incluye esa unidad`);
  }
  if (resolved.length !== plan.unitCount) {
    throw new PlanError(
      plan.unitCount === 1
        ? `El plan ${plan.label} incluye una unidad de negocio`
        : `El plan ${plan.label} incluye ${plan.unitCount} unidades de negocio`,
    );
  }
  return resolved;
}

/** The product modules a plan turns on for the units picked. */
export function planModules(plan: Plan, units: readonly BusinessUnit[]): string[] {
  return ["reservas", ...units.map((unit) => UNIT_MODULE[unit]), ...plan.addOns];
}

/** The list price of one period, before any discount and before IVA. */
export function planPriceCents(
  plan: Plan,
  units: readonly BusinessUnit[],
  period: BillingPeriod,
): number {
  const base = period === "ANNUAL" ? plan.annualCents : plan.monthlyCents;
  if (!plan.veterinarySurcharge || !units.includes("VETERINARY")) return base;
  return (
    base +
    (period === "ANNUAL"
      ? plan.veterinarySurcharge.annualCents
      : plan.veterinarySurcharge.monthlyCents)
  );
}

export interface Quote {
  /** The list price of the period. */
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  /** What the card is charged. */
  totalCents: number;
}

export function quoteFor(priceCents: number, founder: boolean, vatPercent: number): Quote {
  const discountCents = founder ? Math.round((priceCents * FOUNDER_DISCOUNT_PERCENT) / 100) : 0;
  const taxable = priceCents - discountCents;
  const taxCents = Math.round((taxable * vatPercent) / 100);
  return { subtotalCents: priceCents, discountCents, taxCents, totalCents: taxable + taxCents };
}

/**
 * The same day N months later, in UTC. A date that does not exist in the target month (the 31st,
 * the 30th of February) falls back to that month's last day rather than spilling into the next.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function periodEnd(start: Date, period: BillingPeriod): Date {
  return addMonths(start, period === "ANNUAL" ? 12 : 1);
}
