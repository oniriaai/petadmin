import { createHash, randomBytes } from "node:crypto";

import type { SignupIntent, SubscriptionPayment } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "../../db";
import {
  PaymentError,
  confirm,
  paymentMode,
  prepare,
  type ChargeResult,
} from "../../core/payments/payphone";
import { toE164 } from "../../core/messaging";
import { AuthzError, BUSINESS_UNITS, issueSessionToken } from "../../middleware/auth";
import { logger } from "../../middleware/observability";
import { businessUnitForRole, createDaycare, recordAudit } from "../platform-admin";
import {
  founderSlotsLeft,
  newClientTransactionId,
  paymentDataForCharge,
  reverseQuietly,
  subscriptionDataForCharge,
  truncate,
} from "./billing.service";
import { canSendEmail, sendVerificationEmail, sendWelcomeEmail, siteUrl } from "./emails";
import {
  FOUNDER_DISCOUNT_PERCENT,
  FOUNDER_MONTHS,
  PLANS,
  PlanError,
  TRIAL_DAYS,
  TRIAL_PLAN_ID,
  billingVatPercent,
  getPlan,
  periodEnd,
  planModules,
  planPriceCents,
  quoteFor,
  resolvePlanUnits,
  type BillingPeriod,
} from "./plans";

/**
 * Signing up from the public page: a visitor fills one form and ends with a daycare of their
 * own, either by paying for a plan or by starting the free trial.
 *
 * Nothing is created until the visitor has proved something: that the card was charged, or
 * that the email address is theirs. Until then there is only a `SignupIntent`, and an intent
 * that is never completed costs a row.
 */

const BCRYPT_ROUNDS = 10;
const DAY_MS = 86_400_000;
/** PayPhone's page is valid for ten minutes and a payment must be confirmed within five. */
const PAID_INTENT_TTL_MS = 30 * 60_000;
const TRIAL_INTENT_TTL_MS = 2 * DAY_MS;

export interface SignupInput {
  kind: "PAID" | "TRIAL";
  planId?: string;
  units?: string[];
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
  saveCard?: boolean;
}

