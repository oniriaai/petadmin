import assert from "node:assert/strict";

/**
 * The production configuration guard. Runs without a database, so it belongs to the
 * architecture suite rather than the e2e ones.
 *
 * The case that matters: `JWT_SECRET` used to default to "change_me" in two places, so a
 * deployment that forgot to set it signed and accepted tokens with a publicly known key —
 * anyone could mint a superadmin token. The process must refuse to start instead.
 *
 * `assertSecureConfig` reads `process.env` when called, so each case sets the environment and
 * re-imports the module with a cleared require cache.
 */

const SECURITY_MODULE = "../src/middleware/security";

function withEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const saved = { ...process.env };
  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[require.resolve(SECURITY_MODULE)];
    fn();
  } finally {
    process.env = saved;
    delete require.cache[require.resolve(SECURITY_MODULE)];
  }
}

function assertSecureConfigWith(env: Record<string, string | undefined>): () => void {
  let result: () => void = () => {};
  withEnv(env, () => {
    const { assertSecureConfig } = require(SECURITY_MODULE);
    try {
      assertSecureConfig();
      result = () => {};
    } catch (error) {
      result = () => {
        throw error;
      };
    }
  });
  return result;
}

const PRODUCTION_OK = {
  NODE_ENV: "production",
  JWT_SECRET: "x".repeat(48),
  CORS_ORIGINS: "https://admin.example.com",
  DATABASE_URL: "postgresql://user:pass@db:5432/app",
};

// A correctly configured production process starts.
assertSecureConfigWith(PRODUCTION_OK)();

// The default secret must be refused, and the message must say which value is wrong.
assert.throws(
  assertSecureConfigWith({ ...PRODUCTION_OK, JWT_SECRET: "change_me" }),
  /JWT_SECRET/,
  "A production boot with the example secret must be refused",
);

assert.throws(
  assertSecureConfigWith({ ...PRODUCTION_OK, JWT_SECRET: undefined }),
  /JWT_SECRET/,
  "A production boot with no secret must be refused",
);

assert.throws(
  assertSecureConfigWith({ ...PRODUCTION_OK, JWT_SECRET: "short" }),
  /JWT_SECRET/,
  "A production boot with a trivially short secret must be refused",
);

assert.throws(
  assertSecureConfigWith({ ...PRODUCTION_OK, CORS_ORIGINS: undefined }),
  /CORS_ORIGINS/,
  "Production must not fall back to the development origins",
);

assert.throws(
  assertSecureConfigWith({ ...PRODUCTION_OK, DATABASE_URL: undefined }),
  /DATABASE_URL/,
  "A production boot with no database URL must be refused",
);

// Development is deliberately permissive: the guard must not make `docker compose up` fail.
assertSecureConfigWith({
  NODE_ENV: "development",
  JWT_SECRET: "change_me",
  CORS_ORIGINS: undefined,
  DATABASE_URL: undefined,
})();

// The CORS allowlist itself: an arbitrary origin is refused, a configured one is allowed, and
// a request with no Origin header at all (curl, the e2e suites, server-to-server) is allowed.
withEnv(
  { NODE_ENV: "production", CORS_ORIGINS: "https://admin.example.com, https://b.example" },
  () => {
    const { corsOptions } = require(SECURITY_MODULE);
    const { origin } = corsOptions();

    const decide = (value: string | undefined): boolean => {
      let allowed = false;
      origin(value, (_err: Error | null, ok?: boolean) => {
        allowed = ok === true;
      });
      return allowed;
    };

    assert.equal(decide("https://admin.example.com"), true, "A configured origin must be allowed");
    assert.equal(decide("https://b.example"), true, "Every listed origin must be allowed");
    assert.equal(decide("https://admin.example.com/"), true, "A trailing slash must not matter");
    assert.equal(decide("https://evil.example"), false, "An unlisted origin must be refused");
    assert.equal(decide(undefined), true, "A request with no Origin header must be allowed");
  },
);

console.log("✓ production security configuration guard");
