import { randomBytes } from "node:crypto";

import type { Prisma, Subscription, SubscriptionPayment } from "@prisma/client";

import { prisma } from "../../db";
import {
  PaymentError,
  chargeToken,
  confirm,
  prepare,
  reverse,
  type ChargeResult,
} from "../../core/payments/payphone";
import { toE164 } from "../../core/messaging";
import { withVerifiedScope } from "../../core/tenancy/guard";
import { invalidatePrincipalsForDaycare } from "../../core/tenancy/principal";
import { AuthzError, BUSINESS_UNITS, type BusinessUnit } from "../../middleware/auth";
import { logger } from "../../middleware/observability";
import { TOGGLEABLE_PRODUCT_MODULES } from "../../platform/product-modules";
import { setEntitlements, updateDaycare } from "../platform-admin";
import {
  sendPaymentFailedEmail,
  sendReceiptEmail,
  sendRenewalDueEmail,
  sendSuspendedEmail,
  sendTrialEndingEmail,
  siteUrl,
} from "./emails";
import {
  FOUNDER_MONTHS,
  PlanError,
  addMonths,
  billingVatPercent,
  founderSlots,
  getPlan,
  isBillingPeriod,
  periodEnd,
  planModules,
  planPriceCents,
  quoteFor,
  resolvePlanUnits,
  type BillingPeriod,
  type Plan,
  type Quote,
} from "./plans";
import { decryptSecret, encryptSecret } from "./secrets";

/**
 * The life of a subscription after signup: what it is, paying for it from inside the product,
 * and the pass that renews, chases and suspends.
 *
 * A daycare with no subscription row is managed by the vendor from the console. Nothing here
 * bills it, mails it or suspends it.
 */

export const SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

const DAY_MS = 86_400_000;
/** How long an unpaid renewal keeps its access before the tenant is suspended. */
export const GRACE_DAYS = 7;
/** Days after the due date on which a declined card is tried again. */
const RETRY_DAYS = [1, 3, 5] as const;
/** How early an admin may pay the next period from inside. */
const EARLY_RENEWAL_DAYS = 15;
/** When a tenant with no saved card is told its renewal is coming. */
const RENEWAL_NOTICE_DAYS = 5;
const TRIAL_NOTICE_DAYS = [7, 1] as const;
const ERROR_MAX_LENGTH = 300;

/** Sixteen hex characters: unguessable, and short enough for PayPhone's transaction id. */
export function newClientTransactionId(): string {
  return randomBytes(8).toString("hex");
}

function parseUnits(units: string): BusinessUnit[] {
  const owned = units.split(",").map((unit) => unit.trim().toUpperCase());
  return BUSINESS_UNITS.filter((unit) => owned.includes(unit));
}

function planLabel(planId: string): string {
  return getPlan(planId)?.label ?? planId;
}

// --- founder price -------------------------------------------------------------

/**
 * Founder slots still open: those not yet held by a paying tenant, less the ones quoted to a
 * signup that is at the gateway right now, so the page does not promise a twenty-first.
 *
 * Counts across tenants by design, hence the verified scope when a tenant's request asks.
 */
export async function founderSlotsLeft(now = new Date()): Promise<number> {
  const [held, quoted] = await withVerifiedScope(
    "founder slots are a platform-wide count, not tenant data",
    async () =>
      await Promise.all([
        prisma.subscription.count({ where: { founderNumber: { not: null } } }),
        prisma.signupIntent.count({
          where: { kind: "PAID", status: "PENDING", founder: true, expiresAt: { gt: now } },
        }),
      ]),
  );
  return Math.max(0, founderSlots() - held - quoted);
}

/** Whether a period starting at `start` is charged at the founder price. */
function founderApplies(
  subscription: Pick<Subscription, "founderNumber" | "founderUntil">,
  start: Date,
): boolean {
  return (
    subscription.founderNumber !== null &&
    subscription.founderUntil !== null &&
    start < subscription.founderUntil
  );
}

// --- read side -----------------------------------------------------------------

