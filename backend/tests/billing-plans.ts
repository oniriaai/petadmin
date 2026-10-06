import assert from "node:assert/strict";

import { encryptCardHolder } from "../src/core/payments/payphone";
import {
  assertDependenciesSatisfied,
  initialEntitlements,
} from "../src/modules/platform-admin/entitlements.service";
import {
  PLANS,
  TRIAL_PLAN_ID,
  PlanError,
  addMonths,
  getPlan,
  periodEnd,
  planModules,
  planPriceCents,
  quoteFor,
  resolvePlanUnits,
} from "../src/modules/suscripciones/plans";
import { decryptSecret, encryptSecret } from "../src/modules/suscripciones/secrets";
import { BUSINESS_UNITS } from "../src/middleware/auth";

/**
 * The plans sold from the public page. Runs without a database.
 *
 * The prices are pinned to docs/argos-suite-pricing-proposal.md on purpose: this is what a card
 * is charged, so changing one should take changing it here too.
 */

// --- prices, in USD before IVA: [monthly, annual] ------------------------------
const PRICES: Record<string, [number, number]> = {
  inicial: [29, 290],
  "inicial-veterinaria": [39, 390],
  negocio: [49, 490],
  integral: [89, 890],
  "integral-3": [109, 1090],
};
assert.deepEqual(PLANS.map((plan) => plan.id).sort(), Object.keys(PRICES).sort());
for (const plan of PLANS) {
  const [monthly, annual] = PRICES[plan.id];
  assert.equal(plan.monthlyCents, monthly * 100, `${plan.id} monthly`);
  assert.equal(plan.annualCents, annual * 100, `${plan.id} annual`);
  assert.equal(plan.annualCents, plan.monthlyCents * 10, `${plan.id}: annual is ten months`);
}

const plan = (id: string) => getPlan(id)!;

// Negocio costs $10 more with the clinic, and only with the clinic.
assert.equal(planPriceCents(plan("negocio"), ["GROOMING"], "MONTHLY"), 4900);
assert.equal(planPriceCents(plan("negocio"), ["VETERINARY"], "MONTHLY"), 5900);
assert.equal(planPriceCents(plan("negocio"), ["VETERINARY"], "ANNUAL"), 59000);
// Integral already includes whichever units are picked.
assert.equal(planPriceCents(plan("integral"), ["GROOMING", "VETERINARY"], "MONTHLY"), 8900);

// --- units -----------------------------------------------------------------------
assert.deepEqual(resolvePlanUnits(plan("inicial"), ["grooming"]), ["GROOMING"]);
assert.throws(() => resolvePlanUnits(plan("inicial"), ["VETERINARY"]), PlanError);
assert.throws(() => resolvePlanUnits(plan("inicial"), ["DAYCARE", "GROOMING"]), PlanError);
assert.throws(() => resolvePlanUnits(plan("inicial"), []), PlanError);
assert.throws(() => resolvePlanUnits(plan("integral"), ["DAYCARE"]), PlanError);
assert.throws(() => resolvePlanUnits(plan("integral"), ["DAYCARE", "SPA"]), PlanError);
// Canonical order whatever order the form sent, and a repeated unit is one unit.
assert.deepEqual(resolvePlanUnits(plan("integral"), ["VETERINARY", "DAYCARE"]), [
  "DAYCARE",
  "VETERINARY",
]);
assert.throws(() => resolvePlanUnits(plan("integral"), ["DAYCARE", "DAYCARE"]), PlanError);
assert.deepEqual(resolvePlanUnits(plan("integral-3"), [...BUSINESS_UNITS]), [...BUSINESS_UNITS]);

