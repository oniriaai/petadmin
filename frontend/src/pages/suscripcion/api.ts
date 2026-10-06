import { api } from "../../lib/api";
import type { BillingPeriod, PlanUnit, Quote } from "../../lib/billing";
import type { SubscriptionSummary } from "../../modules/shared/contracts";

/** The shape of `GET /billing`. */
export interface BillingState {
  subscription: SubscriptionSummary & {
    units: PlanUnit[];
    /** The list price of one period, before discount and IVA. */
    priceCents: number;
    founderUntil: string | null;
    card: { brand: string | null; lastDigits: string | null } | null;
  };
  /** Null while nothing can be paid: the plan is up to date and not close to renewing. */
  nextPayment: {
    /** CONVERSION: never paid, so the plan is chosen now. MANUAL: the plan it already has. */
    kind: "CONVERSION" | "MANUAL";
    quote: Quote | null;
    periodStart: string;
    periodEnd: string | null;
  } | null;
  founderAvailable: boolean;
  vatPercent: number;
  payments: Array<{
    id: string;
    kind: string;
    planId: string;
    planLabel: string;
    period: BillingPeriod;
    totalCents: number;
    status: string;
    createdAt: string;
  }>;
}

export const billingApi = {
  state: () => api.get<BillingState>("/billing"),
  checkout: (body: {
    planId?: string;
    units?: PlanUnit[];
    period?: BillingPeriod;
    saveCard: boolean;
  }) => api.post<{ redirectUrl: string }>("/billing/checkout", body),
  confirm: (body: { id: string; clientTransactionId: string; ctoken: string | null }) =>
    api.post<BillingState>("/billing/confirm", body),
  removeCard: () => api.del<BillingState>("/billing/card"),
};