export interface SubscriptionSummary {
  status: SubscriptionStatus;
  planId: string;
  planLabel: string;
  period: BillingPeriod;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  /** When access stops unless a payment arrives. Null while nothing is owed. */
  suspendsAt: Date | null;
  hasCard: boolean;
}

function suspendsAt(subscription: Subscription): Date | null {
  if (subscription.status === "TRIALING") return subscription.trialEndsAt;
  if (subscription.status === "PAST_DUE" && subscription.pastDueSince) {
    return new Date(subscription.pastDueSince.getTime() + GRACE_DAYS * DAY_MS);
  }
  return null;
}

function toSummary(subscription: Subscription): SubscriptionSummary {
  return {
    status: subscription.status as SubscriptionStatus,
    planId: subscription.planId,
    planLabel: planLabel(subscription.planId),
    period: subscription.period as BillingPeriod,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    suspendsAt: suspendsAt(subscription),
    hasCard: subscription.cardToken !== null,
  };
}

/** What `/auth/me` tells the client. Null for a daycare the vendor manages by hand. */
export async function getSubscriptionSummary(
  daycareId: string,
): Promise<SubscriptionSummary | null> {
  const subscription = await prisma.subscription.findUnique({ where: { daycareId } });
  return subscription ? toSummary(subscription) : null;
}

/**
 * Whether reminders may go out by WhatsApp for this tenant. Not during a trial: every WhatsApp
 * message is paid for by the platform, and a trial must cost nothing.
 */
export async function isWhatsAppIncluded(daycareId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findUnique({
    where: { daycareId },
    select: { status: true },
  });
  return subscription?.status !== "TRIALING";
}

async function requireSubscription(daycareId: string): Promise<Subscription> {
  const subscription = await prisma.subscription.findUnique({ where: { daycareId } });
  if (!subscription) {
    throw new AuthzError(
      404,
      "Esta cuenta no tiene una suscripción en línea. Escríbenos para cualquier cambio en tu plan.",
    );
  }
  return subscription;
}

/** What the next payment would be, when one can be made now. */
interface NextPayment {
  kind: "CONVERSION" | "MANUAL";
  /** Null for a tenant that never paid: it picks the plan at checkout. */
  quote: Quote | null;
  periodStart: Date;
}

function nextPayment(subscription: Subscription, now: Date): NextPayment | null {
  // Never paid: a trial, or a trial that ran out. The plan is chosen at checkout.
  if (!subscription.currentPeriodEnd) {
    return { kind: "CONVERSION", quote: null, periodStart: now };
  }
  const status = subscription.status as SubscriptionStatus;
  const dueSoon =
    status === "ACTIVE" &&
    subscription.currentPeriodEnd.getTime() - now.getTime() <= EARLY_RENEWAL_DAYS * DAY_MS;
  if (status !== "PAST_DUE" && status !== "SUSPENDED" && !dueSoon) return null;

  // A suspended tenant lost the days it did not pay for; it does not owe them. Its new period
  // starts when it pays. One still in grace kept its access, so the period runs on unbroken.
  const periodStart = status === "SUSPENDED" ? now : subscription.currentPeriodEnd;
  return {
    kind: "MANUAL",
    quote: quoteFor(
      subscription.priceCents,
      founderApplies(subscription, periodStart),
      billingVatPercent(),
    ),
    periodStart,
  };
}

