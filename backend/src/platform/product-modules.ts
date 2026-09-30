/**
 * The product-module catalog: the sellable units the platform console toggles per daycare.
 *
 * A product module is NOT a backend module. Backend modules (see `module-registry.ts`) are
 * resource-shaped and there are 19 of them, which is too granular to put in front of whoever
 * is selling this. Each product module grants a set of backend module ids instead.
 *
 * Every backend module id must be claimed by exactly one product module, or be part of the
 * `core` one. `validateBackendModules()` asserts that, so adding a backend module without
 * deciding where it belongs fails the architecture suite rather than shipping ungated.
 */

export interface ProductModule {
  id: string;
  /** Spanish label shown in the console and to daycare users. */
  label: string;
  description: string;
  backendModuleIds: readonly string[];
  /** Core modules are always mounted and cannot be toggled off. */
  core?: true;
  /** Platform-only modules are superadmin surface and never appear in a daycare's matrix. */
  platformOnly?: true;
  /** Other product modules that must be enabled for this one to function. */
  requires?: readonly string[];
}

export const PRODUCT_MODULES: readonly ProductModule[] = [
  {
    id: "nucleo",
    label: "Núcleo",
    description:
      "Autenticación, dashboard, ajustes de la guardería y los registros compartidos de tutores y perrhijos.",
    backendModuleIds: ["auth", "dashboard", "clients", "pets", "storage", "settings"],
    core: true,
  },
  {
    id: "reservas",
    label: "Reservas y Agenda",
    description:
      "Reservas, salas, asistencia y planes recurrentes. Estos son primitivos compartidos: las " +
      "reservas de peluquería también ocupan sala y registran entrada/salida, así que una " +
      "guardería que solo compró Peluquería los necesita igual.",
    backendModuleIds: ["reservations", "rooms", "check-in-out", "recurring-plans"],
  },
  {
    id: "guarderia",
    label: "Guardería",
    description:
      "Semáforo de cupos en vivo por sala, control de aforo en el check-in y rutas de transporte del día.",
    backendModuleIds: ["guarderia"],
    requires: ["reservas"],
  },
  {
    id: "peluqueria",
    label: "Peluquería",
    description: "Catálogo de servicios, agenda por franja horaria y tablero de flujo de atención.",
    backendModuleIds: ["peluqueria"],
    requires: ["reservas"],
  },
  {
    id: "finanzas",
    label: "Gestión Financiera",
    description:
      "Cobros, cuentas por pagar y proveedores, con atribución contable independiente por unidad. " +
      "Los cobros generados al cerrar una estancia o una cita se registran siempre, incluso con este " +
      "módulo deshabilitado: lo que se restringe es el acceso a la API y a la interfaz financiera.",
    backendModuleIds: ["incomes", "payables", "providers"],
  },
  {
    id: "inventario",
    label: "Inventario",
    description: "Artículos, niveles de stock con aviso de mínimo y movimientos de entrada, salida y ajuste.",
    backendModuleIds: ["inventory"],
  },
  {
    id: "informes",
    label: "Informes y Exportación",
    description: "Informes, gráficos y exportación a Excel.",
    backendModuleIds: ["reports", "export"],
  },
  {
    id: "cumplimiento",
    label: "Contratos y Alertas",
    description:
      "Contratos de estancia por tutor y perrhijo, y alertas operativas y sanitarias. Ambos viven en la pantalla de Herramientas.",
    backendModuleIds: ["contracts", "alerts"],
  },
  {
    id: "plataforma",
    label: "Consola de Plataforma",
    description:
      "Administración del proveedor: alta de guarderías, entitlements y usuarios. " +
      "No se vende ni se habilita a ninguna guardería; solo el rol superadmin la alcanza.",
    backendModuleIds: ["platform"],
    platformOnly: true,
  },
];

/** Product modules a daycare can be sold — excludes core and platform-only. */
export const TOGGLEABLE_PRODUCT_MODULES: readonly ProductModule[] = PRODUCT_MODULES.filter(
  (m) => !m.core && !m.platformOnly,
);

/** Enabled by default when the console creates a daycare, subject to its purchased units. */
export const DEFAULT_ENABLED_PRODUCT_MODULES: readonly string[] = ["reservas", "finanzas", "informes"];

const byId = new Map(PRODUCT_MODULES.map((m) => [m.id, m]));
const byBackendId = new Map<string, ProductModule>();
for (const productModule of PRODUCT_MODULES) {
  for (const backendId of productModule.backendModuleIds) {
    byBackendId.set(backendId, productModule);
  }
}

export function getProductModule(id: string): ProductModule | undefined {
  return byId.get(id);
}

/** The product module that governs a backend module, or undefined if nothing claims it. */
export function productModuleForBackendId(backendModuleId: string): ProductModule | undefined {
  return byBackendId.get(backendModuleId);
}

/** Expands a set of enabled product module ids into the backend module ids they grant. */
export function backendModuleIdsFor(productModuleIds: Iterable<string>): Set<string> {
  const granted = new Set<string>();
  for (const productModule of PRODUCT_MODULES) {
    if (productModule.core) {
      for (const id of productModule.backendModuleIds) granted.add(id);
    }
  }
  for (const id of productModuleIds) {
    const productModule = byId.get(id);
    if (!productModule) continue;
    for (const backendId of productModule.backendModuleIds) granted.add(backendId);
  }
  return granted;
}

/**
 * Structural checks on the catalog itself. Called from `validateBackendModules()` so it runs
 * at boot and in the architecture suite.
 */
export function validateProductModules(modules: readonly ProductModule[] = PRODUCT_MODULES): void {
  const ids = new Set<string>();
  const claimed = new Map<string, string>();

  for (const productModule of modules) {
    if (ids.has(productModule.id)) {
      throw new Error(`Duplicate product module id: ${productModule.id}`);
    }
    ids.add(productModule.id);

    if (productModule.backendModuleIds.length === 0) {
      throw new Error(`Product module must grant at least one backend module: ${productModule.id}`);
    }

    for (const backendId of productModule.backendModuleIds) {
      const owner = claimed.get(backendId);
      if (owner) {
        throw new Error(
          `Backend module '${backendId}' is claimed by both '${owner}' and '${productModule.id}'`,
        );
      }
      claimed.set(backendId, productModule.id);
    }
  }

  for (const productModule of modules) {
    for (const required of productModule.requires ?? []) {
      if (!ids.has(required)) {
        throw new Error(`Product module '${productModule.id}' requires unknown module '${required}'`);
      }
      if (required === productModule.id) {
        throw new Error(`Product module '${productModule.id}' cannot require itself`);
      }
    }
  }

  // A dependency cycle would make the console's matrix unsatisfiable. Resolve against the
  // modules passed in, not the shipped catalog, so this validates whatever it is handed.
  const local = new Map(modules.map((m) => [m.id, m]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string, path: string[]): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Product module dependency cycle: ${[...path, id].join(" -> ")}`);
    }
    visiting.add(id);
    for (const required of local.get(id)?.requires ?? []) visit(required, [...path, id]);
    visiting.delete(id);
    done.add(id);
  };
  for (const productModule of modules) visit(productModule.id, []);
}
