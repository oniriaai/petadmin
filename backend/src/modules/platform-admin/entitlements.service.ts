import { prisma } from "../../db";
import { AuthzError } from "../../middleware/auth";
import { invalidate } from "../../platform/module-access";
import {
  DEFAULT_ENABLED_PRODUCT_MODULES,
  TOGGLEABLE_PRODUCT_MODULES,
  getProductModule,
} from "../../platform/product-modules";

export interface EntitlementView {
  moduleId: string;
  label: string;
  description: string;
  isEnabled: boolean;
  requires: readonly string[];
  updatedAt: Date | null;
}

/**
 * The console's toggle matrix for one daycare: every sellable module, enabled or not, whether or
 * not a row exists for it. A missing row means "not sold", so the matrix is built from the
 * catalog and filled in from the database rather than the other way round — otherwise a module
 * added to the catalog after a daycare was created would be invisible in its console.
 */
export async function getEntitlementMatrix(daycareId: string): Promise<EntitlementView[]> {
  const rows = await prisma.daycareModule.findMany({
    where: { daycareId },
    select: { moduleId: true, isEnabled: true, updatedAt: true },
  });
  const byId = new Map(rows.map((row) => [row.moduleId, row]));

  return TOGGLEABLE_PRODUCT_MODULES.map((productModule) => {
    const row = byId.get(productModule.id);
    return {
      moduleId: productModule.id,
      label: productModule.label,
      description: productModule.description,
      isEnabled: row?.isEnabled ?? false,
      requires: productModule.requires ?? [],
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

/**
 * Checks that a proposed set of enabled modules is internally consistent.
 *
 * Dependencies are validated against the RESULTING state, not against the change, so this
 * catches both halves of the same mistake: enabling `guarderia` without `reservas`, and
 * disabling `reservas` while `guarderia` is still on. Validating only the modules being
 * switched on would let the second one through and leave the tenant with a module whose
 * backend ids it can reach but whose prerequisites it cannot.
 */
export function assertDependenciesSatisfied(enabled: Set<string>): void {
  for (const moduleId of enabled) {
    const productModule = getProductModule(moduleId);
    if (!productModule) continue;
    for (const required of productModule.requires ?? []) {
      if (!enabled.has(required)) {
        const requiredLabel = getProductModule(required)?.label ?? required;
        throw new AuthzError(
          400,
          `El módulo "${productModule.label}" requiere "${requiredLabel}". ` +
            `Habilita "${requiredLabel}" o deshabilita "${productModule.label}".`,
        );
      }
    }
  }
}

function assertToggleable(moduleId: string): void {
  const productModule = getProductModule(moduleId);
  if (!productModule) {
    throw new AuthzError(400, `Módulo desconocido: ${moduleId}`);
  }
  // Core modules are always on and platform-only modules are never a tenant's to hold. Both
  // would be silently ignored by the gate, so refusing here keeps the console honest about
  // what it actually changed.
  if (productModule.core) {
    throw new AuthzError(400, `El módulo "${productModule.label}" es parte del núcleo y no se puede deshabilitar`);
  }
  if (productModule.platformOnly) {
    throw new AuthzError(400, `El módulo "${productModule.label}" no se asigna a una guardería`);
  }
}

export interface EntitlementChange {
  moduleId: string;
  isEnabled: boolean;
}

/**
 * Bulk-sets entitlements for a daycare. Partial input is allowed: modules not mentioned keep
 * their current state, which is what lets the console send only what the user touched.
 */
export async function setEntitlements(
  daycareId: string,
  changes: readonly EntitlementChange[],
): Promise<EntitlementView[]> {
  const seen = new Set<string>();
  for (const change of changes) {
    if (seen.has(change.moduleId)) {
      throw new AuthzError(400, `Módulo repetido en la petición: ${change.moduleId}`);
    }
    seen.add(change.moduleId);
    assertToggleable(change.moduleId);
  }

  const current = await prisma.daycareModule.findMany({
    where: { daycareId },
    select: { moduleId: true, isEnabled: true },
  });

  const resulting = new Set(current.filter((row) => row.isEnabled).map((row) => row.moduleId));
  for (const change of changes) {
    if (change.isEnabled) resulting.add(change.moduleId);
    else resulting.delete(change.moduleId);
  }
  assertDependenciesSatisfied(resulting);

  await prisma.$transaction(
    changes.map((change) =>
      prisma.daycareModule.upsert({
        where: { daycareId_moduleId: { daycareId, moduleId: change.moduleId } },
        update: { isEnabled: change.isEnabled },
        create: { daycareId, moduleId: change.moduleId, isEnabled: change.isEnabled },
      }),
    ),
  );

  // The gate caches entitlements for a short TTL. Drop this tenant's entry so the change is
  // visible on the very next request rather than up to the TTL later.
  invalidate(daycareId);

  return getEntitlementMatrix(daycareId);
}

/**
 * The rows a newly created daycare starts with. Every toggleable module gets a row, so the
 * console shows an explicit on/off rather than an absence, and the defaults are filtered
 * through the dependency check for the same reason a later edit is.
 */
export function initialEntitlements(
  moduleIds: readonly string[] = DEFAULT_ENABLED_PRODUCT_MODULES,
): Array<{ moduleId: string; isEnabled: boolean }> {
  const enabled = new Set(moduleIds);
  for (const moduleId of enabled) assertToggleable(moduleId);
  assertDependenciesSatisfied(enabled);

  return TOGGLEABLE_PRODUCT_MODULES.map((productModule) => ({
    moduleId: productModule.id,
    isEnabled: enabled.has(productModule.id),
  }));
}