export async function getBillingState(daycareId: string) {
  const subscription = await requireSubscription(daycareId);
  const now = new Date();
  const [payments, daycare, slotsLeft] = await Promise.all([
    prisma.subscriptionPayment.findMany({
      where: { daycareId, status: { in: ["APPROVED", "DECLINED", "REVERSED"] } },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true,
        kind: true,
        planId: true,
        period: true,
        periodStart: true,
        periodEnd: true,
        totalCents: true,
        status: true,
        cardBrand: true,
        cardLastDigits: true,
        createdAt: true,
      },
    }),
    prisma.daycare.findUnique({ where: { id: daycareId }, select: { units: true } }),
    subscription.founderNumber === null ? founderSlotsLeft(now) : Promise.resolve(0),
  ]);
  const next = nextPayment(subscription, now);

  return {
    subscription: {
      ...toSummary(subscription),
      units: parseUnits(daycare?.units ?? ""),
      priceCents: subscription.priceCents,
      founderUntil: subscription.founderNumber !== null ? subscription.founderUntil : null,
      card:
        subscription.cardToken !== null
          ? { brand: subscription.cardBrand, lastDigits: subscription.cardLastDigits }
          : null,
    },
    nextPayment: next && {
      kind: next.kind,
      quote: next.quote,
      periodStart: next.periodStart,
      periodEnd: next.quote
        ? periodEnd(next.periodStart, subscription.period as BillingPeriod)
        : null,
    },
    /** For the plan picker of a tenant that has not paid yet. */
    founderAvailable: slotsLeft > 0,
    vatPercent: billingVatPercent(),
    payments: payments.map((payment) => ({ ...payment, planLabel: planLabel(payment.planId) })),
  };
}

// --- applying an approved charge -----------------------------------------------

/**
 * What an approved charge does to the subscription: the period it bought, the plan when this
 * payment chose one, the founder slot when the price was quoted with it, and the card when the
 * payer agreed to keep it.
 *
 * Runs inside the caller's transaction, beside the update of the payment row.
 */
export async function subscriptionDataForCharge(
  tx: Prisma.TransactionClient,
  current: Pick<Subscription, "founderNumber" | "cardHolder"> | null,
  payment: SubscriptionPayment,
  charge: ChargeResult,
  periodStart: Date,
) {
  const period = payment.period as BillingPeriod;
  const data: Prisma.SubscriptionUncheckedUpdateInput = {
    status: "ACTIVE",
    planId: payment.planId,
    period,
    priceCents: payment.subtotalCents,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd(periodStart, period),
    failedAttempts: 0,
    nextAttemptAt: null,
    pastDueSince: null,
    lastNotice: null,
  };

  if (payment.discountCents > 0 && (current?.founderNumber ?? null) === null) {
    // Serialises the two payments that could otherwise both read the same maximum. The unique
    // index on "founderNumber" is what guarantees it; the lock keeps the loser from failing.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7305221)`;
    const { _max } = await withVerifiedScope(
      "the next founder number is a platform-wide sequence",
      async () => await tx.subscription.aggregate({ _max: { founderNumber: true } }),
    );
    data.founderNumber = (_max.founderNumber ?? 0) + 1;
    data.founderUntil = addMonths(periodStart, FOUNDER_MONTHS);
  }

  if (payment.saveCard && charge.cardToken && payment.kind !== "RENEWAL") {
    data.cardToken = encryptSecret(charge.cardToken);
    data.cardHolder = charge.cardHolderName
      ? encryptSecret(charge.cardHolderName)
      : (current?.cardHolder ?? null);
    data.cardBrand = charge.cardBrand;
    data.cardLastDigits = charge.lastDigits;
    data.payerEmail = charge.payerEmail;
    data.payerPhone = charge.payerPhone;
    data.payerDocument = charge.payerDocument;
  }
  return data;
}

export function paymentDataForCharge(charge: ChargeResult, periodStart: Date, period: string) {
  return {
    status: "APPROVED",
    periodStart,
    periodEnd: periodEnd(periodStart, period as BillingPeriod),
    payphoneTransactionId: charge.transactionId,
    authorizationCode: charge.authorizationCode,
    cardBrand: charge.cardBrand,
    cardLastDigits: charge.lastDigits,
    confirmedAt: new Date(),
    error: null,
  };
}

/** Gives the money back for a charge that was approved and then could not be honoured. */
export async function reverseQuietly(charge: ChargeResult): Promise<void> {
  if (!charge.transactionId) return;
  try {
    await reverse(charge.transactionId);
  } catch (error) {
    // Nothing else can be done from here, and someone has to return this money by hand.
    logger.error(
      { err: error, transactionId: charge.transactionId },
      "[billing] no se pudo reversar un cobro aprobado: hay que devolverlo desde PayPhone",
    );
  }
}