/** What the public page needs to draw the prices and to know what it may offer. */
export async function getCatalog() {
  const slotsLeft = await founderSlotsLeft();
  return {
    plans: PLANS.map((plan) => ({
      id: plan.id,
      label: plan.label,
      summary: plan.summary,
      monthlyCents: plan.monthlyCents,
      annualCents: plan.annualCents,
      unitCount: plan.unitCount,
      allowedUnits: plan.allowedUnits,
      veterinarySurcharge: plan.veterinarySurcharge ?? null,
      modules: planModules(plan, []).filter((id) => id !== "reservas"),
      featured: plan.featured === true,
    })),
    units: BUSINESS_UNITS,
    vatPercent: billingVatPercent(),
    founder: {
      available: slotsLeft > 0,
      slotsLeft,
      discountPercent: FOUNDER_DISCOUNT_PERCENT,
      months: FOUNDER_MONTHS,
    },
    trial: { days: TRIAL_DAYS, planId: TRIAL_PLAN_ID, available: canSendEmail() },
    /** False where no gateway is configured in production: the page then only offers contact. */
    checkoutAvailable: paymentMode() !== null,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function resolveSelection(input: SignupInput) {
  if (input.kind === "TRIAL") {
    const plan = getPlan(TRIAL_PLAN_ID)!;
    return { plan, units: [...BUSINESS_UNITS] };
  }
  const plan = input.planId ? getPlan(input.planId) : undefined;
  if (!plan) throw new AuthzError(400, "Elige un plan");
  try {
    return { plan, units: resolvePlanUnits(plan, input.units ?? []) };
  } catch (error) {
    if (error instanceof PlanError) throw new AuthzError(400, error.message);
    throw error;
  }
}

/**
 * The identifier is the one thing two signups can fight over. It is held by an existing daycare,
 * or by somebody else's signup that is at the gateway or waiting on its email right now.
 */
async function assertSlugFree(slug: string, email: string, now: Date): Promise<void> {
  const [daycare, pending] = await Promise.all([
    prisma.daycare.findUnique({ where: { slug }, select: { id: true } }),
    prisma.signupIntent.findFirst({
      where: { slug, status: "PENDING", expiresAt: { gt: now }, email: { not: email } },
      select: { id: true },
    }),
  ]);
  if (daycare || pending) {
    throw new AuthzError(409, `El identificador "${slug}" ya está en uso. Elige otro.`);
  }
}

export type SignupStarted =
  { next: "payment"; redirectUrl: string } | { next: "verify-email"; email: string };

export async function startSignup(input: SignupInput): Promise<SignupStarted> {
  const now = new Date();
  const email = input.email.trim().toLowerCase();
  const slug = input.slug.trim().toLowerCase();
  const { plan, units } = resolveSelection(input);

  if (!toE164(input.phone)) throw new AuthzError(400, "El teléfono no es válido");
  if (input.kind === "PAID" && !paymentMode()) {
    throw new AuthzError(503, "El pago en línea no está disponible por ahora. Escríbenos.");
  }
  if (input.kind === "TRIAL") {
    if (!canSendEmail()) {
      throw new AuthzError(503, "La prueba gratuita no está disponible por ahora. Escríbenos.");
    }
    // One trial per business. Checked on both, since either is trivial to vary alone.
    const used = await prisma.signupIntent.findFirst({
      where: {
        kind: "TRIAL",
        status: "PROVISIONED",
        OR: [{ email }, { taxId: input.taxId }],
      },
      select: { id: true },
    });
    if (used) {
      throw new AuthzError(
        409,
        "Este negocio ya usó su prueba gratuita. Inicia sesión o elige un plan.",
      );
    }
  }

  await assertSlugFree(slug, email, now);
  // The same person trying again (a payment abandoned, a form corrected) replaces their own
  // earlier attempt instead of being blocked by it.
  await prisma.signupIntent.updateMany({
    where: { email, status: "PENDING" },
    data: { status: "EXPIRED" },
  });

  const founder = input.kind === "PAID" && (await founderSlotsLeft(now)) > 0;
  const verificationToken = input.kind === "TRIAL" ? randomBytes(32).toString("hex") : null;
  const intent = await prisma.signupIntent.create({
    data: {
      kind: input.kind,
      email,
      businessName: input.businessName.trim(),
      slug,
      legalName: input.legalName?.trim() || null,
      taxId: input.taxId,
      phone: input.phone.trim(),
      adminName: input.adminName.trim(),
      adminUsername: input.adminUsername.trim(),
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      planId: plan.id,
      units: units.join(","),
      period: input.period,
      founder,
      saveCard: input.saveCard === true,
      verificationTokenHash: verificationToken ? hashToken(verificationToken) : null,
      expiresAt: new Date(
        now.getTime() + (input.kind === "TRIAL" ? TRIAL_INTENT_TTL_MS : PAID_INTENT_TTL_MS),
      ),
    },
  });

  if (verificationToken) {
    await sendVerificationEmail({ to: email, business: intent.businessName }, verificationToken);
    return { next: "verify-email", email };
  }

  const quote = quoteFor(planPriceCents(plan, units, input.period), founder, billingVatPercent());
  const payment = await prisma.subscriptionPayment.create({
    data: {
      signupIntentId: intent.id,
      clientTransactionId: newClientTransactionId(),
      kind: "SIGNUP",
      planId: plan.id,
      units: intent.units,
      period: input.period,
      ...quote,
      saveCard: intent.saveCard,
    },
  });

  try {
    const { redirectUrl } = await prepare({
      clientTransactionId: payment.clientTransactionId,
      reference: `Argos Suite ${plan.label}`,
      taxableCents: quote.subtotalCents - quote.discountCents,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      responseUrl: `${siteUrl()}/registro/resultado`,
      cancellationUrl: `${siteUrl()}/registro?cancelado=1`,
      payer: { email, phone: toE164(input.phone), document: input.taxId },
    });
    return { next: "payment", redirectUrl };
  } catch (error) {
    await prisma.signupIntent.update({
      where: { id: intent.id },
      data: { status: "FAILED", error: truncate(error instanceof Error ? error.message : null) },
    });
    if (error instanceof PaymentError) throw new AuthzError(502, error.message);
    throw error;
  }
}

export interface SignupSession {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
    businessUnit: string;
    role: "admin";
    daycareId: string;
  };
  daycare: { slug: string; name: string };
}

/** Thrown inside the provisioning transaction when another request already completed it. */
class AlreadyProvisioned extends Error {}

/**
 * Turns an intent into a daycare, its admin and its subscription, in one transaction: the
 * tenant exists if and only if its subscription does, and an intent provisions at most once.
 */
async function provision(
  intent: SignupIntent,
  paid: { payment: SubscriptionPayment; charge: ChargeResult } | null,
): Promise<SignupSession> {
  const plan = getPlan(intent.planId);
  if (!plan) throw new Error(`Plan desconocido: ${intent.planId}`);
  const units = resolvePlanUnits(plan, intent.units.split(","));
  const period = intent.period as BillingPeriod;
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);

  const { daycare, admin } = await prisma.$transaction(async (tx) => {
    // The claim. Of two requests completing the same signup (a double click on the emailed
    // link, a reloaded return page), one finds it still pending.
    const claimed = await tx.signupIntent.updateMany({
      where: { id: intent.id, status: "PENDING" },
      data: { status: "PROVISIONED", completedAt: now },
    });
    if (claimed.count === 0) throw new AlreadyProvisioned();

    const created = await createDaycare(
      {
        slug: intent.slug,
        name: intent.businessName,
        legalName: intent.legalName ?? undefined,
        units,
        modules: planModules(plan, units),
        admin: {
          username: intent.adminUsername,
          name: intent.adminName,
          passwordHash: intent.passwordHash,
        },
      },
      tx,
    );

    const subscription = await tx.subscription.create({
      data: {
        daycareId: created.daycare.id,
        planId: plan.id,
        period,
        status: paid ? "ACTIVE" : "TRIALING",
        trialEndsAt: paid ? null : trialEndsAt,
        priceCents: planPriceCents(plan, units, period),
        billingEmail: intent.email,
        taxId: intent.taxId,
        phone: intent.phone,
      },
    });

    if (paid) {
      await tx.subscriptionPayment.update({
        where: { id: paid.payment.id },
        data: {
          ...paymentDataForCharge(paid.charge, now, period),
          daycareId: created.daycare.id,
          subscriptionId: subscription.id,
        },
      });
      await tx.subscription.update({
        where: { id: subscription.id },
        data: await subscriptionDataForCharge(tx, null, paid.payment, paid.charge, now),
      });
    }

    await tx.signupIntent.update({
      where: { id: intent.id },
      data: { daycareId: created.daycare.id },
    });
    return created;
  });

  await recordAudit(null, {
    action: "daycare.signup",
    daycareId: daycare.id,
    targetType: "daycare",
    targetId: daycare.id,
    detail: {
      slug: daycare.slug,
      plan: plan.id,
      units: daycare.units,
      period,
      kind: intent.kind,
      totalCents: paid?.payment.totalCents ?? 0,
    },
  });

  void sendWelcomeEmail(
    {
      to: intent.email,
      business: daycare.name,
      slug: daycare.slug,
      username: admin.username,
      plan: plan.label,
    },
    paid
      ? { paidUntil: periodEnd(now, period), totalCents: paid.payment.totalCents }
      : { trialEndsAt },
  );

  const businessUnit = businessUnitForRole("admin");
  return {
    token: issueSessionToken({
      id: admin.id,
      username: admin.username,
      businessUnit,
      role: "admin",
      daycareId: daycare.id,
      // A user created a moment ago: nothing has reset its password yet.
      sessionEpoch: 0,
    }),
    user: {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      businessUnit,
      role: "admin",
      daycareId: daycare.id,
    },
    daycare: { slug: daycare.slug, name: daycare.name },
  };
}

