# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Argos Suite: a multi-tenant modular monolith for dog daycares, grooming
salons and veterinary clinics. Brand, voice and design tokens are defined in `BRAND.md`. Each customer
is a tenant (`Daycare`) with its own users, data and **purchased product modules**; the vendor
manages tenants from a platform console. A tenant runs up to three business units, `DAYCARE`
("Guardería"), `GROOMING` ("Peluquería") and `VETERINARY` ("Veterinaria").

- `backend/` — Node 20, Express 4, TypeScript, Prisma 5, PostgreSQL 16, zod.
- `frontend/` — React 18, Vite, TypeScript, Tailwind, react-router 6, vitest.
- Two independent npm projects (no root `package.json`); run commands from inside each.

User-facing strings, API error messages and most docs are in **Spanish**; code, identifiers and
code comments are in English. Keep to that split.

## Commands

### Dev stack

```bash
cp .env.example .env
docker compose up --build      # postgres + backend (:3001) + frontend (:5174) + pgAdmin (:5050)
```

The backend container runs `prisma generate`, `prisma migrate deploy`, the seed, then the server.
`docker-compose.yml` is dev-only (mounts code, seeds demo tenants on every start);
`docker-compose.prod.yml` is the production stack.

### Backend (`cd backend`)

```bash
npm run dev                 # tsx watch src/main.ts
npm run typecheck           # main + seed tsconfigs
npm run lint
npm run format:check        # prettier; `npm run format` to write
npm run build
npm run test:architecture   # no DB or server needed
npm run db:migrate          # prisma migrate deploy
npm run db:migrate:dev      # author a new migration
npm run db:seed
```

Tests are plain `tsx` scripts, not a test runner. Run one file directly:

```bash
npx tsx tests/pagination.ts            # a single architecture suite
npm run test:tenancy                   # a single e2e suite (see package.json for test:* names)
docker exec argos-backend npm run test:tenancy   # same, inside the dev container
```

E2E suites (`tests/*.e2e.ts`) speak HTTP to a running backend at `http://localhost:3001/api/v1`
(override with `API_URL`) over a database that was **migrated with `migrate deploy` and seeded with
demo data**. They log in as the seeded accounts listed in `backend/tests/README.md`.
`test:ratelimit` must run **last**: it deliberately exhausts the login limiter.

### Frontend (`cd frontend`)

```bash
npm run dev
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test                                          # vitest run
npx vitest run src/test/module-gating.test.tsx    # one file
npx vitest run -t "name of the test"              # one test
```

### What CI runs

`.github/workflows/ci.yml`: `static` (typecheck, lint, format check, architecture suite, frontend
build + tests) → `e2e` (all fifteen suites, then greps the backend log for tenant-scope violations)
and `production-image`. Before pushing, at minimum run typecheck, lint, `format:check` and
`test:architecture` in the backend, and typecheck, lint, `format:check`, build and test in the
frontend.

Prettier covers TypeScript only. Markdown and YAML are hand-wrapped — do not reflow them.

## Architecture

### Two layers of "module"

- **Backend modules** (`backend/src/platform/module-registry.ts`): resource-shaped routers, each a
  `BackendModule` with `id`, `basePath`, `router` and optional `access` (roles, business units).
- **Product modules** (`backend/src/platform/product-modules.ts`): the sellable units the console
  toggles per tenant (`nucleo`, `reservas`, `guarderia`, `peluqueria`, `veterinaria`, `finanzas`, `inventario`,
  `informes`, `cumplimiento`, `recordatorios`, plus vendor-only `plataforma`). Each grants a set of backend module
  ids and may `require` other product modules.

Every backend module must be claimed by exactly one product module. `validateBackendModules()`
**refuses to boot** otherwise, so a new router can't ship ungated.

`registerBackendModules` mounts every non-public module as
`requireAuth → requireModuleAccess(module) → router`. Consequences:

- Never add `requireAuth` inside a router. Only `auth` and `signup` are `public: true`
  (`PUBLIC_MODULE_IDS`).
- Role, business-unit, entitlement and permission checks live at the registry, not per route.
- A module the tenant hasn't bought returns **403** with `code: "MODULE_DISABLED"`.

Code layout: `src/core/` (shared domains and tenancy), `src/modules/<name>/` (business slices,
public surface exported from `index.ts`), `src/platform/` (composition only, no domain logic),
`src/routes/` (legacy routers still being migrated into modules — new code goes in `modules/`).
A module must not import another module's internals; go through Core or the module's `index.ts`.

**`docs/adding-a-module.md` is the authoritative checklist for adding or extending a module on
either side. Read it before doing so.**

### Tenancy

Every operational row belongs to a `Daycare`. Models queried directly carry `daycareId`; child rows
(vaccinations, documents, payments, inventory movements, reservation pets) inherit tenancy through
their parent.