export function truncate(message: string | null | undefined): string | null {
  return message ? message.slice(0, ERROR_MAX_LENGTH) : null;
}

// --- paying from inside ----------------------------------------------------------

export interface CheckoutInput {
  planId?: string;
  units?: string[];
  period?: string;
  saveCard?: boolean;
}

/** The plan a tenant that never paid is choosing now. Throws 400 with a message fit to show. */
function resolveChoice(input: CheckoutInput): {
  plan: Plan;
  units: BusinessUnit[];
  period: BillingPeriod;
} {
  const plan = input.planId ? getPlan(input.planId) : undefined;
  if (!plan) throw new AuthzError(400, "Elige un plan");
  if (!isBillingPeriod(input.period)) throw new AuthzError(400, "Elige pago mensual o anual");
  try {
    return { plan, units: resolvePlanUnits(plan, input.units ?? []), period: input.period };
  } catch (error) {
    if (error instanceof PlanError) throw new AuthzError(400, error.message);
    throw error;
  }
}

/**
 * Refuses, before any money moves, a plan that drops a unit somebody still works in. The
 * console refuses the same change for the same reason (`updateDaycare`); finding out after the
 * charge would mean reversing it.
 */
async function assertUnitsCanBeKept(daycareId: string, units: readonly BusinessUnit[]) {
  const stranded = await prisma.user.findMany({
    where: { daycareId, isActive: true, businessUnit: { notIn: [...units, "GLOBAL"] } },
    select: { username: true },
  });
  if (stranded.length > 0) {
    throw new AuthzError(
      409,
      `Ese plan no incluye una unidad con usuarios activos (${stranded
        .map((user) => user.username)
        .join(", ")}). Desactívalos o elige un plan que la incluya.`,
    );
  }
}

export async function startCheckout(
  daycareId: string,
  input: CheckoutInput,
): Promise<{ redirectUrl: string }> {
  const subscription = await requireSubscription(daycareId);
  const now = new Date();
  const next = nextPayment(subscription, now);
  if (!next) {
    throw new AuthzError(409, "Tu plan está al día. Podrás renovarlo cuando se acerque la fecha.");
  }

  const daycare = await prisma.daycare.findUnique({
    where: { id: daycareId },
    select: { units: true, name: true },
  });
  if (!daycare) throw new AuthzError(404, "Guardería no encontrada");

  let planId = subscription.planId;
  let units = parseUnits(daycare.units);
  let period = subscription.period as BillingPeriod;
  let quote = next.quote;

  if (next.kind === "CONVERSION") {
    const choice = resolveChoice(input);
    await assertUnitsCanBeKept(daycareId, choice.units);
    planId = choice.plan.id;
    units = choice.units;
    period = choice.period;
    quote = quoteFor(
      planPriceCents(choice.plan, choice.units, choice.period),
      subscription.founderNumber === null && (await founderSlotsLeft(now)) > 0,
      billingVatPercent(),
    );
  }
  if (!quote) throw new AuthzError(400, "Elige un plan");

  const payment = await prisma.subscriptionPayment.create({
    data: {
      daycareId,
      subscriptionId: subscription.id,
      clientTransactionId: newClientTransactionId(),
      kind: next.kind,
      planId,
      units: units.join(","),
      period,
      ...quote,
      saveCard: input.saveCard === true,
    },
  });

  try {
    return await prepare({
      clientTransactionId: payment.clientTransactionId,
      reference: `Argos Suite ${planLabel(planId)}`,
      taxableCents: quote.subtotalCents - quote.discountCents,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      responseUrl: `${siteUrl()}/suscripcion`,
      cancellationUrl: `${siteUrl()}/suscripcion?cancelado=1`,
      payer: {
        email: subscription.billingEmail,
        phone: toE164(subscription.phone),
        document: subscription.taxId,
      },
    });
  } catch (error) {
    if (error instanceof PaymentError) throw new AuthzError(502, error.message);
    throw error;
  }
}

