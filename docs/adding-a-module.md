# Adding a Module

This project uses a modular monolith. A module owns its business workflow while
reusing public Core contracts for authentication, business-unit scope, clients,
pets, storage, and other shared capabilities.

## Backend checklist

1. Create `backend/src/modules/<module>/`.
2. Add the router, application services, validation schemas, and module-specific
   persistence access in that folder.
3. Export the public surface from `backend/src/modules/<module>/index.ts`.
4. Add one `BackendModule` entry to
   `backend/src/platform/module-registry.ts`, including its path, description,
   roles, and business units.
5. Do not import another module's internal files. Use Core contracts or a
   documented public module interface.
6. Add a representative workflow test and an authorization/isolation test.
7. Run:

   ```bash
   cd backend
   npm run build
   npm run test:architecture
   ```

## Frontend checklist

1. Create `frontend/src/pages/<module>/` and keep module-specific hooks,
   components, and API types close to the module.
2. Add the module routes and navigation metadata to
   `frontend/src/modules/registry.tsx`.
3. Consume shared domain operations through
   `frontend/src/modules/shared/api.ts` and shared types through
   `frontend/src/modules/shared/contracts.ts`.
4. Keep role and unit metadata in the module manifest so route protection and
   navigation filtering use the same source.
5. Add module registry and UI authorization tests.
6. Run:

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