- Derive the tenant from `backend/src/core/tenancy/scope.ts` (`buildScopeWhere`,
  `buildDaycareWhere`, `buildChildScopeWhere`, `getRequiredDaycareId`, `assertRecordAccess`) —
  **never from the request body**.
- Another tenant's record must read as **404**, not 403. Prefer
  `findFirst({ where: { id, ...buildScopeWhere(req) } })` over `findUnique` + check.
- An id from the request body is not proof of tenancy. Resolve the parent row against the tenant
  before using it as a foreign key — every cross-tenant bug found so far was a write of this shape.
- Singular `update`/`delete` can't take `daycareId` in `where`: scoped read first, then write by id.
- The Prisma client in `src/db.ts` carries a guard (`core/tenancy/guard.ts`) that **throws in dev
  and CI** (warns in production) when a tenant user's request queries an owned model without a
  tenant filter. Fix by adding the filter; `withVerifiedScope(reason, fn)` is the escape hatch for a
  parent already verified, and the callback must `await` inside it.

Scope is tenant **and** business unit: the client sends `X-Business-Unit`, and a superadmin pins a
tenant with `X-Daycare-Id` (required for superadmin writes).

### Roles

`superadmin` is the vendor: belongs to no daycare (DB CHECK `users_superadmin_untenanted`), passes
the module gate before the role check, and is never assignable by a tenant
(`ASSIGNABLE_TENANT_ROLES`). Never list it in a module's `access.roles`. Tenant roles are `admin`
(every unit), `daycare`, `grooming` and `veterinary`. Usernames are unique per tenant, not globally.

### Permissions

A role opens modules; a permission says what one staff member may do inside them. The catalog is
fixed in `backend/src/core/tenancy/permissions.ts` (`finanzas.read`/`.write`,
`inventario.read`/`.write`, `datos.export`, `registros.delete`) and each user row carries the list
it was granted (`users.permissions`). `admin` and `superadmin` hold all of them implicitly; a new
staff user starts with `DEFAULT_STAFF_PERMISSIONS` (inventory read-only).

- Declare them as `permissions` rules on the `BackendModule` (by verb and by path inside the
  module), not inside the router. The gate checks them **after** the entitlement, so an unsold
  module still answers `MODULE_DISABLED`; a missing permission is **403** `PERMISSION_DENIED`.
- `hasPermission(req, id)` is only for a handler that returns a mixed payload and must leave a
  field out (`/dashboard/summary` and its income figures).
- Work that writes money or stock as a side effect (closing a stay, dispensing a prescription)
  does not go through the finance or inventory API and must not be gated by their permissions.
- `requireAuth` reads role and permissions live, so a grant, a revocation or a role change bites
  on the next request; a token whose role no longer matches the row is refused with 401.
- The frontend mirrors the catalog in `src/modules/shared/contracts.ts`. Routes and nav items
  declare `permissions`; a control inside a page is gated with `can(id)` from `useAuth()`.

### Caches that must be invalidated

- Writing entitlements → `invalidate(daycareId)` from `platform/module-access.ts`.
- Deactivating a user or daycare, or changing a user's role or permissions →
  `invalidatePrincipal` / `invalidatePrincipalsForDaycare` from `core/tenancy/principal.ts`. `requireAuth` re-reads account state per request, so suspension
  bites on the next request (`403` `USER_INACTIVE` / `DAYCARE_INACTIVE`).

### Route handler conventions

- Every async handler needs its own `try/catch` ending in `handleAuthzError(res, error)`. Express 4
  does not catch rejected async handlers; an uncaught one takes the process down.
- List endpoints use `readPage`/`sendPage` from `src/utils/pagination.ts`. With no pagination
  params they return the bare (capped) array, because several forms fill a `<select>` from them.
  Don't paginate a handler that filters in JS after the query.
- Unhandled errors respond `500` with the `requestId` and never the error text.
- "Today" and "that day" are the unit's, not the server's (which runs in UTC). Use
  `localDayBoundsUtc` from `core/tenancy/local-time.ts` with `getUnitTimezone`, not
  `setHours(0, 0, 0, 0)`.
