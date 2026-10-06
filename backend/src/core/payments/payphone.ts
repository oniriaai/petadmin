import { createCipheriv, randomInt, randomUUID } from "node:crypto";

import { logger } from "../../middleware/observability";

/**
 * PayPhone, the card gateway the platform charges its own customers through.
 *
 * This is transport only, as `core/messaging` is for WhatsApp and email. What is charged, to
 * whom and when belongs to the module that bills.
 *
 * Two ways of charging:
 *
 *  - The payment button: `prepare` returns a page at PayPhone where the customer types the card,
 *    PayPhone sends the browser back to `responseUrl`, and `confirm` settles it. **A payment
 *    that is not confirmed within five minutes is reversed by PayPhone**, so a customer who
 *    never comes back was not charged and there is nothing to clean up.
 *  - A saved card: `chargeToken`, synchronous, with the token PayPhone returns from a button
 *    payment once it has approved tokenization for the merchant.
 */

const API_BASE = "https://pay.payphonetodoesposible.com/api";
const TIMEOUT_MS = 20_000;
/** PayPhone's `statusCode` for an approved transaction. 2 is canceled. */
const STATUS_APPROVED = 3;

/** How charges are made in this process, or null when they cannot be made at all. */
export type PaymentMode = "live" | "simulated" | null;

export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

function config() {
  const token = process.env.PAYPHONE_TOKEN?.trim();
  if (!token) return null;
  return { token, storeId: process.env.PAYPHONE_STORE_ID?.trim() || undefined };
}

/**
 * Outside production a gateway with no credentials is simulated: nothing leaves the process and
 * every charge is approved, except the ones the simulator is told to decline. That is what lets
 * the dev stack, CI and the public demo run the whole signup without a merchant account. In
 * production an unconfigured gateway is simply unavailable.
 */
export function paymentMode(): PaymentMode {
  if (config()) return "live";
  return process.env.NODE_ENV === "production" ? null : "simulated";
}

/** Money on the wire, in cents. `total` is what the card is charged. */
export interface ChargeAmounts {
  /** The amount IVA applies to, without the IVA. */
  taxableCents: number;
  taxCents: number;
  totalCents: number;
}

export interface Payer {
  email: string;
  phone?: string | null;
  document?: string | null;
}

export interface PrepareInput extends ChargeAmounts {
  clientTransactionId: string;
  reference: string;
  responseUrl: string;
  cancellationUrl: string;
  payer: Payer;
}

export interface PrepareResult {
  /** Where to send the browser. Valid for ten minutes at PayPhone. */
  redirectUrl: string;
}

export interface ChargeResult {
  approved: boolean;
  transactionId: string | null;
  authorizationCode: string | null;
  /** What PayPhone says it charged, when it says. */
  amountCents: number | null;
  message: string | null;
  cardBrand: string | null;
  lastDigits: string | null;
  /** The cardholder's own data, which PayPhone wants back on every charge to the saved card. */
  payerEmail: string | null;
  payerPhone: string | null;
  payerDocument: string | null;
  cardHolderName: string | null;
  /** Present only when PayPhone tokenizes for this merchant. */
  cardToken: string | null;
}

export interface ConfirmInput {
  /** The transaction id PayPhone put in the return URL. */
  id: string;
  clientTransactionId: string;
  /** The `ctoken` PayPhone put in the return URL, if any. */
  cardToken?: string | null;
}

export interface TokenChargeInput extends ChargeAmounts {
  clientTransactionId: string;
  reference: string;
  cardToken: string;
  /** The cardholder's name, in the clear; it is encrypted for PayPhone here. */
  cardHolderName: string;
  payer: Required<{ [K in keyof Payer]: string }>;
  /** Shown on the order PayPhone requires with a token charge. */
  productName: string;
}

// --- simulator ---------------------------------------------------------------

/** A payer document that makes the simulated button decline. */
export const SIMULATED_DECLINE_DOCUMENT = "0000000000";
/** A saved card that the simulator declines. */
export const SIMULATED_DECLINE_TOKEN = "sim-decline";

