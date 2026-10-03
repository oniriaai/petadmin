import { PrismaClient } from "@prisma/client";

import { checkTenantScope } from "./core/tenancy/guard";

/**
 * The Prisma client, extended with the tenant-scope guard.
 *
 * The guard is a backstop, not the mechanism: routers still derive their filters from
 * `core/tenancy/scope.ts`. It exists so that forgetting to is a loud failure in development
 * and CI instead of a silent cross-tenant read. See `core/tenancy/guard.ts` for what it
 * exempts and why.
 */
const base = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

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