- A stored file reference (`photoUrl`, a document's `filePath`) authorizes deleting the object
  behind it. Validate it against the tenant's prefix with `core/storage/object-keys.ts` before
  writing it.
- Charges generated when a stay or appointment closes are always recorded, even when the tenant
  lacks `finanzas` — only the finance API/UI is gated.

### Database and migrations

Versioned history under `backend/prisma/migrations/`, applied with `prisma migrate deploy`. Do not
use `db push` on anything but a throwaway database (`/api/v1/health` returns 503 while migrations
are pending, and a pushed DB has no migration record). `prisma/legacy-migrations/` is kept for
provenance only — never move those files back.

Changes that must preserve rows (new required column, renamed stored value) are hand-authored so
the backfill sits between adding the column and making it `NOT NULL`. There is intentionally no
`prisma migrate diff` drift check: the partial unique index in `per_tenant_usernames` can't be
expressed in `schema.prisma`.

The seed provisions two tenants on purpose: `principal` (everything enabled) and `demo` (grooming
only, most modules off, no clients). Tests in `test:tenancy` count what `demo` owns, so a suite
that touches a seeded tenant must undo it.

The recurring-plans generator runs in-process only in dev (`RUN_SCHEDULER_IN_PROCESS`); in
production it is a scheduled job (`npm run job:recurring-plans`), idempotent on
`(recurringPlanId, checkIn)`.

### Reminders to tutors

`modules/recordatorios` sends reminders by WhatsApp (Meta Cloud API) and email (SMTP) through
`core/messaging`, which is transport only. `docs/recordatorios.md` has the rules.

- What is due is **computed, never queued** (`due.service.ts`); the send re-derives the item from
  its `sourceKey` under the caller's tenant and units. The recipient always comes from the
  tutor's record, never from the request.
- The copy lives in `templates.ts` and is the text registered as WhatsApp templates at Meta.
  Changing a body means changing the template there too; keep `docs/recordatorios.md` in step
  (`tests/reminders-module.ts` checks it).
- The automatic pass (`npm run job:reminders`, hourly in production) is idempotent on
  `(daycareId, dedupeKey)` and off per unit until an admin turns it on.
- Outside production a channel with no credentials is **simulated** (logged, recorded as sent).
  `test:reminders` refuses to run against a backend with a live channel.

### Self-service signup and subscriptions

`modules/suscripciones` lets a business sign up from the public page, paying through PayPhone
(`core/payments`, transport only) or starting a trial. `docs/suscripciones.md` has the rules.

- A plan (`plans.ts`) is a price plus a preset of units and product modules. The amount is always
  computed on the server; `tests/billing-plans.ts` pins the prices.
- Nothing is provisioned until PayPhone confirms the charge to the server, or the trial's email
  is verified. Daycare, admin and subscription are created in one transaction.
- A daycare with no `Subscription` row is vendor-managed and is never billed or suspended.
- A lapsed subscription is `SUSPENDED`, **not** `Daycare.isActive = false`: the session stays
  valid and the gate answers **402** `SUBSCRIPTION_INACTIVE` for every module except `billing`.
  The flag rides on the principal status, so writing it needs `invalidatePrincipalsForDaycare`.
- The scheduled pass (`npm run job:billing`, hourly in production) claims every charge and
  notice in the database first, so overlapping runs charge nobody twice.
- Outside production a gateway with no credentials is **simulated**. `test:signup` refuses to
  run against a real one.

### Frontend

- The landing (`pages/Landing.tsx`) and the signup (`pages/signup/`) are their own chunks, chosen
  in `main.tsx` before the application loads. They import nothing from the session or the
  router; shared plan code lives in `lib/billing.ts` and `components/billing/`.
- `src/modules/registry.tsx` is the single source for routes and navigation. Each route and nav
  item declares `roles`, `unit` and `requires` (product module ids, AND semantics). Derive
  `requires` from the endpoints the page actually calls, not the section it sits under. A route
  without `requires` claims to be free for every tenant; `src/test/module-gating.test.tsx` pins
  that list explicitly.
- `src/modules/shared/contracts.ts` holds shared types and `PRODUCT_MODULE_IDS` — add a new
  (non-`platformOnly`) product module there too. `src/modules/shared/api.ts` holds shared domain
  calls.
- A product module with no page of its own is gated in place with `hasModule(id)` from `useAuth()`.
- `src/lib/api.ts` attaches `X-Business-Unit` and `X-Daycare-Id`; `src/pages/platform/` is the
  lazily loaded vendor console.

### Tests to add with a new module

A workflow test, an authorization test, and a cross-tenant isolation test in
`backend/tests/tenant-isolation.e2e.ts` covering **writes as well as reads**. If the module
declares permission rules, pin them in `backend/tests/permissions.ts`. On the frontend, a
test that the nav item disappears when its product module is absent.

## Further reading

- `README.md` — product overview, production deployment, required env vars, seeded credentials.
- `backend/README.md` — API and endpoints. `backend/tests/README.md` — what each suite pins.
- `docs/alcance.md`, `docs/functional-design.md` — functional scope and flows.
- `docs/recordatorios.md` — reminders to tutors: rules, requirements, setup and the WhatsApp
  templates to register.
- `docs/suscripciones.md` — self-service signup, plans, renewals and the PayPhone setup.
- `PRODUCT.md` — product and design context for UI work.
