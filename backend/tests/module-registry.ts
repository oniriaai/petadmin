import assert from "node:assert/strict";
import { backendModules, validateBackendModules } from "../src/platform/module-registry";

validateBackendModules();

const mountedPaths = new Set<string>();
for (const module of backendModules) {
  assert.ok(module.id, "Every backend module must have an id");
  assert.ok(module.router, `Module ${module.id} must expose a router`);
  assert.ok(module.basePath.startsWith("/"), `Module ${module.id} must use an absolute base path`);
  assert.equal(mountedPaths.has(module.basePath), false, `Duplicate backend path: ${module.basePath}`);
  mountedPaths.add(module.basePath);
}

const guarderia = backendModules.find((module) => module.id === "guarderia");
assert.deepEqual(guarderia?.access, {
  roles: ["admin", "kinderdog"],
  businessUnits: ["KINDERDOG"],
});

const peluqueria = backendModules.find((module) => module.id === "peluqueria");
assert.deepEqual(peluqueria?.access, {
  roles: ["admin", "pethijos"],
  businessUnits: ["PETHIJOS"],
});

console.log(`✓ backend module registry (${backendModules.length} modules)`);
