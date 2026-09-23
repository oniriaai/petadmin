import { BackendModule } from "./module";
import { authRouter } from "../routes/auth";
import { dashboardRouter } from "../routes/dashboard";
import { clientsRouter, petsRouter } from "../core/modules";
import { reservationsRouter, recurringPlansRouter } from "../modules/reservas";
import { providersRouter } from "../routes/providers";
import { roomsRouter } from "../routes/rooms";
import { payablesRouter } from "../routes/payables";
import { incomesRouter } from "../routes/incomes";
import { inventoryRouter } from "../routes/inventory";
import { reportsRouter } from "../routes/reports";
import { alertsRouter } from "../routes/alerts";
import { contractsRouter } from "../routes/contracts";
import { exportRouter } from "../routes/export";
import { checkInOutRouter } from "../routes/check-in-out";
import { storageRouter } from "../routes/storage";
import { peluqueriaRouter } from "../modules/peluqueria";
import { guarderiaRouter } from "../modules/guarderia";

export const backendModules: readonly BackendModule[] = [
  { id: "auth", basePath: "/auth", router: authRouter, description: "Authentication and session management" },
  { id: "dashboard", basePath: "/dashboard", router: dashboardRouter, description: "Cross-domain dashboard summaries" },
  { id: "clients", basePath: "/clients", router: clientsRouter, description: "Shared client records" },
  { id: "pets", basePath: "/pets", router: petsRouter, description: "Shared pet records" },
  { id: "storage", basePath: "/storage", router: storageRouter, description: "Shared object storage operations" },
  {
    id: "reservations",
    basePath: "/reservations",
    router: reservationsRouter,
    description: "Reservation workflows",
    access: { roles: ["admin", "kinderdog", "pethijos"], businessUnits: ["KINDERDOG", "PETHIJOS"] },
  },
  {
    id: "recurring-plans",
    basePath: "/recurring-plans",
    router: recurringPlansRouter,
    description: "Recurring reservation plans",
    access: { roles: ["admin", "kinderdog", "pethijos"], businessUnits: ["KINDERDOG", "PETHIJOS"] },
  },
  { id: "check-in-out", basePath: "/check-in-out", router: checkInOutRouter, description: "Shared attendance compatibility workflows" },
  { id: "providers", basePath: "/providers", router: providersRouter, description: "Provider records" },
  { id: "rooms", basePath: "/rooms", router: roomsRouter, description: "Room and capacity records" },
  { id: "payables", basePath: "/payables", router: payablesRouter, description: "Payables and expenses" },
  { id: "incomes", basePath: "/incomes", router: incomesRouter, description: "Income records" },
  { id: "inventory", basePath: "/inventory", router: inventoryRouter, description: "Inventory records" },
  { id: "reports", basePath: "/reports", router: reportsRouter, description: "Reports and analytics" },
  { id: "alerts", basePath: "/alerts", router: alertsRouter, description: "Alerts and notifications" },
  { id: "contracts", basePath: "/contracts", router: contractsRouter, description: "Client and pet contracts" },
  { id: "export", basePath: "/export", router: exportRouter, description: "Data export operations" },
  {
    id: "guarderia",
    basePath: "/guarderia",
    router: guarderiaRouter,
    description: "Daycare operations",
    access: { roles: ["admin", "kinderdog"], businessUnits: ["KINDERDOG"] },
  },
  {
    id: "peluqueria",
    basePath: "/peluqueria",
    router: peluqueriaRouter,
    description: "Grooming operations",
    access: { roles: ["admin", "pethijos"], businessUnits: ["PETHIJOS"] },
  },
];

export function validateBackendModules(modules: readonly BackendModule[] = backendModules): void {
  const ids = new Set<string>();
  const paths = new Set<string>();

  for (const module of modules) {
    if (ids.has(module.id)) throw new Error(`Duplicate backend module id: ${module.id}`);
    if (paths.has(module.basePath)) throw new Error(`Duplicate backend module path: ${module.basePath}`);
    if (!module.basePath.startsWith("/")) throw new Error(`Backend module path must start with '/': ${module.id}`);
    if (module.access && module.access.roles.length === 0) {
      throw new Error(`Backend module must declare at least one access role: ${module.id}`);
    }
    ids.add(module.id);
    paths.add(module.basePath);
  }
}

export function registerBackendModules(
  app: { use: (path: string, router: BackendModule["router"]) => unknown },
  apiPrefix = "/api/v1",
) {
  validateBackendModules();
  for (const module of backendModules) {
    app.use(`${apiPrefix}${module.basePath}`, module.router);
  }
}
