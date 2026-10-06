/**
 * End-to-end coverage of self-service onboarding against a running stack: signing up from the
 * public page with a payment or with a trial, and what happens to the subscription afterwards.
 *
 * It needs the gateway **simulated** on the backend (no `PAYPHONE_TOKEN`, outside production),
 * and refuses to go on if the backend answers with a real PayPhone page. The scheduled pass
 * runs in this process, straight against the database, so its own channels are forced to the
 * simulator before anything is imported.
 *
 * The suite creates its own throwaway daycares under one slug prefix and removes them at the
 * end; leftovers from a run that died half-way are removed by the next one.
 */
process.env.PAYPHONE_TOKEN = "";
process.env.SMTP_URL = "";

import { createHash } from "node:crypto";
import axios, { type AxiosInstance } from "axios";

const BASE_URL = process.env.API_URL ?? "http://localhost:3001/api/v1";
const SLUG_PREFIX = "e2e-signup";
const PASSWORD = "secreto-e2e-123";
const DAY_MS = 86_400_000;

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed += 1;
  } catch (error) {
    const detail =
      axios.isAxiosError(error) && error.response
        ? `${error.response.status} ${JSON.stringify(error.response.data)}`
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(`✗ ${name}: ${detail}`);
    failed += 1;
  }
}

