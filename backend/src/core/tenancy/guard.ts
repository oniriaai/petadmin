import { AsyncLocalStorage } from "node:async_hooks";

import type { NextFunction, Request, Response } from "express";

/**
 * A second net under tenant isolation.
 *
 * Isolation here is enforced entirely in application code: every router derives its filter
 * from `scope.ts`. That is disciplined and it is tested, but it has no backstop — one future
 * router that forgets `buildScopeWhere` leaks another daycare's records with nothing to catch
 * it. Postgres row-level security would be the real floor; Prisma makes that awkward, so this
 * is the cheap middle ground.
 *
 * The rule: inside an HTTP request made by a TENANT user, a query against a tenant-owned model
 * must carry a tenant filter. Three cases are deliberately exempt, because each is legitimately
 * cross-tenant:
 *
 *   - no request context at all — the recurring-plans job, the seed, scripts;
 *   - a `superadmin`, whose unpinned reads are meant to span every tenant (`{ mode: "all" }`);
 *   - the models that have no tenant of their own (`Daycare` itself, the audit log).
 *
 * It throws in development and CI, where a mistake should be loud, and only warns in
 * production, where a false positive must not take a customer's screen down. The point is to
 * fail the test suite, not to add a new way for the product to break.
 */

interface RequestContext {
  role: string | undefined;
  daycareId: string | null | undefined;
  path: string;
}

const store = new AsyncLocalStorage<RequestContext>();

/**
 * Runs a query that is scoped through a row whose tenant was already verified.
 *
 * The honest case for this is a loop over records fetched with a tenant filter, querying a
 * child by the parent's id: `room.id` came from a tenant-scoped `findMany`, so counting
 * check-ins in that room cannot cross tenants, but the guard cannot see that from the `where`.
 *
 * It takes a reason because the alternative — accepting any foreign key as proof of scoping —
 * would have accepted the exact query that let one tenant book an appointment against
 * another's client. A caller has to state why it is safe.
 */
export async function withVerifiedScope<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  void reason;
  // The await must happen INSIDE `exit`. A Prisma call returns a lazy PrismaPromise that does
  // not run until it is awaited, so `store.exit(() => prisma.x.count(...))` returned the
  // promise from the exited context and then executed it back inside the request's context,
  // where the guard fired anyway.
  return store.exit(async () => await fn());
}

/** Establishes the per-request context the guard reads. Mounted before the routers. */
export function tenantGuardContext(req: Request, _res: Response, next: NextFunction): void {
  // requireAuth has not run yet at this point, so the user is read lazily through a getter on
  // the same request object rather than copied.
  store.run(
    {
      get role() {
        return req.user?.role;
      },
      get daycareId() {
        return req.user?.daycareId;
      },
      path: req.originalUrl,
    } as RequestContext,
    () => next(),
  );
}

/**
 * Models that carry their own `daycareId`. A query against one of these from a tenant request
 * must filter on it.
 */
const TENANT_OWNED = new Set([
  "Client",
  "Pet",
  "Provider",
  "Veterinarian",
  "Room",
  "RecurringPlan",
  "BusinessUnitSetting",
  "Reservation",
  "CheckInOut",
  "Income",
  "Payable",
  "InventoryItem",
  "Alert",
  "Contract",
  "VetService",
  "VetVisit",
  "VetVitals",
  "VetDiagnosis",
  "VetVisitCharge",
  "VetPreventive",
  "VetPrescription",
  "VetPrescriptionItem",
  "VetHospitalization",
  "VetTreatmentOrder",
  "VetTreatmentAdministration",
  "VetProcedure",
  "VetLabOrder",
  "VetLabResultValue",
  "VetConsent",
  "ReminderMessage",
  "Subscription",
  "SubscriptionPayment",
]);

/**
 * Models that inherit tenancy through a parent relation, mapped to the relation that carries
 * it and that relation's scalar foreign key.
 *
 * Either form counts as scoped: `{ payable: { daycareId } }`, which is what
 * `buildChildScopeWhere` builds, and `{ payableId: <id> }`, which is the pattern used after
 * the parent has been fetched tenant-scoped and passed `assertRecordAccess`.
 *
 * Accepting the bare foreign key here, but NOT on a tenant-owned model, is the deliberate
 * line. A child row is only ever reachable through its parent, so the parent's id is the
 * scoping fact. A tenant-owned model is different: accepting any foreign key there would have
 * accepted `{ id: { in: petIds }, clientId }` with a clientId straight from the request body —
 * the query that let one tenant book an appointment against another's client.
 */
