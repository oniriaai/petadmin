import bcrypt from "bcryptjs";

import { prisma } from "../../db";
import {
  BUSINESS_UNITS,
  type AssignableTenantRole,
  type BusinessUnit,
  AuthzError,
} from "../../middleware/auth";
import { DEFAULT_STAFF_PERMISSIONS, normalizePermissions } from "../../core/tenancy/permissions";
import type { PermissionId } from "../../core/tenancy/permissions";
import { DEFAULT_TIMEZONE } from "../../core/tenancy/unit-settings";
import { invalidate } from "../../platform/module-access";
import { invalidatePrincipal, invalidatePrincipalsForDaycare } from "../../core/tenancy/principal";
import { initialEntitlements } from "./entitlements.service";

const BCRYPT_ROUNDS = 10;

/**
 * The business unit a user's row carries, derived from the role rather than accepted from the
 * request. A tenant `admin` spans every unit and is stored as "GLOBAL" (which is not a unit and
 * is deliberately not in BUSINESS_UNITS); the operational roles are pinned to their own.
 * Deriving it removes the possibility of a row whose role and unit disagree.
 */
const UNIT_FOR_ROLE: Record<AssignableTenantRole, BusinessUnit | "GLOBAL"> = {
  admin: "GLOBAL",
  daycare: "DAYCARE",
  grooming: "GROOMING",
  veterinary: "VETERINARY",
};

export function businessUnitForRole(role: AssignableTenantRole): string {
  return UNIT_FOR_ROLE[role];
}

export function parseUnits(value: string): BusinessUnit[] {
  return value
    .split(",")
    .map((unit) => unit.trim().toUpperCase())
    .filter((unit): unit is BusinessUnit => BUSINESS_UNITS.includes(unit as BusinessUnit));
}

export function assertUnitsValid(units: readonly string[]): BusinessUnit[] {
  const normalized = units.map((unit) => unit.trim().toUpperCase());
  const invalid = normalized.filter((unit) => !BUSINESS_UNITS.includes(unit as BusinessUnit));
  if (invalid.length > 0) {
    throw new AuthzError(400, `Unidad de negocio inválida: ${invalid.join(", ")}`);
  }
  const unique = [...new Set(normalized)] as BusinessUnit[];
  if (unique.length === 0) {
    throw new AuthzError(400, "La guardería debe tener al menos una unidad de negocio");
  }
  return unique;
}

/**
 * A role must fit one of the daycare's purchased unit slots: provisioning a `grooming` user in a
 * daycare that only bought DAYCARE produces someone who can log in and reach nothing.
 */
function assertRoleFitsUnits(role: AssignableTenantRole, units: readonly BusinessUnit[]): void {
  if (role === "admin") return;
  const required = businessUnitForRole(role) as BusinessUnit;
  if (!units.includes(required)) {
    throw new AuthzError(400, `Esta guardería no tiene la unidad ${required} habilitada`);
  }
}

export async function listDaycares() {
  const daycares = await prisma.daycare.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { users: true } },
      modules: { where: { isEnabled: true }, select: { moduleId: true } },
    },
  });

  return daycares.map(({ modules, _count, ...daycare }) => ({
    ...daycare,
    unitList: parseUnits(daycare.units),
    userCount: _count.users,
    enabledModuleCount: modules.length,
    enabledModules: modules.map((module) => module.moduleId),
  }));
}

export async function getDaycare(id: string) {
  const daycare = await prisma.daycare.findUnique({
    where: { id },
    include: {
      users: {
        orderBy: { username: "asc" },
        // Never select passwordHash: this response is the console's user list.
        select: {
          id: true,
          username: true,
          name: true,
          role: true,
          businessUnit: true,
          isActive: true,
          permissions: true,
          createdAt: true,
        },
      },
    },
  });
  if (!daycare) throw new AuthzError(404, "Guardería no encontrada");
  const { users, ...rest } = daycare;
  return { ...rest, unitList: parseUnits(daycare.units), users };
}

/**
 * The users of one daycare. Shared by the vendor console and by the daycare's own user-
 * management screen, so the projection — and in particular the fact that `passwordHash` is
 * never in it — is defined once.
 */