// --- module presets ----------------------------------------------------------------
// Every preset has to be a set the console itself would accept: known, toggleable modules with
// their dependencies satisfied. Otherwise a paid signup would fail at the very last step.
for (const candidate of PLANS) {
  const units = candidate.allowedUnits.slice(0, candidate.unitCount);
  const modules = planModules(candidate, units);
  assert.doesNotThrow(() => initialEntitlements(modules), `${candidate.id} preset`);
  assertDependenciesSatisfied(new Set(modules));
  assert.ok(modules.includes("reservas"), `${candidate.id} must include Reservas`);
}
assert.deepEqual(planModules(plan("inicial"), ["GROOMING"]), ["reservas", "peluqueria"]);
assert.deepEqual(planModules(plan("negocio"), ["VETERINARY"]), [
  "reservas",
  "veterinaria",
  "finanzas",
  "inventario",
  "informes",
  "cumplimiento",
]);
// Reminders come with Integral and with nothing below it.
assert.ok(planModules(plan("integral"), ["DAYCARE", "GROOMING"]).includes("recordatorios"));
assert.ok(!planModules(plan("negocio"), ["DAYCARE"]).includes("recordatorios"));
// A trial runs on everything.
assert.equal(plan(TRIAL_PLAN_ID).unitCount, BUSINESS_UNITS.length);

// --- quotes ------------------------------------------------------------------------
assert.deepEqual(quoteFor(8900, false, 15), {
  subtotalCents: 8900,
  discountCents: 0,
  taxCents: 1335,
  totalCents: 10235,
});
// Founder price: 30% off, and IVA on what is left.
assert.deepEqual(quoteFor(8900, true, 15), {
  subtotalCents: 8900,
  discountCents: 2670,
  taxCents: 935,
  totalCents: 7165,
});
// Whole cents always, and the parts add up to the total: PayPhone refuses a sum that does not.
for (const candidate of PLANS) {
  for (const founder of [false, true]) {
    const quote = quoteFor(candidate.monthlyCents, founder, 15);
    for (const value of Object.values(quote)) assert.ok(Number.isInteger(value));
    assert.equal(
      quote.subtotalCents - quote.discountCents + quote.taxCents,
      quote.totalCents,
      `${candidate.id} parts`,
    );
  }
}
assert.equal(quoteFor(2900, false, 0).totalCents, 2900);

// --- periods -----------------------------------------------------------------------
const date = (value: string) => new Date(value);
assert.equal(addMonths(date("2026-10-06T15:00:00Z"), 1).toISOString(), "2026-11-06T15:00:00.000Z");
// The 31st has no counterpart in a 30-day month: the last day, not the 1st of the next.
assert.equal(addMonths(date("2026-10-31T12:00:00Z"), 1).toISOString(), "2026-11-30T12:00:00.000Z");
assert.equal(addMonths(date("2027-01-31T12:00:00Z"), 1).toISOString(), "2027-02-28T12:00:00.000Z");
assert.equal(addMonths(date("2026-12-15T00:00:00Z"), 1).toISOString(), "2027-01-15T00:00:00.000Z");
assert.equal(
  periodEnd(date("2028-02-29T00:00:00Z"), "ANNUAL").toISOString(),
  "2029-02-28T00:00:00.000Z",
);

// --- the saved card ------------------------------------------------------------------
const token = "ctoken-de-prueba";
const stored = encryptSecret(token);
assert.notEqual(stored, token);
assert.ok(!stored.includes(token), "the token must not be readable in the stored value");
assert.equal(decryptSecret(stored), token);
assert.notEqual(encryptSecret(token), stored, "each encryption uses a fresh nonce");
// A value tampered with, or written under another key, reads as no card rather than throwing
// in the middle of a renewal run.
assert.equal(decryptSecret(`${stored.slice(0, -2)}xx`), null);
assert.equal(decryptSecret("no es un valor cifrado"), null);
assert.equal(decryptSecret(null), null);

// The cardholder's name as PayPhone wants it: deterministic, since there is no IV to vary.
const key = "0123456789abcdef0123456789abcdef";
assert.equal(encryptCardHolder("Ana Pérez", key), encryptCardHolder("Ana Pérez", key));
assert.notEqual(encryptCardHolder("Ana Pérez", key), encryptCardHolder("Ana Perez", key));

console.log(`✓ billing plans (${PLANS.length} plans)`);