export interface ConfirmCheckoutInput {
  id: string;
  clientTransactionId: string;
  ctoken?: string | null;
}

export async function confirmCheckout(daycareId: string, input: ConfirmCheckoutInput) {
  // Scoped to the caller's daycare: another tenant's transaction id reads as absent.
  const payment = await prisma.subscriptionPayment.findFirst({
    where: { clientTransactionId: input.clientTransactionId, daycareId },
  });
  if (!payment || !payment.subscriptionId) throw new AuthzError(404, "Pago no encontrado");
  // The browser came back twice (a reload of the return page): the first one settled it.
  if (payment.status === "APPROVED") return getBillingState(daycareId);
  if (payment.status !== "PENDING") {
    throw new AuthzError(409, "Este pago no se completó. Inicia uno nuevo.");
  }

  let charge: ChargeResult;
  try {
    charge = await confirm({
      id: input.id,
      clientTransactionId: payment.clientTransactionId,
      cardToken: input.ctoken ?? null,
    });
  } catch (error) {
    if (error instanceof PaymentError) throw new AuthzError(502, error.message);
    throw error;
  }

  if (!charge.approved) {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: "DECLINED", error: truncate(charge.message) ?? "Pago no aprobado" },
    });
    throw new AuthzError(402, "El pago no fue aprobado. Puedes intentarlo con otra tarjeta.");
  }

  const refuse = async (status: number, message: string, error: unknown): Promise<never> => {
    await reverseQuietly(charge);
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: "REVERSED",
        payphoneTransactionId: charge.transactionId,
        error: truncate(error instanceof Error ? error.message : String(error)),
      },
    });
    throw new AuthzError(status, message);
  };

  if (charge.amountCents !== null && charge.amountCents !== payment.totalCents) {
    await refuse(
      409,
      "El importe cobrado no coincide con el del plan. Reversamos el cobro; inténtalo de nuevo.",
      "importe distinto del presupuestado",
    );
  }

  const subscription = await requireSubscription(daycareId);
  const next = nextPayment(subscription, new Date());
  const periodStart = next?.periodStart ?? subscription.currentPeriodEnd ?? new Date();
  const units = parseUnits(payment.units);

  try {
    if (payment.kind === "CONVERSION") {
      // The plan's shape first, through the same two services the console uses, so the rules
      // about units and module dependencies are the console's and not a second copy.
      const plan = getPlan(payment.planId);
      if (!plan) throw new Error(`Plan desconocido: ${payment.planId}`);
      const enabled = new Set(planModules(plan, units));
      await updateDaycare(daycareId, { units });
      await setEntitlements(
        daycareId,
        TOGGLEABLE_PRODUCT_MODULES.map((productModule) => ({
          moduleId: productModule.id,
          isEnabled: enabled.has(productModule.id),
        })),
      );
    }

    await prisma.$transaction(async (tx) => {
      // The claim: of two confirmations of the same payment, one finds it still pending.
      const claimed = await tx.subscriptionPayment.updateMany({
        where: { id: payment.id, daycareId, status: "PENDING" },
        data: paymentDataForCharge(charge, periodStart, payment.period),
      });
      if (claimed.count === 0) return;
      await tx.subscription.update({
        where: { id: subscription.id },
        data: await subscriptionDataForCharge(tx, subscription, payment, charge, periodStart),
      });
    });
  } catch (error) {
    logger.error({ err: error, daycareId }, "[billing] un pago aprobado no se pudo aplicar");
    await refuse(
      error instanceof AuthzError ? error.status : 500,
      error instanceof AuthzError
        ? `${error.message} Reversamos el cobro.`
        : "No pudimos aplicar el pago y reversamos el cobro. Inténtalo de nuevo.",
      error,
    );
  }

  // The suspension rides on the per-request principal status.
  invalidatePrincipalsForDaycare(daycareId);

  const daycare = await prisma.daycare.findUnique({
    where: { id: daycareId },
    select: { name: true },
  });
  void sendReceiptEmail(
    {
      to: subscription.billingEmail,
      business: daycare?.name ?? "",
      plan: planLabel(payment.planId),
    },
    {
      totalCents: payment.totalCents,
      paidUntil: periodEnd(periodStart, payment.period as BillingPeriod),
      automatic: false,
    },
  );

  return getBillingState(daycareId);
}

