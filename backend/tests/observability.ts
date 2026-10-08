import assert from "node:assert/strict";

import { errorHandler } from "../src/middleware/observability";

/**
 * The terminal error handler's contract. Needs no database, so it belongs to the architecture
 * suite.
 *
 * Two things matter and neither is obvious from reading the handler:
 *   - the response carries the request id, because a customer report ("it broke at 3pm") is
 *     only traceable if the user can quote something that appears in the log;
 *   - the response does NOT carry the error message, because internals are not the caller's
 *     business.
 * And it must not try to write a second time when the response is already on the wire, which
 * is how a failed stream turns one error into an ERR_HTTP_HEADERS_SENT crash on top of it.
 */

interface FakeRes {
  statusCode?: number;
  body?: unknown;
  headersSent: boolean;
  status(code: number): FakeRes;
  json(payload: unknown): FakeRes;
}

function fakeRes(headersSent = false): FakeRes {
  return {
    headersSent,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const silent = { error: () => {}, warn: () => {}, debug: () => {}, info: () => {} };

function fakeReq(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-abc-123",
    method: "GET",
    originalUrl: "/api/v1/clients",
    log: silent,
    ...overrides,
  } as any;
}

// A normal unhandled error: 500, generic message, request id included.
{
  const res = fakeRes();
  let nextCalled = false;
  errorHandler(
    new Error("la contraseña de la base de datos es hunter2"),
    fakeReq(),
    res as any,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(res.statusCode, 500, "An unhandled error must answer 500");
  const body = res.body as { message: string; requestId: string };
  assert.equal(body.requestId, "req-abc-123", "The response must carry the request id");
  assert.equal(body.message, "Error interno del servidor", "The message must stay generic");
  assert.equal(
    JSON.stringify(res.body).includes("hunter2"),
    false,
    "The error's own text must never reach the caller",
  );
  assert.equal(nextCalled, false, "A handled error must not fall through to Express");
}

// Express's JSON parser marks malformed request bodies as SyntaxError with a body property.
{
  const res = fakeRes();
  errorHandler(
    Object.assign(new SyntaxError("Unexpected token"), { body: "{" }),
    fakeReq({ method: "POST", originalUrl: "/api/v1/auth/login" }),
    res as any,
    () => {},
  );

  assert.equal(res.statusCode, 400, "Malformed JSON must be a client error");
  assert.deepEqual(res.body, {
    message: "Datos inválidos",
    requestId: "req-abc-123",
  });
}

// An authenticated request: the handler reads tenant context without assuming it exists.
{
  const res = fakeRes();
  errorHandler(
    new Error("boom"),
    fakeReq({ user: { daycareId: "daycare_x", userId: "user_y", username: "u", role: "admin" } }),
    res as any,
    () => {},
  );
  assert.equal(res.statusCode, 500, "Tenant context must not change the status");
  assert.equal((res.body as { requestId: string }).requestId, "req-abc-123");
}

// A request with no id still answers, rather than throwing on a missing field.
{
  const res = fakeRes();
  errorHandler(new Error("boom"), fakeReq({ id: undefined }), res as any, () => {});
  assert.equal((res.body as { requestId: string }).requestId, "unknown");
}

// Already-sent response: delegate to Express instead of writing twice.
{
  const res = fakeRes(true);
  let forwarded: unknown = null;
  const original = new Error("falló a mitad del stream");
  errorHandler(original, fakeReq(), res as any, (err?: unknown) => {
    forwarded = err;
  });

  assert.equal(res.statusCode, undefined, "Must not write a status onto a sent response");
  assert.equal(res.body, undefined, "Must not write a body onto a sent response");
  assert.equal(forwarded, original, "The original error must be forwarded to Express");
}

console.log("✓ error handler contract (request id, no internals, no double write)");