interface SimulatedPayment {
  id: string;
  input: PrepareInput;
}

/** In memory on purpose: a simulated payment does not need to outlive the process. */
const simulated = new Map<string, SimulatedPayment>();

function simulatePrepare(input: PrepareInput): PrepareResult {
  const id = String(randomInt(1, 2_000_000_000));
  simulated.set(input.clientTransactionId, { id, input });
  const url = new URL(input.responseUrl);
  url.searchParams.set("id", id);
  url.searchParams.set("clientTransactionId", input.clientTransactionId);
  url.searchParams.set("ctoken", `sim-${randomUUID()}`);
  logger.info(
    { clientTransactionId: input.clientTransactionId, totalCents: input.totalCents },
    "[payments] cobro simulado: no hay pasarela configurada",
  );
  return { redirectUrl: url.toString() };
}

function simulateConfirm(input: ConfirmInput): ChargeResult {
  const payment = simulated.get(input.clientTransactionId);
  if (!payment || payment.id !== input.id) {
    throw new PaymentError("PayPhone no reconoce esta transacción");
  }
  simulated.delete(input.clientTransactionId);
  const approved = payment.input.payer.document !== SIMULATED_DECLINE_DOCUMENT;
  return {
    approved,
    transactionId: payment.id,
    authorizationCode: approved ? `SIM${payment.id}` : null,
    amountCents: payment.input.totalCents,
    message: approved ? null : "Transacción rechazada (simulada)",
    cardBrand: "Visa",
    lastDigits: "4242",
    payerEmail: payment.input.payer.email,
    payerPhone: payment.input.payer.phone ?? null,
    payerDocument: payment.input.payer.document ?? null,
    cardHolderName: "Titular de prueba",
    cardToken: approved ? (input.cardToken ?? null) : null,
  };
}

function simulateTokenCharge(input: TokenChargeInput): ChargeResult {
  const approved = input.cardToken !== SIMULATED_DECLINE_TOKEN;
  const id = String(randomInt(1, 2_000_000_000));
  return {
    approved,
    transactionId: id,
    authorizationCode: approved ? `SIM${id}` : null,
    amountCents: input.totalCents,
    message: approved ? null : "Tarjeta rechazada (simulada)",
    cardBrand: null,
    lastDigits: null,
    payerEmail: input.payer.email,
    payerPhone: input.payer.phone,
    payerDocument: input.payer.document,
    cardHolderName: input.cardHolderName,
    cardToken: input.cardToken,
  };
}

// --- live ----------------------------------------------------------------------

type Json = Record<string, unknown>;

async function post(path: string, body: Json): Promise<Json> {
  const settings = config();
  if (!settings) throw new PaymentError("La pasarela de pagos no está configurada");

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PaymentError("No se pudo conectar con PayPhone");
  }

  const data = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok) {
    // PayPhone's own message says which field it refused; it never carries card data.
    const detail = typeof data.message === "string" ? `: ${data.message}` : "";
    throw new PaymentError(`PayPhone rechazó la solicitud (${response.status})${detail}`);
  }
  return data;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function amounts(input: ChargeAmounts): Json {
  return {
    amount: input.totalCents,
    amountWithTax: input.taxableCents,
    amountWithoutTax: 0,
    tax: input.taxCents,
    currency: "USD",
  };
}

/** `+593991234567` for the button, which wants the country code with its plus sign. */
function internationalPhone(phone: string | null | undefined): string | undefined {
  const digits = phone?.replace(/\D/g, "");
  if (!digits) return undefined;
  return `+${digits}`;
}

/**
 * The cardholder's name as PayPhone wants it on a token charge: AES-256-CBC under the
 * merchant's key from PayPhone Developers, with no initialization vector, in base64.
 */
export function encryptCardHolder(name: string, key: string): string {
  const cipher = createCipheriv("aes-256-cbc", Buffer.from(key, "utf8"), Buffer.alloc(16, 0));
  return Buffer.concat([cipher.update(name, "utf8"), cipher.final()]).toString("base64");
}