/** Forgets the saved card. Renewals then wait for the admin to pay them from inside. */
export async function removeCard(daycareId: string) {
  const subscription = await requireSubscription(daycareId);
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      cardToken: null,
      cardHolder: null,
      cardBrand: null,
      cardLastDigits: null,
      payerEmail: null,
      payerPhone: null,
      payerDocument: null,
    },
  });
  return getBillingState(daycareId);
}

// --- the vendor's view -------------------------------------------------------------

export async function getSubscriptionForConsole(daycareId: string) {
  const subscription = await prisma.subscription.findUnique({ where: { daycareId } });
  if (!subscription) return null;
  return {
    ...toSummary(subscription),
    priceCents: subscription.priceCents,
    founderNumber: subscription.founderNumber,
    founderUntil: subscription.founderUntil,
    billingEmail: subscription.billingEmail,
    failedAttempts: subscription.failedAttempts,
  };
}

export interface ConsoleSubscriptionUpdate {
  status?: SubscriptionStatus;
  trialEndsAt?: Date;
  currentPeriodEnd?: Date;
}

/** The vendor's override: extend a trial, forgive a period, suspend or lift a suspension. */
export async function updateSubscriptionFromConsole(
  daycareId: string,
  input: ConsoleSubscriptionUpdate,
) {
  const subscription = await requireSubscription(daycareId);
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: input.status,
      trialEndsAt: input.trialEndsAt,
      currentPeriodEnd: input.currentPeriodEnd,
      // A hand-set state starts clean: no retry inherited from before, no notice held back.
      failedAttempts: 0,
      nextAttemptAt: null,
      pastDueSince: input.status === "PAST_DUE" ? new Date() : null,
      lastNotice: null,
    },
  });
  invalidatePrincipalsForDaycare(daycareId);
  return getSubscriptionForConsole(daycareId);
}

// --- the scheduled pass --------------------------------------------------------------

export interface BillingRunStats {
  renewed: number;
  declined: number;
  suspended: number;
  noticed: number;
  failures: Array<{ daycareId: string; error: string }>;
}

type SubscriptionWithDaycare = Subscription & { daycare: { name: string; units: string } };

function account(subscription: SubscriptionWithDaycare) {
  return {
    to: subscription.billingEmail,
    business: subscription.daycare.name,
    plan: planLabel(subscription.planId),
  };
}

async function suspend(
  subscription: SubscriptionWithDaycare,
  reason: "trial" | "unpaid",
): Promise<void> {
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "SUSPENDED", nextAttemptAt: null },
  });
  invalidatePrincipalsForDaycare(subscription.daycareId);
  await sendSuspendedEmail(account(subscription), reason);
}

/** Records that a notice went out, and reports whether this run is the one that sends it. */
async function claimNotice(subscription: Subscription, notice: string): Promise<boolean> {
  if (subscription.lastNotice === notice) return false;
  // Conditional on the value read, so two overlapping runs cannot both send it.
  const claimed = await prisma.subscription.updateMany({
    where: { id: subscription.id, lastNotice: subscription.lastNotice },
    data: { lastNotice: notice },
  });
  return claimed.count === 1;
}

/**
 * One attempt at charging the saved card for the period that is due.
 *
 * The payment row is written BEFORE the charge, under a unique key naming the period and the
 * attempt: two overlapping runs cannot both insert it, so they cannot both charge. Returns null
 * when another run holds the attempt.
 */
