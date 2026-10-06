import assert from "node:assert/strict";

import { DEMO_ACCOUNTS, assertDemoPasswords, demoPassword } from "../prisma/demo-accounts";

// In development and CI the suites and the README rely on the well-known passwords.
assert.equal(demoPassword("admin_global", { NODE_ENV: "development" }), "admin123");
assert.equal(demoPassword("demo_admin", { NODE_ENV: "test" }), "demo123");
assert.doesNotThrow(() => assertDemoPasswords({}));

// Those passwords are in a public repository. A production seed must be given its own, for
// every account: one left out is one anybody can sign in to.
assert.throws(
  () => demoPassword("admin_global", { NODE_ENV: "production" }),
  /DEMO_PASSWORD_ADMIN_GLOBAL/,
);
const configured = Object.fromEntries(
  Object.values(DEMO_ACCOUNTS).map((account, index) => [account.env, `secreto-${index}`]),
);
assert.doesNotThrow(() => assertDemoPasswords({ NODE_ENV: "production", ...configured }));
for (const account of Object.values(DEMO_ACCOUNTS)) {
  const missingOne = { NODE_ENV: "production", ...configured, [account.env]: "  " };
  assert.throws(() => assertDemoPasswords(missingOne), new RegExp(account.env));
}

// A configured value wins everywhere, and is never one of the public ones by accident of code.
assert.equal(
  demoPassword("vet_admin", { NODE_ENV: "development", DEMO_PASSWORD_VET_ADMIN: " propia " }),
  "propia",
);
assert.equal(new Set(Object.values(DEMO_ACCOUNTS).map((account) => account.env)).size, 5);

console.log(`✓ demo account passwords (${Object.keys(DEMO_ACCOUNTS).length} accounts)`);
