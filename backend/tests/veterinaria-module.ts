import assert from "node:assert/strict";
import { VETERINARIA_BUSINESS_UNIT, veterinariaRouter } from "../src/modules/veterinaria";
import { backendModules } from "../src/platform/module-registry";
import { getProductModule, productModuleForBackendId } from "../src/platform/product-modules";

assert.ok(veterinariaRouter);
assert.equal(VETERINARIA_BUSINESS_UNIT, "VETERINARY");
assert.equal(
  backendModules.find((module) => module.id === "veterinaria")?.router,
  veterinariaRouter,
);
assert.equal(productModuleForBackendId("veterinaria")?.id, "veterinaria");
// Visits are reservations, so the clinic cannot be enabled without the agenda primitives.
assert.deepEqual(getProductModule("veterinaria")?.requires, ["reservas"]);
console.log("✓ veterinaria module public entry points");
