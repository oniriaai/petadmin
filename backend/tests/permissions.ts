import assert from "node:assert/strict";
import type { Request } from "express";

import {
  DEFAULT_STAFF_PERMISSIONS,
  PERMISSION_IDS,
  PERMISSIONS,
  effectivePermissions,
  hasPermission,
  isPermissionId,
  normalizePermissions,
} from "../src/core/tenancy/permissions";
import type { Permission } from "../src/core/tenancy/permissions";
import { backendModules } from "../src/platform/module-registry";
import { requiredPermissions } from "../src/platform/module-access";

// --- the catalog itself --------------------------------------------------------

assert.equal(new Set(PERMISSION_IDS).size, PERMISSION_IDS.length, "permission ids must be unique");
for (const permission of PERMISSIONS as readonly Permission[]) {
  for (const implied of permission.implies ?? []) {
    assert.ok(isPermissionId(implied), `${permission.id} implies unknown permission ${implied}`);
  }
}
for (const id of DEFAULT_STAFF_PERMISSIONS) assert.ok(isPermissionId(id));

// The default is the point of the feature: a new staff user must not start with the money, the
// exports or the right to delete.
for (const id of ["finanzas.read", "finanzas.write", "inventario.write", "datos.export"] as const) {
  assert.equal(DEFAULT_STAFF_PERMISSIONS.includes(id), false, `${id} must not be a default`);
}
assert.equal(DEFAULT_STAFF_PERMISSIONS.includes("registros.delete"), false);

// --- normalisation -------------------------------------------------------------

assert.deepEqual(
  normalizePermissions(["finanzas.write"]),
  ["finanzas.read", "finanzas.write"],
  "writing implies reading",
);
assert.deepEqual(normalizePermissions(["inventario.write"]), [
  "inventario.read",
  "inventario.write",
]);
assert.deepEqual(
  normalizePermissions(["datos.export", "nope", 7, "datos.export"]),
  ["datos.export"],
  "unknown ids are dropped and duplicates collapsed",
);
assert.deepEqual(normalizePermissions([]), []);

// --- effective permissions -----------------------------------------------------

assert.deepEqual(effectivePermissions("admin", []), [...PERMISSION_IDS], "an admin holds all");
assert.deepEqual(effectivePermissions("superadmin", []), [...PERMISSION_IDS]);
assert.deepEqual(effectivePermissions("daycare", []), [], "staff hold only what was granted");
assert.deepEqual(effectivePermissions("grooming", ["finanzas.read"]), ["finanzas.read"]);

const as = (user: unknown) => ({ user }) as unknown as Request;
assert.equal(hasPermission(as(undefined), "finanzas.read"), false);
assert.equal(hasPermission(as({ role: "admin", permissions: [] }), "finanzas.read"), true);
assert.equal(hasPermission(as({ role: "daycare", permissions: [] }), "finanzas.read"), false);
assert.equal(
  hasPermission(as({ role: "daycare", permissions: ["finanzas.read"] }), "finanzas.read"),
  true,
);

// --- what the registry asks for --------------------------------------------------
// The rules are data, so the whole map can be pinned without a server.

function needs(moduleId: string, method: string, path: string): string[] {
  const module = backendModules.find((m) => m.id === moduleId);
  assert.ok(module, `unknown module ${moduleId}`);
  return requiredPermissions(module, method, path).sort();
}

for (const moduleId of ["incomes", "payables", "providers"]) {
  assert.deepEqual(needs(moduleId, "GET", "/"), ["finanzas.read"]);
  assert.deepEqual(needs(moduleId, "GET", "/abc"), ["finanzas.read"]);
  assert.deepEqual(needs(moduleId, "GET", "/summary"), ["finanzas.read"]);
  assert.deepEqual(needs(moduleId, "POST", "/"), ["finanzas.write"]);
  assert.deepEqual(needs(moduleId, "PUT", "/abc"), ["finanzas.write"]);
  assert.deepEqual(needs(moduleId, "DELETE", "/abc"), ["finanzas.write"]);
}
assert.deepEqual(needs("payables", "POST", "/abc/payments"), ["finanzas.write"]);

assert.deepEqual(needs("inventory", "GET", "/items"), ["inventario.read"]);
assert.deepEqual(needs("inventory", "GET", "/items/abc/movements"), ["inventario.read"]);
assert.deepEqual(needs("inventory", "POST", "/items/abc/movements"), ["inventario.write"]);
assert.deepEqual(needs("inventory", "DELETE", "/items/abc"), ["inventario.write"]);

assert.deepEqual(needs("reports", "GET", "/finance"), ["finanzas.read"]);
// A prefix matches on a segment boundary, not on a string that merely starts the same way.
assert.deepEqual(needs("reports", "GET", "/finances"), []);
assert.deepEqual(needs("reports", "GET", "/transport"), [], "the transport route stays open");

assert.deepEqual(needs("export", "GET", "/clients"), ["datos.export"]);
assert.deepEqual(needs("export", "GET", "/reservations"), ["datos.export"]);
assert.deepEqual(needs("export", "GET", "/incomes"), ["datos.export", "finanzas.read"]);
assert.deepEqual(needs("export", "GET", "/expenses"), ["datos.export", "finanzas.read"]);

assert.deepEqual(needs("dashboard", "GET", "/summary"), [], "the summary filters in the handler");

for (const moduleId of ["clients", "pets", "reservations", "recurring-plans", "rooms"]) {
  assert.deepEqual(needs(moduleId, "DELETE", "/abc"), ["registros.delete"], moduleId);
  assert.deepEqual(needs(moduleId, "GET", "/abc"), [], `${moduleId} reads stay open`);
  assert.deepEqual(needs(moduleId, "PUT", "/abc"), [], `${moduleId} edits stay open`);
}
// Removing a line under a record is editing it, not deleting it.
assert.deepEqual(needs("pets", "DELETE", "/abc/vaccinations/v1"), []);
assert.deepEqual(needs("peluqueria", "DELETE", "/appointments/abc"), ["registros.delete"]);
assert.deepEqual(needs("veterinaria", "DELETE", "/visits/abc"), ["registros.delete"]);
assert.deepEqual(needs("veterinaria", "DELETE", "/visits/abc/vitals/v1"), []);
assert.deepEqual(needs("veterinaria", "DELETE", "/services/abc"), [], "already admin-only");
// Telling a tutor about tomorrow's visit is ordinary front-desk work: no permission on top.
assert.deepEqual(needs("reminders", "GET", "/due"), []);
assert.deepEqual(needs("reminders", "POST", "/send"), []);
assert.deepEqual(needs("reminders", "GET", "/log"), []);

console.log(`✓ permissions (${PERMISSION_IDS.length} in the catalog)`);