async function chargeRenewal(
  subscription: SubscriptionWithDaycare,
  periodStart: Date,
  quote: Quote,
): Promise<{ approved: boolean } | null> {
  const cardToken = decryptSecret(subscription.cardToken);
  const cardHolderName = decryptSecret(subscription.cardHolder);
  const phone = toE164(subscription.payerPhone);
  const hasCard =
    cardToken && cardHolderName && subscription.payerEmail && phone && subscription.payerDocument;

  let payment: SubscriptionPayment;
  try {
    payment = await prisma.subscriptionPayment.create({
      data: {
        daycareId: subscription.daycareId,
        subscriptionId: subscription.id,
        clientTransactionId: newClientTransactionId(),
        dedupeKey: `RENEWAL:${subscription.id}:${periodStart.toISOString()}:${subscription.failedAttempts}`,
        kind: "RENEWAL",
        planId: subscription.planId,
        units: subscription.daycare.units,
        period: subscription.period,
        ...quote,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return null;
    throw error;
  }

  let charge: ChargeResult | null = null;
  let failure: string | null = hasCard ? null : "No hay una tarjeta guardada";
  if (hasCard) {
    try {
      charge = await chargeToken({
        clientTransactionId: payment.clientTransactionId,
        reference: `Argos Suite ${planLabel(subscription.planId)}`,
        productName: `Argos Suite ${planLabel(subscription.planId)}`,
        taxableCents: quote.subtotalCents - quote.discountCents,
        taxCents: quote.taxCents,
        totalCents: quote.totalCents,
        cardToken,
        cardHolderName,
        payer: { email: subscription.payerEmail!, phone, document: subscription.payerDocument! },
      });
      if (!charge.approved) failure = charge.message ?? "Tarjeta rechazada";
    } catch (error) {
      // An outage at the gateway is not the customer's card failing, but the outcome for this
      // run is the same: not paid, try again on the next retry day.
      failure = error instanceof Error ? error.message : String(error);
    }
  }

  if (!charge?.approved) {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: "DECLINED", error: truncate(failure) },
    });
    return { approved: false };
  }

  const approved = charge;
  await prisma.$transaction(async (tx) => {
    await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: paymentDataForCharge(approved, periodStart, payment.period),
    });
    await tx.subscription.update({
      where: { id: subscription.id },
      data: await subscriptionDataForCharge(tx, subscription, payment, approved, periodStart),
    });
  });
  await sendReceiptEmail(account(subscription), {
    totalCents: quote.totalCents,
    paidUntil: periodEnd(periodStart, subscription.period as BillingPeriod),
    automatic: true,
  });
  return { approved: true };
}

async function processTrial(
  subscription: SubscriptionWithDaycare,
  now: Date,
  stats: BillingRunStats,
): Promise<void> {
  const endsAt = subscription.trialEndsAt;
  if (!endsAt) return;
  if (endsAt <= now) {
    await suspend(subscription, "trial");
    stats.suspended += 1;
    return;
  }
  const daysLeft = Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS);
  // The closest threshold already crossed: a run that missed the seven-day one does not send
  // it late on top of the one-day one.
  const threshold = [...TRIAL_NOTICE_DAYS].reverse().find((days) => daysLeft <= days);
  if (threshold === undefined) return;
  if (await claimNotice(subscription, `TRIAL_${threshold}:${endsAt.toISOString()}`)) {
    await sendTrialEndingEmail(account(subscription), { endsAt, daysLeft });
    stats.noticed += 1;
  }
}

