import type { RequestHandler } from "express";

import { isPermissionId } from "../core/tenancy/permissions";
import { BackendModule, PermissionRule } from "./module";
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
import { veterinariaRouter } from "../modules/veterinaria";
import { guarderiaRouter } from "../modules/guarderia";
import { recordatoriosRouter } from "../modules/recordatorios";
import { platformRouter } from "../modules/platform-admin";
import { usersRouter } from "../modules/admin";
import { settingsRouter } from "../core/tenancy/settings.router";

const FINANCE_RULES: readonly PermissionRule[] = [
  { methods: "read", permission: "finanzas.read" },
  { methods: "write", permission: "finanzas.write" },
];

/**
 * Deleting the record itself (`DELETE /:id`), not a line under it: removing a vaccination or a
 * vital sign from an open visit is editing, and stays with whoever may edit.
 */
const DELETE_RECORD_RULES: readonly PermissionRule[] = [
  { methods: "delete", path: /^\/[^/]+\/?$/, permission: "registros.delete" },
];

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
    // The money figures live in a core module, so without this they would be free for every
    // user of every tenant. `/summary` mixes them with operational counts and leaves them out
    // in the handler instead.
    permissions: [{ path: "/financial", permission: "finanzas.read" }],
  },
  {
    id: "clients",
    basePath: "/clients",
    router: clientsRouter,
    description: "Shared client records",
    permissions: DELETE_RECORD_RULES,
  },
  {
    id: "pets",
    basePath: "/pets",
    router: petsRouter,
    description: "Shared pet records",
    permissions: DELETE_RECORD_RULES,
  },
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
    permissions: DELETE_RECORD_RULES,
    access: {
      roles: ["admin", "daycare", "grooming", "veterinary"],
      businessUnits: ["DAYCARE", "GROOMING", "VETERINARY"],
    },
  },
  {
    id: "recurring-plans",
    basePath: "/recurring-plans",
    router: recurringPlansRouter,
    description: "Recurring reservation plans",
    permissions: DELETE_RECORD_RULES,
    // Not VETERINARY: a clinic books visits one at a time. With three units this list now
    // constrains, where naming both of two units used to constrain nothing.
    access: { roles: ["admin", "daycare", "grooming"], businessUnits: ["DAYCARE", "GROOMING"] },
  },
  {
    id: "check-in-out",
    basePath: "/check-in-out",
    router: checkInOutRouter,
    description: "Shared attendance compatibility workflows",
    access: {
      roles: ["admin", "daycare", "grooming", "veterinary"],
      businessUnits: ["DAYCARE", "GROOMING", "VETERINARY"],
    },
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
    permissions: FINANCE_RULES,
  },
  {
    id: "rooms",
    basePath: "/rooms",
    router: roomsRouter,
    description: "Room and capacity records",
    permissions: DELETE_RECORD_RULES,
    access: {
      roles: ["admin", "daycare", "grooming", "veterinary"],
      businessUnits: ["DAYCARE", "GROOMING", "VETERINARY"],
    },
  },
  {
    id: "payables",
    basePath: "/payables",
    router: payablesRouter,
    description: "Payables and expenses",
    permissions: FINANCE_RULES,
  },
  {
    id: "incomes",
    basePath: "/incomes",
    router: incomesRouter,
    description: "Income records",
    permissions: FINANCE_RULES,
  },
  {
    id: "inventory",
    basePath: "/inventory",
    router: inventoryRouter,
    description: "Inventory records",
    permissions: [
      { methods: "read", permission: "inventario.read" },
      { methods: "write", permission: "inventario.write" },
    ],
  },
  {
    id: "reports",
    basePath: "/reports",
    router: reportsRouter,
    description: "Reports and analytics",
    // `/transport` is the day's pickup route, which the floor staff work from: not gated.
    permissions: [
      { path: "/incomes", permission: "finanzas.read" },
      { path: "/expenses", permission: "finanzas.read" },
      { path: "/kpis", permission: "finanzas.read" },
    ],
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
    permissions: DELETE_RECORD_RULES,
  },
  {
    id: "export",
    basePath: "/export",
    router: exportRouter,
    description: "Data export operations",
    permissions: [
      { permission: "datos.export" },
      { path: "/incomes", permission: "finanzas.read" },
      { path: "/expenses", permission: "finanzas.read" },
    ],
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
    permissions: [
      { methods: "delete", path: /^\/appointments\/[^/]+\/?$/, permission: "registros.delete" },
    ],
    access: { roles: ["admin", "grooming"], businessUnits: ["GROOMING"] },
  },
  {
    id: "veterinaria",
    basePath: "/veterinaria",
    router: veterinariaRouter,
    description: "Veterinary clinic operations",
    permissions: [
      { methods: "delete", path: /^\/visits\/[^/]+\/?$/, permission: "registros.delete" },
    ],
    access: { roles: ["admin", "veterinary"], businessUnits: ["VETERINARY"] },
  },
  {
    id: "reminders",
    basePath: "/reminders",
    router: recordatoriosRouter,
    description: "Reminders sent to tutors by WhatsApp and email",
    // Every unit has something to remind about, so every operational role sends. No permission
    // on top: telling a tutor about tomorrow's visit is ordinary front-desk work.
    access: {
      roles: ["admin", "daycare", "grooming", "veterinary"],
      businessUnits: ["DAYCARE", "GROOMING", "VETERINARY"],
    },
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

    for (const rule of module.permissions ?? []) {
      if (!isPermissionId(rule.permission)) {
        throw new Error(
          `Backend module '${module.id}' names an unknown permission: ${String(rule.permission)}`,
        );
      }
      if (typeof rule.path === "string" && !rule.path.startsWith("/")) {
        throw new Error(`Permission rule path must start with '/': ${module.id}`);
      }
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
