# Adding a Module

This project uses a modular monolith. A module owns its business workflow while
reusing public Core contracts for authentication, tenancy, business-unit scope,
clients, pets, storage, and other shared capabilities.

The system is multi-tenant: every operational row belongs to a `Daycare`, and every
backend module is governed by a **product module** that a daycare either bought or
did not. Both are enforced at the registry, so wiring a module in correctly is what
makes it scoped and gated — there is nothing to remember per route.

## Backend checklist

1. Create `backend/src/modules/<module>/`.
2. Add the router, application services, validation schemas, and module-specific
   persistence access in that folder.
3. Export the public surface from `backend/src/modules/<module>/index.ts`.
4. Add one `BackendModule` entry to
   `backend/src/platform/module-registry.ts`, including its path, description,
   roles, and business units.
5. **Claim the module in the product catalog.** Add its id to a `ProductModule`'s
   `backendModuleIds` in `backend/src/platform/product-modules.ts` — either an
   existing sellable module, or `nucleo` if it must be available to every daycare
   regardless of what they bought. This is not optional: `validateBackendModules()`
   refuses to boot when a mounted module belongs to no product module, precisely so
   a new module cannot ship ungated.

   Decide by what the module *is*, not by which page uses it. Rooms, attendance and
   recurring plans live in `reservas` rather than `guarderia` because grooming
   reservations occupy rooms and record check-in/out too; putting them under
   `guarderia` left a grooming-only tenant unable to list its own rooms.

   If you add a new `ProductModule`, also add its id to `PRODUCT_MODULE_IDS` in
   `frontend/src/modules/shared/contracts.ts` — unless it is `platformOnly`, which no
   tenant can hold and which therefore never appears in a session's `enabledModules`.
6. **Do not add `requireAuth` to the router.** The registry mounts
   `requireAuth → requireModuleAccess(module) → router` for every non-public module;
   a second copy in the router would verify the same JWT twice and imply that
   authentication lives somewhere it no longer does.
7. **Scope every query.** Derive the tenant from `backend/src/core/tenancy/scope.ts`
   (`buildScopeWhere`, `buildDaycareWhere`, `getRequiredDaycareId`,
   `assertRecordAccess`), never from the request body. Prefer
   `findFirst({ where: { id, ...buildScopeWhere(req) } })` over `findUnique` plus a
   check: a row from another tenant must read as **absent** (404), not forbidden.
   A model with no `daycareId` of its own inherits tenancy through its parent —
   use `buildChildScopeWhere(req, relation)`.

   This is now **enforced**, not merely expected. The Prisma client in `db.ts`
   carries the guard in `backend/src/core/tenancy/guard.ts`, which throws in
   development and CI when a query inside a tenant user's request touches an owned
   model without a tenant filter. If it fires, the fix is almost always to add the
   filter rather than to reach for an exemption.

   Two things it deliberately does not catch, so do not rely on it for them:

   - **Singular `update`/`delete`.** Prisma requires their `where` to select a unique
     row, so `daycareId` cannot legally go in one. Scope the read, then write by id.
   - **An id taken from the request body.** A foreign key is not proof of tenancy on
     an owned model: `{ id: { in: petIds }, clientId }` with a body-supplied
     `clientId` is exactly the query that let one tenant book against another's
     client. Resolve the parent against the tenant first.

   For a query scoped through a parent row you have *already* verified, use
   `withVerifiedScope(reason, fn)` and say why it is safe. Note it must `await`
   inside the callback — a Prisma promise is lazy, so returning it unawaited runs the
   query back inside the request context.
8. Do not import another module's internal files. Use Core contracts or a
   documented public module interface.
