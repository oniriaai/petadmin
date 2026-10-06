import assert from "node:assert/strict";
import {
  PUBLIC_MODULE_IDS,
  backendModules,
  validateBackendModules,
} from "../src/platform/module-registry";

validateBackendModules();

const mountedPaths = new Set<string>();
for (const module of backendModules) {
  assert.ok(module.id, "Every backend module must have an id");
  assert.ok(module.router, `Module ${module.id} must expose a router`);
  assert.ok(module.basePath.startsWith("/"), `Module ${module.id} must use an absolute base path`);
  assert.equal(
    mountedPaths.has(module.basePath),
    false,
    `Duplicate backend path: ${module.basePath}`,
  );
  mountedPaths.add(module.basePath);
}

const guarderia = backendModules.find((module) => module.id === "guarderia");
assert.deepEqual(guarderia?.access, {
  roles: ["admin", "daycare"],
  businessUnits: ["DAYCARE"],
});

const peluqueria = backendModules.find((module) => module.id === "peluqueria");
assert.deepEqual(peluqueria?.access, {
  roles: ["admin", "grooming"],
  businessUnits: ["GROOMING"],
});

const veterinaria = backendModules.find((module) => module.id === "veterinaria");
assert.deepEqual(veterinaria?.access, {
  roles: ["admin", "veterinary"],
  businessUnits: ["VETERINARY"],
});

// A permission rule naming something outside the catalog must fail at boot, like an unclaimed
// module does, rather than silently never matching anyone's grants.
assert.throws(
  () =>
    validateBackendModules([
      {
        ...backendModules.find((module) => module.id === "clients")!,
        permissions: [{ permission: "no.such.permission" as never }],
      },
    ]),
  /unknown permission/,
);

// Mounting without authentication is allowlisted by id: a module cannot opt itself out of
// `requireAuth` by setting a flag.
assert.deepEqual(
  backendModules.filter((module) => module.public).map((module) => module.id),
  [...PUBLIC_MODULE_IDS],
);
assert.throws(
  () =>
    validateBackendModules([
      { ...backendModules.find((module) => module.id === "clients")!, public: true },
    ]),
  /may be public/,
);

// The account holder pays; nobody else sees the subscription.
assert.deepEqual(backendModules.find((module) => module.id === "billing")?.access, {
  roles: ["admin"],
});

console.log(`✓ backend module registry (${backendModules.length} modules)`);
