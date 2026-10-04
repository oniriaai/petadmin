import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";

import { backendModules, registerBackendModules } from "../src/platform/module-registry";
import { moduleServesUnits, requireModuleAccess } from "../src/platform/module-access";
import { requireAuth } from "../src/middleware/auth";
import { backendModuleIdsFor, productModuleForBackendId } from "../src/platform/product-modules";

// --- mounting composition ----------------------------------------------------
// The gate must be a sibling of the router, not a wrapper around it: the module's exported
// router object has to stay the thing that is mounted.

const mounted: Array<{ path: string; handlers: unknown[] }> = [];
registerBackendModules({
  use: (path: string, ...handlers: unknown[]) => mounted.push({ path, handlers }),
} as never);

assert.equal(mounted.length, backendModules.length, "every module must be mounted exactly once");

const publicModules = backendModules.filter((m) => m.public);
assert.deepEqual(
  publicModules.map((m) => m.id),
  ["auth"],
  "auth must be the only module mounted without authentication",
);

for (const [index, module] of backendModules.entries()) {
  const entry = mounted[index];
  assert.equal(entry.path, `/api/v1${module.basePath}`, `wrong mount path for ${module.id}`);

  if (module.public) {
    assert.deepEqual(entry.handlers, [module.router], `public module ${module.id} must mount bare`);
    continue;
  }

  assert.equal(entry.handlers.length, 3, `${module.id} must mount auth + gate + router`);
  assert.equal(entry.handlers[0], requireAuth, `${module.id} must authenticate first`);
  assert.equal(
    typeof entry.handlers[1],
    "function",
    `${module.id} must carry the entitlement gate`,
  );
  assert.equal(
    entry.handlers[2],
    module.router,
    `${module.id} must mount its own router object, unwrapped`,
  );
}

// --- gate decisions ----------------------------------------------------------
// Everything below the entitlement lookup is decided without touching the database, so it can
// be asserted directly.

interface GateResult {
  status?: number;
  body?: Record<string, unknown>;
  passed: boolean;
  /** The gate got past role and unit and tried to read entitlements. */
  reachedEntitlementCheck?: boolean;
}

async function runGate(
  moduleId: string,
  user: unknown,
  businessUnitHeader?: string,
): Promise<GateResult> {
  const module = backendModules.find((m) => m.id === moduleId);
  assert.ok(module, `unknown module ${moduleId}`);
  const gate = requireModuleAccess(module);

  const result: GateResult = { passed: false };
  const req = {
    user,
    headers: businessUnitHeader ? { "x-business-unit": businessUnitHeader } : {},
    query: {},
  } as unknown as Request;
  const res = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      result.body = body;
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = (err?: unknown) => {
    // The entitlement lookup needs a database and this suite runs without one. Reaching it at
    // all is the signal these cases care about: every check before it has passed.
    if (err) {
      result.reachedEntitlementCheck = true;
      return;
    }
    result.passed = true;
  };

  await gate(req, res, next);
  return result;
}