9. Add a representative workflow test, an authorization test, and a **cross-tenant
   isolation test** in `backend/tests/tenant-isolation.e2e.ts`. Inherited tenancy is
   an invariant, not a schema constraint, so it only holds if something asserts it.

   Write the isolation test for **writes** as well as reads. Every cross-tenant
   defect found so far was a write that accepted an id from the request body and
   validated it against something other than the tenant, and a read-only test would
   have passed for all of them.

   A module with no e2e coverage is a module the guard never sees: the unscoped
   `GET /export/clients` existed for as long as it did because nothing called it.
10. **Bound any list endpoint.** Use `readPage`/`sendPage` from
    `backend/src/utils/pagination.ts` so the response is capped. Keep the bare array
    when no pagination is requested — some callers fill a `<select>` from these, and
    a silently truncated picker is worse than a slow query. If the handler filters
    results in JS after the query, do not paginate it: the page would be short and
    the total would disagree with it.
11. Run:

    ```bash
    cd backend
    npm run build
    npm run test:architecture
    npm run test:tenancy
    ```

## Frontend checklist

1. Create `frontend/src/pages/<module>/` and keep module-specific hooks,
   components, and API types close to the module.
2. Add the module routes and navigation metadata to
   `frontend/src/modules/registry.tsx`.
3. **Declare `requires` on every route and navigation item** whose page calls an API
   outside the core. The value is the product module id owning that API, and the
   semantics are AND — list all of them. Derive it from the endpoints the page
   actually calls, not from the section it appears under: `/transporte` sits in the
   Guardería group but reads `/reports/transport`, so it requires
   `["guarderia", "informes"]`.

   A route with no `requires` is claiming to be free for every daycare.
   `module-gating.test.tsx` pins that list to an explicit array, so adding a route
   without the field fails the suite rather than silently making it free.
4. If the product module has **no page of its own** — its surface is a tab, a panel
   or a single control — gate it in place with `hasModule(id)` from `useAuth()`, and
   make sure the UI gives way if the module is switched off mid-session.
5. Consume shared domain operations through
   `frontend/src/modules/shared/api.ts` and shared types through
   `frontend/src/modules/shared/contracts.ts`.
6. Keep role and unit metadata in the module manifest so route protection and
   navigation filtering use the same source.
7. Add module registry and UI authorization tests, including one that the navigation
   item disappears when its product module is absent.
8. Run:

   ```bash
   cd frontend
   npm run build
   npm test -- --run
   ```

## Boundary rules

- `platform` composes modules; it should not contain domain behavior.
- `core` contains shared capabilities and public contracts.
- A module may depend on Core and shared platform utilities.
- A module must not reach into another module's router, service, or Prisma
  implementation.
- During migration, a module may expose a temporary adapter around a legacy
  implementation, but new code must depend on the module adapter rather than
  importing the legacy path directly.
- Schedulers and background jobs belong to the module that owns the workflow;
  the application bootstrap may invoke their public lifecycle export.
- New endpoint paths should be registered through the backend module registry.
- New frontend routes and navigation items should be registered through the
  frontend module registry.
- Only the `auth` module may be `public: true`; everything else is mounted behind
  authentication and the entitlement gate.
- `superadmin` is the vendor role and belongs to no daycare. Never add it to a
  module's `access.roles` — the gate lets it through before the role check — and
  never make it assignable: `ASSIGNABLE_TENANT_ROLES` is the only allowlist, and the
  `users_superadmin_untenanted` CHECK constraint backs it in the database.
- Anything that writes entitlements must call `invalidate(daycareId)` from
  `backend/src/platform/module-access.ts`, or the change waits out the 30s cache.
- Anything that deactivates a user or a daycare must call `invalidatePrincipal` /
  `invalidatePrincipalsForDaycare` from `backend/src/core/tenancy/principal.ts`, or
  the suspension waits out that cache instead of biting on the next request.
- Every async route handler needs its own `try/catch` ending in
  `handleAuthzError(res, error)`. Express 4 does not handle a rejected async
  handler: `GET /export/clients` had no catch, so a throw inside it became an
  unhandled rejection and took the process down.
