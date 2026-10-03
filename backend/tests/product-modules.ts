import assert from "node:assert/strict";
import { Router } from "express";
import {
  DEFAULT_ENABLED_PRODUCT_MODULES,
  PRODUCT_MODULES,
  TOGGLEABLE_PRODUCT_MODULES,
  backendModuleIdsFor,
  getProductModule,
  productModuleForBackendId,
  validateProductModules,
} from "../src/platform/product-modules";
import { backendModules, validateBackendModules } from "../src/platform/module-registry";

// The shipped catalog is structurally sound.
validateProductModules();

// Exactly one product module governs each mounted backend module. This is the invariant that
// stops a new backend module from mounting with no entitlement behind it.
for (const module of backendModules) {
  const owner = productModuleForBackendId(module.id);
  assert.ok(owner, `backend module '${module.id}' is not claimed by any product module`);
}

// ...and the catalog does not claim backend modules that do not exist.
const mountedIds = new Set(backendModules.map((m) => m.id));
for (const productModule of PRODUCT_MODULES) {
  for (const backendId of productModule.backendModuleIds) {
    assert.ok(
      mountedIds.has(backendId),
      `product module '${productModule.id}' claims unknown backend module '${backendId}'`,
    );
  }
}

// The guard must actually throw, not merely be present.
assert.throws(
  () =>
    validateBackendModules([
      { id: "unclaimed-module", basePath: "/unclaimed", router: Router(), description: "test" },
    ]),
  /not claimed by any product module/,
  "an unclaimed backend module must fail validation",
);

// Catalog-level failures are caught too.
assert.throws(
  () =>
    validateProductModules([
      { id: "a", label: "A", description: "", backendModuleIds: ["auth"] },
      { id: "a", label: "A2", description: "", backendModuleIds: ["pets"] },
    ]),
  /Duplicate product module id/,
);
assert.throws(
  () =>
    validateProductModules([
      { id: "a", label: "A", description: "", backendModuleIds: ["auth"] },
      { id: "b", label: "B", description: "", backendModuleIds: ["auth"] },
    ]),
  /claimed by both/,
  "two product modules must not claim the same backend module",
);
assert.throws(
  () =>
    validateProductModules([
      { id: "a", label: "A", description: "", backendModuleIds: ["auth"], requires: ["nope"] },
    ]),
  /requires unknown module/,
);
assert.throws(
  () =>
    validateProductModules([
      { id: "a", label: "A", description: "", backendModuleIds: ["auth"], requires: ["b"] },
      { id: "b", label: "B", description: "", backendModuleIds: ["pets"], requires: ["a"] },
    ]),
  /dependency cycle/,
);
assert.throws(
  () => validateProductModules([{ id: "a", label: "A", description: "", backendModuleIds: [] }]),
  /at least one backend module/,
);

// Core is always granted, even with nothing enabled.
const nothingEnabled = backendModuleIdsFor([]);
for (const coreId of ["auth", "dashboard", "clients", "pets", "storage"]) {
  assert.ok(nothingEnabled.has(coreId), `core backend module '${coreId}' must always be granted`);
}
assert.equal(nothingEnabled.has("peluqueria"), false, "a disabled module must not be granted");

// Enabling a product module grants all of its backend ids.
const withReservas = backendModuleIdsFor(["reservas"]);
for (const id of ["reservations", "rooms", "check-in-out", "recurring-plans"]) {
  assert.ok(withReservas.has(id), `'reservas' must grant '${id}'`);
}

// Rooms, attendance and recurring plans belong to `reservas`, not `guarderia`: grooming
// reservations occupy rooms and record check-in/out too, so a grooming-only tenant that got
// them via `guarderia` could not run its own bookings.
const withGuarderia = backendModuleIdsFor(["guarderia"]);
assert.ok(withGuarderia.has("guarderia"));
for (const id of ["rooms", "check-in-out", "recurring-plans"]) {
  assert.equal(withGuarderia.has(id), false, `'guarderia' alone must not grant '${id}'`);
}

// A grooming-only tenant gets everything its bookings need.
const groomingTenant = backendModuleIdsFor(["reservas", "peluqueria"]);
for (const id of ["peluqueria", "reservations", "rooms", "check-in-out"]) {
  assert.ok(groomingTenant.has(id), `a grooming-only tenant needs '${id}'`);
}
assert.equal(groomingTenant.has("guarderia"), false);

// Unknown ids are ignored rather than throwing, so a stale row cannot break a request.
assert.doesNotThrow(() => backendModuleIdsFor(["no-such-module"]));

// Core and platform-only modules are never offered as toggles.
for (const productModule of TOGGLEABLE_PRODUCT_MODULES) {
  assert.equal(productModule.core, undefined);
  assert.equal(productModule.platformOnly, undefined);
}
assert.ok(getProductModule("nucleo")?.core, "nucleo must be core");

// Defaults must be real, toggleable modules, and their dependencies must be satisfiable.
for (const id of DEFAULT_ENABLED_PRODUCT_MODULES) {
  const productModule = getProductModule(id);
  assert.ok(productModule, `default module '${id}' must exist`);
  assert.equal(productModule.core, undefined, `default module '${id}' should not be core`);
  for (const required of productModule.requires ?? []) {
    assert.ok(
      DEFAULT_ENABLED_PRODUCT_MODULES.includes(required),
      `default module '${id}' requires '${required}', which is not enabled by default`,
    );
  }
}

console.log(
  `✓ product module catalog (${PRODUCT_MODULES.length} modules, ${TOGGLEABLE_PRODUCT_MODULES.length} toggleable)`,
);
