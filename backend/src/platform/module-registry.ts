import type { RequestHandler } from "express";

import { BackendModule } from "./module";
import { requireModuleAccess } from "./module-access";
import { productModuleForBackendId, validateProductModules } from "./product-modules";
import { requireAuth } from "../middleware/auth";
import { authRouter } from "../routes/auth";
import { dashboardRouter } from "../routes/dashboard";
import { clientsRouter, petsRouter } from "../core/modules";
import { reservationsRouter, recurringPlansRouter } from "../modules/reservas";
import { providersRouter } from "../routes/providers";
import { roomsRouter, checkInOutRouter } from "../modules/operaciones";
import { payablesRouter } from "../routes/payables";
import { incomesRouter } from "../routes/incomes";
import { inventoryRouter } from "../routes/inventory";
import { reportsRouter } from "../routes/reports";
import { alertsRouter } from "../routes/alerts";
import { contractsRouter } from "../routes/contracts";
import { exportRouter } from "../routes/export";
import { storageRouter } from "../routes/storage";
import { peluqueriaRouter } from "../modules/peluqueria";
import { guarderiaRouter } from "../modules/guarderia";
import { platformRouter } from "../modules/platform-admin";
import { usersRouter } from "../modules/admin";
import { settingsRouter } from "../core/tenancy/settings.router";

export const backendModules: readonly BackendModule[] = [
  // Public: mounted without requireAuth, since this is where a session comes from. Any
  // authenticated endpoint added here (e.g. GET /auth/me) must apply requireAuth itself.
  {
    id: "auth",
    basePath: "/auth",
    router: authRouter,
    description: "Authentication and session management",
    public: true,
  },
  {
    id: "dashboard",
    basePath: "/dashboard",
    router: dashboardRouter,
    description: "Cross-domain dashboard summaries",
  },
  {
    id: "clients",
    basePath: "/clients",
    router: clientsRouter,
    description: "Shared client records",
  },
  { id: "pets", basePath: "/pets", router: petsRouter, description: "Shared pet records" },
  {
    id: "storage",
    basePath: "/storage",
    router: storageRouter,
    description: "Shared object storage operations",
  },
  {
    id: "reservations",
    basePath: "/reservations",
    router: reservationsRouter,
    description: "Reservation workflows",
    access: { roles: ["admin", "daycare", "grooming"], businessUnits: ["DAYCARE", "GROOMING"] },
  },
  {
    id: "recurring-plans",
    basePath: "/recurring-plans",
    router: recurringPlansRouter,
    description: "Recurring reservation plans",
    access: { roles: ["admin", "daycare", "grooming"], businessUnits: ["DAYCARE", "GROOMING"] },
  },
  {
    id: "check-in-out",
    basePath: "/check-in-out",
    router: checkInOutRouter,
    description: "Shared attendance compatibility workflows",
    access: { roles: ["admin", "daycare", "grooming"], businessUnits: ["DAYCARE", "GROOMING"] },
  },
  {
    id: "settings",
    basePath: "/settings",
    router: settingsRouter,
    description: "Per-daycare operational settings",
    access: { roles: ["admin"] },
  },
  {
    id: "users",
    basePath: "/users",
    router: usersRouter,
    description: "Daycare-side staff administration",
    // Only a tenant admin. The two operational roles must not be able to provision accounts,
    // and `superadmin` reaches this through its own console, not here.
    access: { roles: ["admin"] },
  },
  {
    id: "providers",
    basePath: "/providers",
    router: providersRouter,
    description: "Provider records",
  },
  {
    id: "rooms",
    basePath: "/rooms",
    router: roomsRouter,
    description: "Room and capacity records",
    access: { roles: ["admin", "daycare", "grooming"], businessUnits: ["DAYCARE", "GROOMING"] },
  },
  {
    id: "payables",
    basePath: "/payables",
    router: payablesRouter,
    description: "Payables and expenses",
  },
  { id: "incomes", basePath: "/incomes", router: incomesRouter, description: "Income records" },
  {
    id: "inventory",
    basePath: "/inventory",
    router: inventoryRouter,
    description: "Inventory records",
  },
  {
    id: "reports",
    basePath: "/reports",
    router: reportsRouter,
    description: "Reports and analytics",
  },
  {
    id: "alerts",
    basePath: "/alerts",
    router: alertsRouter,
    description: "Alerts and notifications",
  },
  {
    id: "contracts",
    basePath: "/contracts",
    router: contractsRouter,
    description: "Client and pet contracts",
  },
  {
    id: "export",
    basePath: "/export",
    router: exportRouter,
    description: "Data export operations",
  },
  {
    id: "guarderia",
    basePath: "/guarderia",
    router: guarderiaRouter,
    description: "Daycare operations",
    access: { roles: ["admin", "daycare"], businessUnits: ["DAYCARE"] },
  },
  {
    id: "peluqueria",
    basePath: "/peluqueria",
    router: peluqueriaRouter,
    description: "Grooming operations",
    access: { roles: ["admin", "grooming"], businessUnits: ["GROOMING"] },
  },
  {
    id: "platform",
    basePath: "/platform",
    router: platformRouter,
    description: "Vendor platform administration",
    access: { roles: ["superadmin"] },
  },
];

export function validateBackendModules(modules: readonly BackendModule[] = backendModules): void {
  const ids = new Set<string>();
  const paths = new Set<string>();

  validateProductModules();

  for (const module of modules) {
    if (ids.has(module.id)) throw new Error(`Duplicate backend module id: ${module.id}`);
    if (paths.has(module.basePath))
      throw new Error(`Duplicate backend module path: ${module.basePath}`);
    if (!module.basePath.startsWith("/"))
      throw new Error(`Backend module path must start with '/': ${module.id}`);
    if (module.access && module.access.roles.length === 0) {
      throw new Error(`Backend module must declare at least one access role: ${module.id}`);
    }

    // Every mounted module must be governed by exactly one product module. Without this,
    // a new module would mount with no entitlement behind it and be silently free for
    // every daycare.
    if (!productModuleForBackendId(module.id)) {
      throw new Error(
        `Backend module '${module.id}' is not claimed by any product module. ` +
          `Add it to a ProductModule.backendModuleIds in platform/product-modules.ts ` +
          `(use the 'nucleo' core module if it must always be available).`,
      );
    }

    // `public` skips authentication entirely, so it is allowlisted by id rather than left
    // to whoever adds the next module.
    if (module.public && module.id !== "auth") {
      throw new Error(`Only the auth module may be public: ${module.id}`);
    }

    ids.add(module.id);
    paths.add(module.basePath);
  }
}

/**
 * The handler chain a module is mounted with. Exported so the architecture suite can assert the
 * composition without starting a server.
 *
 * The gate is a SIBLING of the router, never a wrapper: `tests/reservas-module.ts` and
 * `tests/operaciones-module.ts` compare `backendModules.find(...).router` to the imported router
 * by object identity, and more importantly a wrapper would make the registry's mounting and the
 * module's own exported router two different things.
 */
export function moduleHandlers(module: BackendModule): RequestHandler[] {
  if (module.public) return [module.router];
  return [requireAuth, requireModuleAccess(module), module.router];
}

export function registerBackendModules(
  app: { use: (path: string, ...handlers: RequestHandler[]) => unknown },
  apiPrefix = "/api/v1",
) {
  validateBackendModules();
  for (const module of backendModules) {
    app.use(`${apiPrefix}${module.basePath}`, ...moduleHandlers(module));
  }
}
