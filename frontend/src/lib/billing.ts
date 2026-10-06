/**
 * Plans and prices as the public page, the signup and the subscription screen show them.
 *
 * Deliberately free of the application's session and API client: the landing and the signup are
 * their own chunks (src/main.tsx) and a visitor must not download the operator's code to read
 * a price. The catalog itself comes from `GET /signup/plans`; nothing here hard-codes an amount.
 *
 * The arithmetic mirrors `backend/src/modules/suscripciones/plans.ts` so a total can be shown
 * as the form changes. It is a preview: what the card is charged is computed by the server.
 */

const BASE = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:3001/api/v1";

export type BillingPeriod = "MONTHLY" | "ANNUAL";
export type PlanUnit = "DAYCARE" | "GROOMING" | "VETERINARY";

export interface CatalogPlan {
  id: string;
  label: string;
  summary: string;
  monthlyCents: number;
  annualCents: number;
  unitCount: number;
  allowedUnits: PlanUnit[];
  veterinarySurcharge: { monthlyCents: number; annualCents: number } | null;
  /** Product module ids on top of Reservas and the units' own. */
  modules: string[];
  featured: boolean;
}

export interface Catalog {
  plans: CatalogPlan[];
  units: PlanUnit[];
  vatPercent: number;
  founder: { available: boolean; slotsLeft: number; discountPercent: number; months: number };
  trial: { days: number; planId: string; available: boolean };
  checkoutAvailable: boolean;
}

export interface Quote {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

export const UNIT_NAMES: Record<PlanUnit, string> = {
  DAYCARE: "Guardería",
  GROOMING: "Peluquería",
  VETERINARY: "Veterinaria",
};

/** The names BRAND.md gives the modules on a pricing page. */
export const ADD_ON_NAMES: Record<string, string> = {
  finanzas: "Finanzas",
  inventario: "Inventario",
  informes: "Informes",
  cumplimiento: "Contratos y alertas",
  recordatorios: "Recordatorios automáticos",
};

export function planPriceCents(
  plan: CatalogPlan,
  units: readonly PlanUnit[],
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

export function founderPriceCents(priceCents: number, discountPercent: number): number {
  return priceCents - Math.round((priceCents * discountPercent) / 100);
}

export function quoteFor(
  priceCents: number,
  founderDiscountPercent: number,
  vatPercent: number,
): Quote {
  const discountCents = Math.round((priceCents * founderDiscountPercent) / 100);
  const taxable = priceCents - discountCents;
  const taxCents = Math.round((taxable * vatPercent) / 100);
  return { subtotalCents: priceCents, discountCents, taxCents, totalCents: taxable + taxCents };
}

/** "$89" for a round amount, "$102,35" otherwise: prices here are mostly whole dollars. */
export function formatMoney(cents: number): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

export function formatLongDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Turns a business name into a candidate url-safe identifier. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/** A failure answered by the server, with the per-field messages when it sent them. */
export class SignupError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "SignupError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function publicRequest<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new SignupError(
      0,
      "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fields: Record<string, string> = {};
    const raw = (data?.errors?.fieldErrors ?? {}) as Record<string, string[] | undefined>;
    for (const [field, messages] of Object.entries(raw)) {
      if (messages?.[0]) fields[field] = messages[0];
    }
    throw new SignupError(
      res.status,
      data?.message ?? "Algo falló de nuestro lado. Inténtalo de nuevo en un momento.",
      fields,
    );
  }
  return data as T;
}

export interface SignupRequest {
  kind: "PAID" | "TRIAL";
  planId?: string;
  units?: PlanUnit[];
  period: BillingPeriod;
  businessName: string;
  slug: string;
  legalName?: string;
  taxId: string;
  phone: string;
  email: string;
  adminName: string;
  adminUsername: string;
  password: string;
  saveCard: boolean;
  acceptTerms: boolean;
}

export type SignupStarted =
  { next: "payment"; redirectUrl: string } | { next: "verify-email"; email: string };

export type SignupCompleted =
  | {
      status: "provisioned";
      token: string;
      user: Record<string, unknown>;
      daycare: { slug: string; name: string };
    }
  | { status: "already"; daycare: { slug: string } };

export const signupApi = {
  catalog: () => publicRequest<Catalog>("/signup/plans"),
  start: (body: SignupRequest) => publicRequest<SignupStarted>("/signup/intents", body),
  confirm: (body: { id: string; clientTransactionId: string; ctoken: string | null }) =>
    publicRequest<SignupCompleted>("/signup/confirm", body),
  verify: (token: string) => publicRequest<SignupCompleted>("/signup/verify", { token }),
};

/**
 * What PayPhone appends to the return URL. Its documentation spells the second one three
 * different ways, so the names are matched without regard to case.
 */
export function readReturnParams(search: string): {
  id: string | null;
  clientTransactionId: string | null;
  ctoken: string | null;
} {
  const found = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(search)) found.set(key.toLowerCase(), value);
  return {
    id: found.get("id") ?? null,
    clientTransactionId: found.get("clienttransactionid") ?? null,
    ctoken: found.get("ctoken") ?? null,
  };
}
