import { Prisma, PrismaClient } from "@prisma/client";

import { checkTenantScope } from "./core/tenancy/guard";
import { logger } from "./middleware/observability";

/**
 * The Prisma client, extended with the tenant-scope guard.
 *
 * The guard is a backstop, not the mechanism: routers still derive their filters from
 * `core/tenancy/scope.ts`. It exists so that forgetting to is a loud failure in development
 * and CI instead of a silent cross-tenant read. See `core/tenancy/guard.ts` for what it
 * exempts and why.
 */
const levels: Prisma.LogLevel[] =
  process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

/**
 * Off unless SLOW_QUERY_MS is set, because Prisma then emits an event for every query. With it,
 * a query that took at least that long is logged with its SQL, which is what says which index
 * is missing. The parameters are left out: they are the customers' data.
 */
const slowQueryMs = Number(process.env.SLOW_QUERY_MS ?? 0);

const base = new PrismaClient({
  log:
    slowQueryMs > 0
      ? [
          ...levels.map((level) => ({ emit: "stdout" as const, level })),
          { emit: "event", level: "query" },
        ]
      : levels,
});

if (slowQueryMs > 0) {
  (base as PrismaClient<{ log: [{ emit: "event"; level: "query" }] }>).$on("query", (event) => {
    if (event.duration < slowQueryMs) return;
    logger.warn({ durationMs: event.duration, query: event.query }, "[db] consulta lenta");
  });
}

export const prisma = base.$extends({
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        checkTenantScope(model, operation, args);
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;