function expect(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: esperaba ${JSON.stringify(expected)}, recibió ${JSON.stringify(actual)}`,
    );
  }
}

function ok(condition: unknown, label: string): void {
  if (!condition) throw new Error(label);
}

/** Never throws on a non-2xx, so a status can be asserted instead of caught. */
const anonymous = axios.create({ baseURL: BASE_URL, validateStatus: () => true });

function clientFor(token: string): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true,
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function login(username: string, password: string, daycare?: string): Promise<string> {
  const res = await axios.post(`${BASE_URL}/auth/login`, { username, password, daycare });
  return res.data.token;
}

interface ReturnParams {
  id: string;
  clientTransactionId: string;
  ctoken: string | null;
}

/** What PayPhone would put in the return URL, read off the simulated redirect. */
function returnParams(redirectUrl: string, path: string): ReturnParams {
  const url = new URL(redirectUrl);
  if (!url.pathname.endsWith(path)) {
    throw new Error(
      `El backend devolvió ${url.origin}${url.pathname}: esta suite solo corre con la pasarela simulada`,
    );
  }
  return {
    id: url.searchParams.get("id") ?? "",
    clientTransactionId: url.searchParams.get("clientTransactionId") ?? "",
    ctoken: url.searchParams.get("ctoken"),
  };
}

function signupBody(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: "PAID",
    planId: "integral",
    units: ["DAYCARE", "GROOMING"],
    period: "MONTHLY",
    businessName: `Negocio ${slug}`,
    slug,
    // Distinct per signup: one trial per tax id.
    taxId: `17${String(Date.now()).slice(-8)}`,
    phone: "099 123 4567",
    email: `${slug}@example.com`,
    adminName: "Ana Prueba",
    adminUsername: `${slug}_admin`,
    password: PASSWORD,
    saveCard: true,
    acceptTerms: true,
    ...overrides,
  };
}

async function main(): Promise<void> {
  console.log("\n🧾 Alta en línea y suscripciones\n" + "=".repeat(60));

  const { prisma } = await import("../src/db");
  const { runBillingCycle, isWhatsAppIncluded } = await import("../src/modules/suscripciones");
  const { encryptSecret } = await import("../src/modules/suscripciones/secrets");
  const { SIMULATED_DECLINE_DOCUMENT, SIMULATED_DECLINE_TOKEN } =
    await import("../src/core/payments/payphone");

  async function cleanup(): Promise<void> {
    const daycares = await prisma.daycare.findMany({
      where: { slug: { startsWith: SLUG_PREFIX } },
      select: { id: true },
    });
    const ids = daycares.map((daycare) => daycare.id);
    await prisma.subscriptionPayment.deleteMany({
      where: {
        OR: [{ daycareId: { in: ids } }, { signupIntent: { slug: { startsWith: SLUG_PREFIX } } }],
      },
    });
    await prisma.subscription.deleteMany({ where: { daycareId: { in: ids } } });
    await prisma.signupIntent.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
    await prisma.platformAuditLog.deleteMany({ where: { daycareId: { in: ids } } });
    await prisma.user.deleteMany({ where: { daycareId: { in: ids } } });
    await prisma.businessUnitSetting.deleteMany({ where: { daycareId: { in: ids } } });
    await prisma.daycareModule.deleteMany({ where: { daycareId: { in: ids } } });
    await prisma.daycare.deleteMany({ where: { id: { in: ids } } });
  }
  await cleanup();

  const superadmin = clientFor(
    await login(
      process.env.SUPERADMIN_USERNAME ?? "superadmin",
      process.env.SUPERADMIN_PASSWORD ?? "superadmin123",
    ),
  );
  /**
   * The backend caches a principal's status for a few seconds and this process cannot reach
   * into it. Writing the same status through the console is what drops the entry, exactly as it
   * does for the vendor.
   */
  async function syncStatus(daycareId: string): Promise<void> {
    const row = await prisma.subscription.findUniqueOrThrow({ where: { daycareId } });
    const res = await superadmin.patch(`/billing/tenants/${daycareId}`, { status: row.status });
    expect(res.status, 200, "override de consola");
    // The override starts the state clean; put back what the job had written.
    await prisma.subscription.update({
      where: { daycareId },
      data: {
        failedAttempts: row.failedAttempts,
        nextAttemptAt: row.nextAttemptAt,
        pastDueSince: row.pastDueSince,
        lastNotice: row.lastNotice,
      },
    });
  }

  const stamp = Date.now();
  const paidSlug = `${SLUG_PREFIX}-pago-${stamp}`;
  const trialSlug = `${SLUG_PREFIX}-prueba-${stamp}`;
  const declinedSlug = `${SLUG_PREFIX}-rechazo-${stamp}`;

  let founderOffered = false;
  let paid: { client: AxiosInstance; daycareId: string; params: ReturnParams } | null = null;
  let trial: { client: AxiosInstance; daycareId: string } | null = null;

  // --- catalog -------------------------------------------------------------------

  await test("el catálogo público lista los cinco planes sin sesión", async () => {
    const res = await anonymous.get("/signup/plans");
    expect(res.status, 200, "GET /signup/plans");
    expect(res.data.plans.length, 5, "planes");
    const integral = res.data.plans.find((plan: { id: string }) => plan.id === "integral");
    expect(integral.monthlyCents, 8900, "Integral mensual");
    expect(res.data.vatPercent, 15, "IVA");
    expect(res.data.checkoutAvailable, true, "pasarela disponible");
    founderOffered = res.data.founder.available;
  });

  await test("un plan con unidades que no incluye se rechaza antes de crear nada", async () => {
    const res = await anonymous.post(
      "/signup/intents",
      signupBody(paidSlug, { planId: "inicial", units: ["VETERINARY"] }),
    );
    expect(res.status, 400, "unidad fuera del plan");
    const without = await anonymous.post(
      "/signup/intents",
      signupBody(paidSlug, { acceptTerms: false }),
    );
    expect(without.status, 400, "sin aceptar condiciones");
    expect(await prisma.signupIntent.count({ where: { slug: paidSlug } }), 0, "intentos creados");
  });

  // --- paid signup -----------------------------------------------------------------

  await test("el alta de pago no crea la guardería hasta confirmar el cobro", async () => {
    const res = await anonymous.post("/signup/intents", signupBody(paidSlug));
    expect(res.status, 201, "POST /signup/intents");
    expect(res.data.next, "payment", "siguiente paso");
    const params = returnParams(res.data.redirectUrl, "/registro/resultado");
    expect(
      await prisma.daycare.count({ where: { slug: paidSlug } }),
      0,
      "guardería antes de pagar",
    );

    // The price is the server's: 8900 + 15% IVA, or the founder price while slots last.
    const payment = await prisma.subscriptionPayment.findUniqueOrThrow({
      where: { clientTransactionId: params.clientTransactionId },
    });
    expect(payment.totalCents, founderOffered ? 7165 : 10235, "importe presupuestado");

    paid = { client: anonymous, daycareId: "", params };
  });

  await test("otro registro no puede tomar un identificador que está pagándose", async () => {
    const res = await anonymous.post(
      "/signup/intents",
      signupBody(paidSlug, { email: "otra-persona@example.com" }),
    );
    expect(res.status, 409, "identificador en uso");
  });

  await test("una confirmación con un id que PayPhone no reconoce no da de alta", async () => {
    const res = await anonymous.post("/signup/confirm", { ...paid!.params, id: "1" });
    expect(res.status, 502, "id ajeno");
    expect(await prisma.daycare.count({ where: { slug: paidSlug } }), 0, "guardería creada");
  });

  await test("confirmado el cobro, la guardería existe con el plan y una sesión abierta", async () => {
    const res = await anonymous.post("/signup/confirm", paid!.params);
    expect(res.status, 200, "POST /signup/confirm");
    expect(res.data.status, "provisioned", "estado");
    expect(res.data.user.role, "admin", "rol");
    ok(res.data.token, "debe devolver una sesión");

    const client = clientFor(res.data.token);
    const me = await client.get("/auth/me");
    expect(me.status, 200, "GET /auth/me");
    expect(me.data.daycare.slug, paidSlug, "guardería");
    expect(me.data.units.join(","), "DAYCARE,GROOMING", "unidades");
    for (const moduleId of ["reservas", "guarderia", "peluqueria", "finanzas", "recordatorios"]) {
      ok(me.data.enabledModules.includes(moduleId), `Integral debe incluir ${moduleId}`);
    }
    ok(!me.data.enabledModules.includes("veterinaria"), "no compró Veterinaria");
    expect(me.data.subscription.status, "ACTIVE", "suscripción");
    expect(me.data.subscription.hasCard, true, "tarjeta guardada con consentimiento");
    expect((await client.get("/clients")).status, 200, "un módulo del núcleo");
    expect((await client.get("/veterinaria/visits")).status, 403, "un módulo no comprado");

    paid = { ...paid!, client, daycareId: me.data.daycare.id };
  });

  await test("la tarjeta se guarda cifrada y el precio fundador queda registrado", async () => {
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { daycareId: paid!.daycareId },
    });
    ok(row.cardToken && !row.cardToken.includes(paid!.params.ctoken!), "token en claro");
    expect(row.founderNumber !== null, founderOffered, "plaza de fundador");
    expect(row.priceCents, 8900, "precio de lista guardado");
  });

  await test("repetir la confirmación no entrega otra sesión", async () => {
    const res = await anonymous.post("/signup/confirm", paid!.params);
    expect(res.status, 200, "repetición");
    expect(res.data.status, "already", "estado");
    expect(res.data.token, undefined, "sesión en la repetición");
    expect(await prisma.daycare.count({ where: { slug: paidSlug } }), 1, "guarderías");
  });

  await test("la persona administradora entra después con su contraseña", async () => {
    const token = await login(`${paidSlug}_admin`, PASSWORD, paidSlug);
    expect((await clientFor(token).get("/billing")).status, 200, "GET /billing");
  });

  await test("con el plan al día no se puede iniciar otro pago", async () => {
    const state = await paid!.client.get("/billing");
    expect(state.data.nextPayment, null, "pago pendiente");
    expect(state.data.payments.length, 1, "pagos en el historial");
    expect((await paid!.client.post("/billing/checkout", {})).status, 409, "checkout");
  });

  await test("un pago rechazado no crea nada ni deja entrar", async () => {
    const res = await anonymous.post(
      "/signup/intents",
      signupBody(declinedSlug, { taxId: SIMULATED_DECLINE_DOCUMENT }),
    );
    expect(res.status, 201, "intento");
    const confirm = await anonymous.post(
      "/signup/confirm",
      returnParams(res.data.redirectUrl, "/registro/resultado"),
    );
    expect(confirm.status, 402, "pago rechazado");
    expect(await prisma.daycare.count({ where: { slug: declinedSlug } }), 0, "guardería creada");
    const attempt = await anonymous.post("/auth/login", {
      username: `${declinedSlug}_admin`,
      password: PASSWORD,
    });
    expect(attempt.status, 401, "login sin alta");
  });

  // --- isolation -------------------------------------------------------------------

  await test("una guardería gestionada por el proveedor no tiene suscripción en línea", async () => {
    const seeded = clientFor(await login("admin_global", "admin123"));
    expect((await seeded.get("/billing")).status, 404, "GET /billing");
    expect((await seeded.get("/auth/me")).data.subscription, null, "resumen en /auth/me");
    // Another tenant's transaction id reads as absent, not as forbidden.
    const res = await seeded.post("/billing/confirm", paid!.params);
    expect(res.status, 404, "confirmar el pago de otra guardería");
  });

  await test("la facturación es de quien administra la cuenta y de nadie más", async () => {
    const staff = clientFor(await login("peluqueria_admin", "peluqueria123"));
    expect((await staff.get("/billing")).status, 403, "rol operativo");
    expect((await paid!.client.get(`/billing/tenants/${paid!.daycareId}`)).status, 403, "override");
    expect((await anonymous.get("/billing")).status, 401, "sin sesión");
  });

  // --- trial -----------------------------------------------------------------------

  const trialToken = `e2e-token-${stamp}-${"x".repeat(20)}`;
  const trialTaxId = `09${String(stamp).slice(-8)}`;

  await test("la prueba gratuita espera a que se confirme el correo", async () => {
    const res = await anonymous.post(
      "/signup/intents",
      signupBody(trialSlug, {
        kind: "TRIAL",
        planId: undefined,
        units: undefined,
        taxId: trialTaxId,
      }),
    );
    expect(res.status, 201, "intento de prueba");
    expect(res.data.next, "verify-email", "siguiente paso");
    expect(res.data.redirectUrl, undefined, "una prueba no pasa por la pasarela");
    expect(
      await prisma.daycare.count({ where: { slug: trialSlug } }),
      0,
      "guardería sin verificar",
    );

    expect(
      (await anonymous.post("/signup/verify", { token: "z".repeat(40) })).status,
      404,
      "token",
    );

    // The token only ever leaves by email, stored hashed. The suite plants one it knows.
    await prisma.signupIntent.updateMany({
      where: { slug: trialSlug },
      data: { verificationTokenHash: createHash("sha256").update(trialToken).digest("hex") },
    });
  });

  await test("verificado el correo, la prueba abre todo durante 30 días", async () => {
    const res = await anonymous.post("/signup/verify", { token: trialToken });
    expect(res.status, 200, "POST /signup/verify");
    expect(res.data.status, "provisioned", "estado");
    const client = clientFor(res.data.token);
    const me = await client.get("/auth/me");
    expect(me.data.subscription.status, "TRIALING", "suscripción");
    expect(me.data.units.length, 3, "unidades en prueba");
    ok(me.data.enabledModules.includes("veterinaria"), "la prueba incluye Veterinaria");
    const daysLeft = (new Date(me.data.subscription.trialEndsAt).getTime() - Date.now()) / DAY_MS;
    ok(daysLeft > 29 && daysLeft <= 30, `la prueba dura 30 días, no ${daysLeft}`);
    trial = { client, daycareId: me.data.daycare.id };

    const again = await anonymous.post("/signup/verify", { token: trialToken });
    expect(again.data.status, "already", "segundo uso del enlace");
    expect(again.data.token, undefined, "sesión en el segundo uso");
  });

  await test("en prueba los recordatorios no salen por WhatsApp", async () => {
    expect(await isWhatsAppIncluded(trial!.daycareId), false, "en prueba");
    expect(await isWhatsAppIncluded(paid!.daycareId), true, "con plan pagado");
  });

  await test("un negocio no repite la prueba con otro correo", async () => {
    const res = await anonymous.post(
      "/signup/intents",
      signupBody(`${trialSlug}-bis`, {
        kind: "TRIAL",
        taxId: trialTaxId,
        adminUsername: "otra_admin",
      }),
    );
    expect(res.status, 409, "segunda prueba con el mismo RUC");
  });

  await test("terminada la prueba todo se cierra con 402, salvo donde se paga", async () => {
    await prisma.subscription.update({
      where: { daycareId: trial!.daycareId },
      data: { trialEndsAt: new Date(Date.now() - 60_000) },
    });
    const stats = await runBillingCycle();
    ok(stats.suspended >= 1, "el job debió suspender la prueba vencida");
    expect(stats.failures.length, 0, "fallos del job");
    await syncStatus(trial!.daycareId);

    const refused = await trial!.client.get("/clients");
    expect(refused.status, 402, "GET /clients");
    expect(refused.data.code, "SUBSCRIPTION_INACTIVE", "código");
    // The session itself is still good: this is not DAYCARE_INACTIVE.
    expect((await trial!.client.get("/auth/me")).data.subscription.status, "SUSPENDED", "/auth/me");
    const state = await trial!.client.get("/billing");
    expect(state.status, 200, "GET /billing");
    expect(state.data.nextPayment.kind, "CONVERSION", "pago pendiente");
  });

  await test("pagar un plan convierte la prueba y deja solo lo que el plan incluye", async () => {
    expect((await trial!.client.post("/billing/checkout", {})).status, 400, "sin elegir plan");
    const checkout = await trial!.client.post("/billing/checkout", {
      planId: "inicial",
      units: ["GROOMING"],
      period: "ANNUAL",
      saveCard: false,
    });
    expect(checkout.status, 201, "POST /billing/checkout");
    const params = returnParams(checkout.data.redirectUrl, "/suscripcion");

    // The other tenant's admin holding this transaction id gets nowhere with it.
    expect((await paid!.client.post("/billing/confirm", params)).status, 404, "pago ajeno");

    const confirm = await trial!.client.post("/billing/confirm", params);
    expect(confirm.status, 200, "POST /billing/confirm");
    expect(confirm.data.subscription.status, "ACTIVE", "suscripción");
    expect(confirm.data.subscription.planId, "inicial", "plan");
    expect(confirm.data.subscription.hasCard, false, "sin consentimiento no se guarda la tarjeta");

    const me = await trial!.client.get("/auth/me");
    expect(me.data.units.join(","), "GROOMING", "unidades tras convertir");
    ok(me.data.enabledModules.includes("peluqueria"), "Inicial incluye Peluquería");
    ok(!me.data.enabledModules.includes("veterinaria"), "Inicial no incluye Veterinaria");
    ok(!me.data.enabledModules.includes("finanzas"), "Inicial no incluye Finanzas");
    expect((await trial!.client.get("/clients")).status, 200, "acceso recuperado");

    // The return page reloaded: same answer, no second charge.
    const replay = await trial!.client.post("/billing/confirm", params);
    expect(replay.status, 200, "repetición");
    expect(replay.data.payments.length, 1, "pagos tras repetir");
  });

  // --- renewals --------------------------------------------------------------------

  const approvedRenewals = () =>
    prisma.subscriptionPayment.count({
      where: { daycareId: paid!.daycareId, kind: "RENEWAL", status: "APPROVED" },
    });

  await test("dos pasadas a la vez cobran una sola renovación", async () => {
    const dueAt = new Date(Date.now() - 3_600_000);
    await prisma.subscription.update({
      where: { daycareId: paid!.daycareId },
      data: { currentPeriodEnd: dueAt },
    });
    await Promise.all([runBillingCycle(), runBillingCycle()]);
    await runBillingCycle();

    expect(await approvedRenewals(), 1, "renovaciones cobradas");
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { daycareId: paid!.daycareId },
    });
    expect(row.status, "ACTIVE", "estado");
    // The new period starts where the old one ended, not when the job happened to run.
    expect(row.currentPeriodStart?.getTime(), dueAt.getTime(), "inicio del periodo");
    ok(row.currentPeriodEnd!.getTime() - dueAt.getTime() >= 28 * DAY_MS, "un mes más");
  });

  await test("una tarjeta rechazada deja el plan en mora, con acceso durante la gracia", async () => {
    await prisma.subscription.update({
      where: { daycareId: paid!.daycareId },
      data: {
        cardToken: encryptSecret(SIMULATED_DECLINE_TOKEN),
        currentPeriodEnd: new Date(Date.now() - 3_600_000),
      },
    });
    const stats = await runBillingCycle();
    ok(stats.declined >= 1, "el cobro debió rechazarse");
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { daycareId: paid!.daycareId },
    });
    expect(row.status, "PAST_DUE", "estado");
    expect(row.failedAttempts, 1, "intentos fallidos");
    ok(row.nextAttemptAt && row.nextAttemptAt > new Date(), "debe programar el reintento");

    // Not due for a retry yet: another pass must not charge again.
    await runBillingCycle();
    expect(
      await prisma.subscriptionPayment.count({
        where: { daycareId: paid!.daycareId, kind: "RENEWAL", status: "DECLINED" },
      }),
      1,
      "intentos de cobro",
    );
    await syncStatus(paid!.daycareId);
    expect((await paid!.client.get("/clients")).status, 200, "acceso durante la gracia");
    expect((await paid!.client.get("/auth/me")).data.subscription.status, "PAST_DUE", "/auth/me");
  });

  await test("pasada la gracia sin pago, se suspende; al pagar, vuelve", async () => {
    await prisma.subscription.update({
      where: { daycareId: paid!.daycareId },
      data: { currentPeriodEnd: new Date(Date.now() - 8 * DAY_MS) },
    });
    const stats = await runBillingCycle();
    ok(stats.suspended >= 1, "debió suspender");
    await syncStatus(paid!.daycareId);
    expect((await paid!.client.get("/clients")).status, 402, "suspendida");

    const checkout = await paid!.client.post("/billing/checkout", { saveCard: true });
    expect(checkout.status, 201, "POST /billing/checkout");
    const confirm = await paid!.client.post(
      "/billing/confirm",
      returnParams(checkout.data.redirectUrl, "/suscripcion"),
    );
    expect(confirm.status, 200, "POST /billing/confirm");
    expect(confirm.data.subscription.status, "ACTIVE", "suscripción");
    expect(confirm.data.subscription.planId, "integral", "el plan no cambia al renovar");
    expect((await paid!.client.get("/clients")).status, 200, "acceso recuperado");

    // It does not owe the days it was locked out: the new period starts at the payment.
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { daycareId: paid!.daycareId },
    });
    ok(Date.now() - row.currentPeriodStart!.getTime() < 60_000, "el periodo empieza al pagar");
    expect(row.failedAttempts, 0, "intentos fallidos tras pagar");
  });

  await test("quitar la tarjeta deja las renovaciones en manos de la cuenta", async () => {
    const res = await paid!.client.delete("/billing/card");
    expect(res.status, 200, "DELETE /billing/card");
    expect(res.data.subscription.hasCard, false, "tarjeta");
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { daycareId: paid!.daycareId },
    });
    expect(row.cardToken, null, "token guardado");
    expect(row.payerDocument, null, "datos del titular");
  });

  // --- offboarding -----------------------------------------------------------------

  await test("eliminar la guardería desde la consola se lleva su suscripción y sus pagos", async () => {
    const id = paid!.daycareId;
    expect(
      (await superadmin.patch(`/platform/daycares/${id}`, { isActive: false })).status,
      200,
      "desactivar",
    );
    const res = await superadmin.delete(`/platform/daycares/${id}`, {
      data: { confirm: paidSlug },
    });
    expect(res.status, 200, "DELETE /platform/daycares/:id");
    expect(await prisma.subscription.count({ where: { daycareId: id } }), 0, "suscripción");
    expect(await prisma.subscriptionPayment.count({ where: { daycareId: id } }), 0, "pagos");
    // The signup carries the business's tax id and contact: it goes with the tenant.
    expect(await prisma.signupIntent.count({ where: { daycareId: id } }), 0, "registro");
  });

  await cleanup();
  await prisma.$disconnect();

  console.log("=".repeat(60));
  console.log(`${passed} pasaron, ${failed} fallaron\n`);
  if (failed > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