export async function listTenantUsers(daycareId: string) {
  return prisma.user.findMany({
    where: { daycareId },
    orderBy: [{ isActive: "desc" }, { username: "asc" }],
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      businessUnit: true,
      isActive: true,
      permissions: true,
      createdAt: true,
    },
  });
}

export interface CreateDaycareInput {
  slug: string;
  name: string;
  legalName?: string;
  timezone?: string;
  units: string[];
  modules?: string[];
  admin: { username: string; password: string; name: string };
}

export async function createDaycare(input: CreateDaycareInput) {
  const units = assertUnitsValid(input.units);
  const entitlements = initialEntitlements(input.modules);
  const timezone = input.timezone?.trim() || DEFAULT_TIMEZONE;
  const slug = input.slug.trim().toLowerCase();

  const slugTaken = await prisma.daycare.findUnique({ where: { slug }, select: { id: true } });
  if (slugTaken)
    throw new AuthzError(409, `Ya existe una guardería con el identificador "${slug}"`);

  // No username check: usernames are unique per daycare, and this daycare does not exist yet,
  // so its first admin cannot collide with anything. What used to be here was a global
  // uniqueness check that had to suggest renaming the user after another customer's.

  return prisma.$transaction(async (tx) => {
    const daycare = await tx.daycare.create({
      data: {
        slug,
        name: input.name.trim(),
        legalName: input.legalName?.trim() || null,
        timezone,
        units: units.join(","),
        isActive: true,
        modules: { create: entitlements },
        unitSettings: { create: units.map((businessUnit) => ({ businessUnit, timezone })) },
      },
    });

    const admin = await tx.user.create({
      data: {
        daycareId: daycare.id,
        username: input.admin.username.trim(),
        name: input.admin.name.trim(),
        // The role is fixed, not taken from input: the first user of a daycare is its admin,
        // and "superadmin" must not be reachable through this path at all.
        role: "admin",
        businessUnit: businessUnitForRole("admin"),
        passwordHash: bcrypt.hashSync(input.admin.password, BCRYPT_ROUNDS),
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        businessUnit: true,
        isActive: true,
      },
    });

    return { daycare, admin };
  });
}

export interface UpdateDaycareInput {
  name?: string;
  legalName?: string | null;
  timezone?: string;
  units?: string[];
  isActive?: boolean;
}

export async function updateDaycare(id: string, input: UpdateDaycareInput) {
  const existing = await prisma.daycare.findUnique({
    where: { id },
    select: { id: true, units: true },
  });
  if (!existing) throw new AuthzError(404, "Guardería no encontrada");

  let units: BusinessUnit[] | undefined;
  if (input.units) {
    units = assertUnitsValid(input.units);
    // Removing a unit that existing users are pinned to would strand them: they would log in
    // successfully and then be refused on every unit-scoped route.
    const stranded = await prisma.user.findMany({
      where: {
        daycareId: id,
        isActive: true,
        businessUnit: { notIn: [...units, "GLOBAL"] },
      },
      select: { username: true, businessUnit: true },
    });
    if (stranded.length > 0) {
      const detail = stranded.map((user) => `${user.username} (${user.businessUnit})`).join(", ");
      throw new AuthzError(
        409,
        `No se puede quitar esa unidad: hay usuarios activos asignados a ella: ${detail}`,
      );
    }
  }

  const daycare = await prisma.daycare.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      legalName: input.legalName === undefined ? undefined : input.legalName?.trim() || null,
      timezone: input.timezone?.trim(),
      units: units ? units.join(",") : undefined,
      isActive: input.isActive,
    },
  });

  // A unit added after creation gets its settings row here, as `createDaycare` does for the
  // initial ones, so the settings screen has something to show for it.
  if (units) {
    await prisma.businessUnitSetting.createMany({
      data: units.map((businessUnit) => ({
        daycareId: id,
        businessUnit,
        timezone: daycare.timezone,
      })),
      skipDuplicates: true,
    });
  }

  invalidate(id);
  // Suspending or reactivating a tenant changes the status of all its users without naming
  // any of them, so the whole tenant's entries go rather than one user's.
  invalidatePrincipalsForDaycare(id);
  return { ...daycare, unitList: parseUnits(daycare.units) };
}

