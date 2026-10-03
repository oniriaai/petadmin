import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";
import * as Sentry from "@sentry/node";
import pino from "pino";
import pinoHttp from "pino-http";

/**
 * Structured logging and error reporting.
 *
 * Supporting several client daycares from one installation means the first question about any
 * incident is "which tenant?". `console.log` lines could not answer it, and the catch-all error
 * handler printed a stack to stdout and returned a bare 500, so a customer report ("it failed
 * around 3pm") had nothing to join on. Every line here carries a request id, and every
 * authenticated line carries the tenant and user; the request id is also returned to the
 * caller on a 500, which is what makes a report traceable.
 */

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  // Pretty output is a development convenience; production emits JSON for the log pipeline.
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }),
  redact: {
    // Tokens, cookies and passwords must never be written to a log that someone else reads.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.admin.password',
    ],
    remove: true,
  },
});

declare global {
  namespace Express {
    interface Request {
      id?: string;
      log?: pino.Logger;
    }
  }
}

export const REQUEST_ID_HEADER = "x-request-id";

export const requestLogger = pinoHttp({
  logger,
  // Accept an id from the edge when there is one, so a trace spans the proxy and the API.
  genReqId(req, res) {
    const existing = req.headers[REQUEST_ID_HEADER];
    const id = (Array.isArray(existing) ? existing[0] : existing)?.trim() || randomUUID();
    res.setHeader(REQUEST_ID_HEADER, id);
    return id;
  },
  // The health probes would otherwise dominate the log at their polling interval.
  autoLogging: {
    ignore: (req) => req.url === "/api/v1/health" || req.url === "/api/v1/ready",
  },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customProps(req) {
    const user = (req as Request).user;
    if (!user) return {};
    // The tenant is the field worth filtering on; the username is here because a support
    // request names a person, not an id.
    return { daycareId: user.daycareId, userId: user.userId, username: user.username, role: user.role };
  },
  serializers: {
    req(req) {
      return { method: req.method, url: req.url };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});

/**
 * Optional error reporting.
 *
 * Installed but inert: nothing is sent anywhere until SENTRY_DSN is set, so a deployment that
 * does not want it pays nothing at runtime and a deployment that does needs no code change.
 */
type ErrorContext = Record<string, unknown>;

let reportError: (error: unknown, context: ErrorContext) => void = () => {};

export function initErrorReporting(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    logger.debug("SENTRY_DSN no definido: el reporte de errores queda inactivo");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0,
  });

  reportError = (error, context) => {
    Sentry.withScope((scope) => {
      // Tagged by tenant: "one customer or all of them?" is the first triage question.
      if (typeof context.daycareId === "string") scope.setTag("daycareId", context.daycareId);
      if (typeof context.requestId === "string") scope.setTag("requestId", context.requestId);
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  };

  logger.info("Reporte de errores activo (Sentry)");
}

/**
 * The terminal error handler.
 *
 * It used to `console.error(err)` and answer `{ message: "Error interno del servidor" }`, which
 * gave the caller nothing to quote and the operator nothing to search. The message stays
 * deliberately generic — internals are not the caller's business — but the request id is
 * returned so a user report and a log line can be joined.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = req.id ?? "unknown";
  const context = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    daycareId: req.user?.daycareId,
    userId: req.user?.userId,
  };

  (req.log ?? logger).error({ err, ...context }, "Error no controlado");
  reportError(err, context);

  // Express still routes here after the response has been sent (e.g. a stream that failed
  // mid-write); writing again would throw ERR_HTTP_HEADERS_SENT on top of the real error.
  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(500).json({ message: "Error interno del servidor", requestId });
}
