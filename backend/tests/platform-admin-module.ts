import assert from "node:assert/strict";

import { PLATFORM_ADMIN_MODULE_ID, platformRouter } from "../src/modules/platform-admin";
import { backendModules } from "../src/platform/module-registry";
import {
  TOGGLEABLE_PRODUCT_MODULES,
  getProductModule,
  productModuleForBackendId,
} from "../src/platform/product-modules";

assert.equal(PLATFORM_ADMIN_MODULE_ID, "platform");
assert.ok(platformRouter);

const module = backendModules.find((entry) => entry.id === "platform");
assert.ok(module, "the platform console must be registered like any other module");
assert.equal(module.router, platformRouter);
assert.equal(module.basePath, "/platform");

// Superadmin-only, and no tenant role may be added here by accident.
assert.deepEqual(module.access, { roles: ["superadmin"] });
assert.equal(module.public, undefined, "the console must never be public");

// The console is governed by a platform-only product module, so no daycare can be sold it and
// `isBackendModuleEnabled` answers false for every tenant.
const productModule = productModuleForBackendId("platform");
assert.equal(productModule?.id, "plataforma");
assert.equal(productModule?.platformOnly, true);
assert.equal(productModule?.core, undefined, "platform-only is not core: core modules are free to tenants");

// It must not appear in the console's own toggle matrix.
assert.ok(getProductModule("plataforma"));
assert.equal(
  TOGGLEABLE_PRODUCT_MODULES.some((m) => m.id === "plataforma"),
  false,
  "the platform console must not be offered as a toggle",
);

console.log("✓ platform-admin module registration");