function toChargeResult(data: Json, fallbackToken: string | null): ChargeResult {
  return {
    approved: data.statusCode === STATUS_APPROVED,
    transactionId: text(data.transactionId),
    authorizationCode: text(data.authorizationCode),
    amountCents: typeof data.amount === "number" ? data.amount : null,
    message: text(data.message),
    cardBrand: text(data.cardBrand),
    lastDigits: text(data.lastDigits),
    payerEmail: text(data.email),
    payerPhone: text(data.phoneNumber),
    payerDocument: text(data.document),
    cardHolderName: text(data.optionalParameter4),
    cardToken: text(data.cardToken) ?? fallbackToken,
  };
}

// --- public surface ------------------------------------------------------------

export async function prepare(input: PrepareInput): Promise<PrepareResult> {
  const mode = paymentMode();
  if (!mode) throw new PaymentError("La pasarela de pagos no está configurada");
  if (mode === "simulated") return simulatePrepare(input);

  const data = await post("/button/Prepare", {
    ...amounts(input),
    clientTransactionId: input.clientTransactionId,
    storeId: config()?.storeId,
    reference: input.reference,
    responseUrl: input.responseUrl,
    cancellationUrl: input.cancellationUrl,
    email: input.payer.email,
    phoneNumber: internationalPhone(input.payer.phone),
    documentId: input.payer.document ?? undefined,
    lang: "es",
  });
  const redirectUrl = text(data.payWithCard);
  if (!redirectUrl) throw new PaymentError("PayPhone no devolvió la página de pago");
  return { redirectUrl };
}

export async function confirm(input: ConfirmInput): Promise<ChargeResult> {
  const mode = paymentMode();
  if (!mode) throw new PaymentError("La pasarela de pagos no está configurada");
  if (mode === "simulated") return simulateConfirm(input);

  const id = Number(input.id);
  if (!Number.isSafeInteger(id)) throw new PaymentError("PayPhone no reconoce esta transacción");
  const data = await post("/button/V2/Confirm", { id, clientTxId: input.clientTransactionId });
  return toChargeResult(data, input.cardToken ?? null);
}

export async function chargeToken(input: TokenChargeInput): Promise<ChargeResult> {
  const mode = paymentMode();
  if (!mode) throw new PaymentError("La pasarela de pagos no está configurada");
  if (mode === "simulated") return simulateTokenCharge(input);

  const key = process.env.PAYPHONE_CARD_KEY?.trim();
  if (!key) throw new PaymentError("Falta PAYPHONE_CARD_KEY para cobrar a una tarjeta guardada");

  const [firstName, ...rest] = input.cardHolderName.trim().split(/\s+/);
  const data = await post("/transaction/web", {
    ...amounts(input),
    cardToken: input.cardToken,
    cardHolder: encryptCardHolder(input.cardHolderName, key),
    documentId: input.payer.document,
    phoneNumber: input.payer.phone.replace(/\D/g, ""),
    email: input.payer.email,
    clientTransactionId: input.clientTransactionId,
    storeId: config()?.storeId,
    optionalParameter: input.reference,
    order: {
      billTo: {
        country: "EC",
        firstName: firstName ?? input.cardHolderName,
        lastName: rest.join(" ") || firstName || input.cardHolderName,
        phoneNumber: internationalPhone(input.payer.phone),
        email: input.payer.email,
      },
      lineItems: [
        {
          productName: input.productName,
          unitPrice: input.taxableCents,
          quantity: 1,
          totalAmount: input.totalCents,
          taxAmount: input.taxCents,
          productSKU: input.reference,
          productDescription: input.productName,
        },
      ],
    },
  });
  return toChargeResult(data, input.cardToken);
}

/**
 * Gives an approved charge back. PayPhone only reverses on the day of the charge, which is
 * enough for the one use this has: a payment that was approved and then could not be honoured.
 */
export async function reverse(transactionId: string): Promise<void> {
  const mode = paymentMode();
  if (!mode) throw new PaymentError("La pasarela de pagos no está configurada");
  if (mode === "simulated") return;
  await post("/Reverse", { id: Number(transactionId) });
}
