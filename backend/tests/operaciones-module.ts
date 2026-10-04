import assert from "node:assert/strict";
import { checkInOutRouter, roomsRouter } from "../src/modules/operaciones";
import { backendModules } from "../src/platform/module-registry";

assert.ok(checkInOutRouter);
assert.ok(roomsRouter);
assert.equal(
  backendModules.find((module) => module.id === "check-in-out")?.router,
  checkInOutRouter,
);
assert.equal(backendModules.find((module) => module.id === "rooms")?.router, roomsRouter);
console.log("✓ operaciones module public entry points");