async function main(): Promise<void> {
  const superadmin = { role: "superadmin", daycareId: null };
  const daycareUser = { role: "daycare", daycareId: "daycare_a" };
  const groomingUser = { role: "grooming", daycareId: "daycare_a" };

  // No session at all.
  assert.equal((await runGate("guarderia", undefined)).status, 401);

  // The superadmin bypass comes BEFORE the role check. This ordering is load-bearing: no
  // module's access.roles lists "superadmin" (they enumerate tenant roles), so checking roles
  // first would lock the platform out of the product it administers.
  for (const moduleId of ["guarderia", "peluqueria", "reports"]) {
    assert.equal(
      (await runGate(moduleId, superadmin)).passed,
      true,
      `superadmin must reach ${moduleId}`,
    );
  }

  // Role denial is 403 and never reveals whether the module was also unsold.
  const wrongRole = await runGate("guarderia", groomingUser);
  assert.equal(wrongRole.status, 403);
  assert.equal(
    wrongRole.body?.code,
    undefined,
    "a role denial must not be reported as MODULE_DISABLED",
  );

  // --- business-unit narrowing -----------------------------------------------
  // `access.businessUnits` used to be metadata that nothing read. It only bites for a role that
  // spans both units and has narrowed with the header: for `daycare`/`grooming` the role check
  // above already decided.
  const tenantAdmin = { role: "admin", daycareId: "daycare_a", businessUnit: "GLOBAL" };

  const wrongUnit = await runGate("guarderia", tenantAdmin, "GROOMING");
  assert.equal(
    wrongUnit.status,
    403,
    "an admin scoped to grooming must not reach the daycare module",
  );
  assert.equal(wrongUnit.body?.code, "WRONG_BUSINESS_UNIT");
  assert.notEqual(
    wrongUnit.body?.code,
    "MODULE_DISABLED",
    "a unit mismatch is not an entitlement failure",
  );

  // The positive direction is asserted against the rule itself: driving it through the
  // middleware would continue into the entitlement lookup, which needs a database.
  const guarderiaModule = backendModules.find((m) => m.id === "guarderia")!;
  const reservationsModule = backendModules.find((m) => m.id === "reservations")!;
  const dashboardModule = backendModules.find((m) => m.id === "dashboard")!;

  assert.equal(
    moduleServesUnits(guarderiaModule, ["DAYCARE", "GROOMING"]),
    true,
    "consolidated spans both",
  );
  assert.equal(moduleServesUnits(guarderiaModule, ["DAYCARE"]), true);
  assert.equal(
    moduleServesUnits(guarderiaModule, ["GROOMING"]),
    false,
    "guarderia does not serve grooming",
  );
  assert.equal(
    moduleServesUnits(reservationsModule, ["GROOMING"]),
    true,
    "reservations serves both units",
  );
  // With a third unit, a list naming two of them constrains. The shared agenda primitives have
  // to name the clinic explicitly, and the ones a clinic does not use must refuse it.
  const veterinariaModule = backendModules.find((m) => m.id === "veterinaria")!;
  const recurringPlansModule = backendModules.find((m) => m.id === "recurring-plans")!;
  for (const moduleId of ["reservations", "rooms", "check-in-out"]) {
    assert.equal(
      moduleServesUnits(
        backendModules.find((m) => m.id === moduleId)!,
        ["VETERINARY"],
      ),
      true,
      `${moduleId} must serve the clinic: its visits are reservations in rooms`,
    );
  }
  assert.equal(
    moduleServesUnits(recurringPlansModule, ["VETERINARY"]),
    false,
    "recurring plans are not a clinic feature",
  );
  assert.equal(moduleServesUnits(veterinariaModule, ["VETERINARY"]), true);
  assert.equal(
    moduleServesUnits(veterinariaModule, ["GROOMING"]),
    false,
    "the clinic does not serve grooming",
  );
  assert.equal(
    moduleServesUnits(veterinariaModule, ["DAYCARE", "GROOMING", "VETERINARY"]),
    true,
    "consolidated spans every unit",
  );
  const clinicFromGrooming = await runGate("veterinaria", tenantAdmin, "GROOMING");
  assert.equal(clinicFromGrooming.body?.code, "WRONG_BUSINESS_UNIT");
  assert.equal(
    (await runGate("veterinaria", groomingUser)).status,
    403,
    "a grooming user must not reach clinical records",
  );
  assert.ok(backendModuleIdsFor(["reservas", "veterinaria"]).has("veterinaria"));
  assert.equal(backendModuleIdsFor(["reservas"]).has("veterinaria"), false, "the clinic is sold");

  assert.equal(
    moduleServesUnits(dashboardModule, ["GROOMING"]),
    true,
    "a module with no declared units is unconstrained",
  );

  // A malformed header is the caller's mistake: 400, not 500.
  const badHeader = await runGate("guarderia", tenantAdmin, "NO_SUCH_UNIT");
  assert.equal(badHeader.status, 400, "an unrecognised unit is a bad request");

  // The superadmin bypass still precedes all of this.
  assert.equal(
    (await runGate("guarderia", superadmin, "GROOMING")).passed,
    true,
    "the platform role is not narrowed by the header",
  );

  // Core modules are reachable without any entitlement row, so this resolves with no database.
  for (const moduleId of ["dashboard", "clients", "pets", "storage"]) {
    const productModule = productModuleForBackendId(moduleId);
    assert.equal(productModule?.core, true, `${moduleId} is expected to be core`);
    assert.equal((await runGate(moduleId, daycareUser)).passed, true, `${moduleId} must be free`);
  }

  // --- catalog expansion -------------------------------------------------------
  // What the gate consults, checked independently of it.

  const nothingBought = backendModuleIdsFor([]);
  assert.ok(nothingBought.has("dashboard"), "core modules are granted with no purchase");
  assert.equal(nothingBought.has("guarderia"), false, "guarderia is not free");
  assert.equal(nothingBought.has("incomes"), false, "finanzas is not free");

  const groomingOnly = backendModuleIdsFor(["reservas", "peluqueria"]);
  assert.ok(groomingOnly.has("peluqueria"));
  assert.ok(groomingOnly.has("reservations"));
  assert.ok(groomingOnly.has("rooms"), "grooming reservations occupy rooms");
  assert.ok(groomingOnly.has("check-in-out"), "grooming reservations record attendance");
  assert.equal(groomingOnly.has("guarderia"), false, "the daycare floor module is not implied");
  assert.equal(groomingOnly.has("inventory"), false);

  // Every mounted, non-public module is governed by a product module -- otherwise it would mount
  // with nothing behind it. validateBackendModules asserts this at boot; restated here so the
  // failure names the module.
  for (const module of backendModules) {
    assert.ok(
      productModuleForBackendId(module.id),
      `backend module '${module.id}' is not claimed by any product module`,
    );
  }

  console.log(`✓ module entitlement gate (${backendModules.length} modules mounted)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