/**
 * The answer to a signup that was already completed. It carries no session: whoever holds the
 * link or the return URL a second time (a browser history, a forwarded email) signs in with
 * the password like everyone else.
 */
export type SignupCompleted =
  ({ status: "provisioned" } & SignupSession) | { status: "already"; daycare: { slug: string } };

function already(intent: Pick<SignupIntent, "slug">): SignupCompleted {
  return { status: "already", daycare: { slug: intent.slug } };
}

export interface ConfirmSignupInput {
  id: string;
  clientTransactionId: string;
  ctoken?: string | null;
}

export async function confirmSignupPayment(input: ConfirmSignupInput): Promise<SignupCompleted> {
  const payment = await prisma.subscriptionPayment.findUnique({
    where: { clientTransactionId: input.clientTransactionId },
    include: { signupIntent: true },
  });
  const intent = payment?.signupIntent;
  if (!payment || !intent || payment.kind !== "SIGNUP") {
    throw new AuthzError(404, "No encontramos este pago");
  }
  if (intent.status === "PROVISIONED") return already(intent);
  if (payment.status !== "PENDING" || intent.status !== "PENDING") {
    throw new AuthzError(409, "Este pago no se completó. Vuelve a empezar el registro.");
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
    await prisma.$transaction([
      prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: { status: "DECLINED", error: truncate(charge.message) ?? "Pago no aprobado" },
      }),
      prisma.signupIntent.update({ where: { id: intent.id }, data: { status: "FAILED" } }),
    ]);
    throw new AuthzError(
      402,
      "El pago no fue aprobado y no se hizo ningún cobro. Puedes intentarlo con otra tarjeta.",
    );
  }

  const refuse = async (message: string, error: unknown): Promise<never> => {
    await reverseQuietly(charge);
    const detail = truncate(error instanceof Error ? error.message : String(error));
    await prisma.$transaction([
      prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          status: "REVERSED",
          payphoneTransactionId: charge.transactionId,
          error: detail,
        },
      }),
      prisma.signupIntent.updateMany({
        where: { id: intent.id, status: "PENDING" },
        data: { status: "FAILED", error: detail },
      }),
    ]);
    throw new AuthzError(409, message);
  };

  // The amount is the server's, quoted when the signup started. PayPhone charging anything
  // else means the transaction is not the one that was prepared.
  // An approval that does not say how much was charged is not proof of this payment either:
  // the check failed open on a missing amount, and it is the one thing tying the charge to
  // the plan that was quoted.
  if (charge.amountCents !== payment.totalCents) {
    return refuse(
      "El importe cobrado no coincide con el del plan. Reversamos el cobro; vuelve a intentarlo.",
      "importe distinto del presupuestado",
    );
  }

  try {
    return { status: "provisioned", ...(await provision(intent, { payment, charge })) };
  } catch (error) {
    if (error instanceof AlreadyProvisioned) return already(intent);
    logger.error({ err: error, slug: intent.slug }, "[signup] pago aprobado sin poder dar el alta");
    return refuse(
      error instanceof AuthzError
        ? `${error.message} Reversamos el cobro; vuelve a intentarlo.`
        : "No pudimos crear tu espacio y reversamos el cobro. Vuelve a intentarlo o escríbenos.",
      error,
    );
  }
}

export async function verifyTrialSignup(token: string): Promise<SignupCompleted> {
  const intent = await prisma.signupIntent.findUnique({
    where: { verificationTokenHash: hashToken(token) },
  });
  if (!intent || intent.kind !== "TRIAL") {
    throw new AuthzError(404, "Este enlace no es válido");
  }
  if (intent.status === "PROVISIONED") return already(intent);
  if (intent.status !== "PENDING" || intent.expiresAt <= new Date()) {
    throw new AuthzError(410, "Este enlace caducó. Vuelve a pedir la prueba gratuita.");
  }

  try {
    return { status: "provisioned", ...(await provision(intent, null)) };
  } catch (error) {
    if (error instanceof AlreadyProvisioned) return already(intent);
    throw error;
  }
}