const TENANT_VIA_PARENT: Record<string, { relation: string; foreignKey: string }> = {
  PetVaccination: { relation: "pet", foreignKey: "petId" },
  PetDocument: { relation: "pet", foreignKey: "petId" },
  ReservationPet: { relation: "reservation", foreignKey: "reservationId" },
  Payment: { relation: "payable", foreignKey: "payableId" },
  InventoryMovement: { relation: "item", foreignKey: "itemId" },
};

/**
 * Operations that need a tenant filter.
 *
 * Singular `update`/`delete` are deliberately absent. Prisma requires their `where` to select
 * a unique row, so `daycareId` cannot legally be added to one, and the pattern this codebase
 * uses instead is a tenant-scoped `findFirst` followed by `assertRecordAccess` and then a
 * write by id. Guarding them would flag every correct write in the product. The reads and the
 * bulk writes are where a forgotten filter actually leaks or corrupts rows.
 *
 * `create` has no `where` at all, and `upsert`'s is unique for the same reason as `update`.
 */
const GUARDED_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "updateMany",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

/** Keys that scope a query: `daycareId`, or for a child model its parent relation / FK. */
function scopingKeys(parent: { relation: string; foreignKey: string } | undefined): string[] {
  return parent ? ["daycareId", parent.relation, parent.foreignKey] : ["daycareId"];
}

/** Whether a scoping key appears anywhere in a where clause. */
function hasTenantFilter(
  where: unknown,
  parent: { relation: string; foreignKey: string } | undefined,
  depth = 0,
): boolean {
  if (depth > 8 || where === null || typeof where !== "object") return false;

  if (Array.isArray(where)) {
    // Inside AND/OR/NOT: every branch must be scoped, or an unscoped branch widens the result.
    return where.length > 0 && where.every((entry) => hasTenantFilter(entry, parent, depth + 1));
  }

  const record = where as Record<string, unknown>;
  for (const key of scopingKeys(parent)) {
    if (key in record) return true;
  }

  // A nested relation filter that scopes by tenant counts, e.g. { pet: { daycareId } }.
  for (const [key, value] of Object.entries(record)) {
    if (key === "OR" || key === "AND" || key === "NOT") {
      if (hasTenantFilter(value, parent, depth + 1)) return true;
      continue;
    }
    if (value !== null && typeof value === "object" && hasTenantFilter(value, parent, depth + 1)) {
      return true;
    }
  }
  return false;
}

export class TenantScopeError extends Error {
  constructor(model: string, operation: string, path: string) {
    super(
      `Consulta sin ámbito de inquilino: ${model}.${operation} en ${path}. ` +
        `Usa buildScopeWhere/buildDaycareWhere/buildChildScopeWhere de core/tenancy/scope.ts. ` +
        `Si la consulta debe cruzar inquilinos a propósito, hazla fuera del contexto de una ` +
        `petición o a través de los servicios de platform-admin.`,
    );
    this.name = "TenantScopeError";
  }
}

export interface GuardViolation {
  model: string;
  operation: string;
  path: string;
}

/** Violations seen in this process. Read by the e2e suite to assert the guard is live. */
const violations: GuardViolation[] = [];

export function recordedViolations(): readonly GuardViolation[] {
  return violations;
}

const enforce = process.env.NODE_ENV !== "production";

export function checkTenantScope(
  model: string | undefined,
  operation: string,
  args: unknown,
): void {
  if (!model) return;
  if (!GUARDED_OPERATIONS.has(operation)) return;

  const owned = TENANT_OWNED.has(model);
  const parent = TENANT_VIA_PARENT[model];
  if (!owned && !parent) return;

  const context = store.getStore();
  // Background work (scheduler, seed, scripts) is intentionally cross-tenant.
  if (!context) return;
  // A superadmin without a pinned tenant is meant to span all of them.
  if (context.role === "superadmin") return;
  // Before requireAuth has attached a user there is nothing tenant-scoped to do.
  if (!context.role) return;

  const where = (args as { where?: unknown } | undefined)?.where;
  if (hasTenantFilter(where, parent)) return;

  const violation = { model, operation, path: context.path };
  violations.push(violation);

  if (enforce) throw new TenantScopeError(model, operation, context.path);

  // In production the query still runs: a false positive here would take a working screen
  // down, which is a worse outcome than the risk this is insuring against.
  console.error(
    `[tenant-guard] consulta sin ámbito de inquilino: ${model}.${operation} en ${context.path}`,
  );
}