export interface ProvisionUserInput {
  username: string;
  password: string;
  name: string;
  role: AssignableTenantRole;
  /** Omitted: the narrow staff default. Inert for an admin, which holds every permission. */
  permissions?: readonly PermissionId[];
}

export async function provisionUser(daycareId: string, input: ProvisionUserInput) {
  const daycare = await prisma.daycare.findUnique({
    where: { id: daycareId },
    select: { units: true, slug: true },
  });
  if (!daycare) throw new AuthzError(404, "Guardería no encontrada");
  assertRoleFitsUnits(input.role, parseUnits(daycare.units));

  // Scoped to this daycare: another customer having the same username is no longer a conflict.
  const taken = await prisma.user.findUnique({
    where: { daycareId_username: { daycareId, username: input.username } },
    select: { id: true },
  });
  if (taken) {
    throw new AuthzError(409, `El usuario "${input.username}" ya existe en esta guardería`);
  }

  return prisma.user.create({
    data: {
      daycareId,
      username: input.username.trim(),
      name: input.name.trim(),
      role: input.role,
      businessUnit: businessUnitForRole(input.role),
      passwordHash: bcrypt.hashSync(input.password, BCRYPT_ROUNDS),
      isActive: true,
      permissions: normalizePermissions(input.permissions ?? DEFAULT_STAFF_PERMISSIONS),
    },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      businessUnit: true,
      isActive: true,
      permissions: true,
      createdAt: true,
    },
  });
}

export interface UpdateUserInput {
  name?: string;
  role?: AssignableTenantRole;
  password?: string;
  isActive?: boolean;
  /** Replaces the granted list. Omitted: left as it is. */
  permissions?: readonly PermissionId[];
}

export async function updateUser(daycareId: string, userId: string, input: UpdateUserInput) {
  const daycare = await prisma.daycare.findUnique({
    where: { id: daycareId },
    select: { units: true },
  });
  if (!daycare) throw new AuthzError(404, "Guardería no encontrada");

  // The user must belong to the daycare in the path. Looking it up by id alone would let a
  // request name any daycare and still edit the user -- the same shape of bug as deleting a
  // payment by id without checking its payable.
  const existing = await prisma.user.findFirst({
    where: { id: userId, daycareId },
    select: { id: true, role: true },
  });
  if (!existing) throw new AuthzError(404, "Usuario no encontrado");

  if (input.role) assertRoleFitsUnits(input.role, parseUnits(daycare.units));

  // Deactivating the last active admin locks the daycare out of its own administration.
  if (
    input.isActive === false ||
    (input.role && input.role !== "admin" && existing.role === "admin")
  ) {
    const otherAdmins = await prisma.user.count({
      where: { daycareId, role: "admin", isActive: true, id: { not: userId } },
    });
    if (otherAdmins === 0 && existing.role === "admin") {
      throw new AuthzError(409, "Es el único administrador activo de la guardería");
    }
  }

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: input.name?.trim(),
      role: input.role,
      businessUnit: input.role ? businessUnitForRole(input.role) : undefined,
      passwordHash: input.password ? bcrypt.hashSync(input.password, BCRYPT_ROUNDS) : undefined,
      isActive: input.isActive,
      permissions: input.permissions ? normalizePermissions(input.permissions) : undefined,
    },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      businessUnit: true,
      isActive: true,
      permissions: true,
    },
  });

  // Deactivation must bite on the next request, not when the token expires in up to 12h.
  invalidatePrincipal(user.id);
  return user;
}

export async function getOverview() {
  const [daycareCount, activeDaycareCount, userCount, activeUserCount, enabledModuleCount] =
    await Promise.all([
      prisma.daycare.count(),
      prisma.daycare.count({ where: { isActive: true } }),
      prisma.user.count({ where: { daycareId: { not: null } } }),
      prisma.user.count({ where: { daycareId: { not: null }, isActive: true } }),
      prisma.daycareModule.count({ where: { isEnabled: true } }),
    ]);

  return { daycareCount, activeDaycareCount, userCount, activeUserCount, enabledModuleCount };
}