async function processPaid(
  subscription: SubscriptionWithDaycare,
  now: Date,
  stats: BillingRunStats,
): Promise<void> {
  const dueAt = subscription.currentPeriodEnd;
  if (!dueAt) return;
  const status = subscription.status as SubscriptionStatus;
  const quote = quoteFor(
    subscription.priceCents,
    founderApplies(subscription, dueAt),
    billingVatPercent(),
  );

  if (status === "ACTIVE" && dueAt > now) {
    // With a card on file the renewal just happens. Without one, the admin has to do it.
    const noticeFrom = dueAt.getTime() - RENEWAL_NOTICE_DAYS * DAY_MS;
    if (
      subscription.cardToken === null &&
      now.getTime() >= noticeFrom &&
      (await claimNotice(subscription, `RENEW:${dueAt.toISOString()}`))
    ) {
      await sendRenewalDueEmail(account(subscription), { dueAt, totalCents: quote.totalCents });
      stats.noticed += 1;
    }
    return;
  }

  const graceEnds = new Date(dueAt.getTime() + GRACE_DAYS * DAY_MS);
  if (status === "PAST_DUE") {
    if (graceEnds <= now) {
      await suspend(subscription, "unpaid");
      stats.suspended += 1;
      return;
    }
    if (!subscription.nextAttemptAt || subscription.nextAttemptAt > now) return;
  }

  if (subscription.cardToken === null) {
    // Nothing to charge: the period lapses and the admin is asked to pay from inside. The
    // conditional write is the claim, so of two runs only one sends the email.
    const lapsed = await prisma.subscription.updateMany({
      where: { id: subscription.id, status: "ACTIVE" },
      data: { status: "PAST_DUE", pastDueSince: dueAt, nextAttemptAt: null },
    });
    if (lapsed.count === 1) {
      stats.declined += 1;
      invalidatePrincipalsForDaycare(subscription.daycareId);
      await sendPaymentFailedEmail(account(subscription), {
        totalCents: quote.totalCents,
        suspendsAt: graceEnds,
        hadCard: false,
      });
    }
    return;
  }

  const result = await chargeRenewal(subscription, dueAt, quote);
  if (!result) return;
  if (result.approved) {
    stats.renewed += 1;
    return;
  }

  stats.declined += 1;
  const attempts = subscription.failedAttempts + 1;
  const retryDay = RETRY_DAYS[attempts - 1];
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "PAST_DUE",
      pastDueSince: dueAt,
      failedAttempts: attempts,
      nextAttemptAt: retryDay === undefined ? null : new Date(dueAt.getTime() + retryDay * DAY_MS),
    },
  });
  invalidatePrincipalsForDaycare(subscription.daycareId);
  // Once, when the period lapses. The retries are silent: three more emails in five days
  // saying the same thing would be noise.
  if (status === "ACTIVE") {
    await sendPaymentFailedEmail(account(subscription), {
      totalCents: quote.totalCents,
      suspendsAt: graceEnds,
      hadCard: true,
    });
  }
}

/**
 * The scheduled pass: tells trials they are ending and suspends the ones that ended, renews
 * what is due, retries what was declined and suspends what stayed unpaid past the grace period.
 *
 * Safe to run as often as wanted, and twice at once: every charge and every notice is claimed
 * in the database before it happens.
 */
export async function runBillingCycle(now = new Date()): Promise<BillingRunStats> {
  const stats: BillingRunStats = {
    renewed: 0,
    declined: 0,
    suspended: 0,
    noticed: 0,
    failures: [],
  };
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
      // A daycare the vendor switched off is not chased for money while it is off.
      daycare: { isActive: true },
    },
    include: { daycare: { select: { name: true, units: true } } },
  });

  for (const subscription of subscriptions) {
    try {
      if (subscription.status === "TRIALING") await processTrial(subscription, now, stats);
      else await processPaid(subscription, now, stats);
    } catch (error) {
      // One tenant's failure must not stop everyone else's renewal.
      stats.failures.push({
        daycareId: subscription.daycareId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return stats;
}

const HOUR_MS = 60 * 60 * 1000;

/** The in-process timer for development. Production runs `job:billing` from a scheduler. */
export function startBillingScheduler() {
  const run = async () => {
    try {
      const stats = await runBillingCycle();
      logger.info(stats, "[billing] ejecución");
    } catch (error) {
      logger.error({ err: error }, "[billing] la ejecución falló");
    }
  };

  void run();
  return setInterval(() => {
    void run();
  }, HOUR_MS);
}
