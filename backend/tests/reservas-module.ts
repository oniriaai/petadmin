import assert from "node:assert/strict";
import {
  RESERVAS_MODULE_ID,
  reservationsRouter,
  recurringPlansRouter,
  startRecurringPlansScheduler,
} from "../src/modules/reservas";
import { backendModules } from "../src/platform/module-registry";

assert.equal(RESERVAS_MODULE_ID, "reservas");
assert.ok(reservationsRouter);
assert.ok(recurringPlansRouter);
assert.equal(typeof startRecurringPlansScheduler, "function");
assert.equal(
  backendModules.find((module) => module.id === "reservations")?.router,
  reservationsRouter,
);
assert.equal(
  backendModules.find((module) => module.id === "recurring-plans")?.router,
  recurringPlansRouter,
);
console.log("✓ reservas module public entry points");
