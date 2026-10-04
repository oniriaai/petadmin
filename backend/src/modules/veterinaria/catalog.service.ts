import type { z } from "zod";

import { prisma } from "../../db";
import { AuthzError } from "../../middleware/auth";
import type { serviceSchema, staffSchema } from "./schemas";

type ServiceInput = z.infer<typeof serviceSchema>;
type StaffInput = z.infer<typeof staffSchema>;

export async function listServices(daycareId: string, includeInactive: boolean) {
  return prisma.vetService.findMany({
    where: { daycareId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function createService(daycareId: string, input: ServiceInput) {
  return prisma.vetService.create({ data: { ...input, daycareId } });
}

export async function updateService(daycareId: string, id: string, input: Partial<ServiceInput>) {
  const existing = await prisma.vetService.findFirst({
    where: { id, daycareId },
    select: { id: true },
  });
  if (!existing) throw new AuthzError(404, "Servicio no encontrado");
  return prisma.vetService.update({ where: { id: existing.id }, data: input });
}

/** Soft delete: a service already billed on a visit must keep its name on that line. */
export async function deactivateService(daycareId: string, id: string) {
  await updateService(daycareId, id, { isActive: false });
}

const staffSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  clinic: true,
  licenseNumber: true,
  specialty: true,
  isExternal: true,
  userId: true,
  isActive: true,
  user: { select: { id: true, username: true, name: true } },
} as const;

export async function listStaff(daycareId: string, includeInactive: boolean) {
  return prisma.veterinarian.findMany({
    where: { daycareId, ...(includeInactive ? {} : { isActive: true }) },
    select: staffSelect,
    orderBy: [{ isExternal: "asc" }, { name: "asc" }],
  });
}

/**
 * A staff account can be linked to at most one veterinarian, and only an account of this
 * daycare. `userId` arrives in the request body, so it is resolved against the tenant before it
 * is used as a foreign key.
 */
async function assertUserLinkable(daycareId: string, userId: string, veterinarianId?: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, daycareId },
    select: { id: true },
  });
  if (!user) throw new AuthzError(404, "Usuario no encontrado");

  const linked = await prisma.veterinarian.findFirst({
    where: { userId, daycareId, ...(veterinarianId ? { id: { not: veterinarianId } } : {}) },
    select: { id: true },
  });
  if (linked) throw new AuthzError(409, "Ese usuario ya está vinculado a otro veterinario");
}

function staffData(input: Partial<StaffInput>) {
  const { email, ...rest } = input;
  return { ...rest, ...(email !== undefined ? { email: email || null } : {}) };
}

export async function createStaff(daycareId: string, input: StaffInput) {
  if (input.userId) await assertUserLinkable(daycareId, input.userId);
  return prisma.veterinarian.create({
    data: { ...staffData(input), name: input.name, daycareId },
    select: staffSelect,
  });
}

export async function updateStaff(daycareId: string, id: string, input: Partial<StaffInput>) {
  const existing = await prisma.veterinarian.findFirst({
    where: { id, daycareId },
    select: { id: true },
  });
  if (!existing) throw new AuthzError(404, "Veterinario no encontrado");
  if (input.userId) await assertUserLinkable(daycareId, input.userId, existing.id);
  return prisma.veterinarian.update({
    where: { id: existing.id },
    data: staffData(input),
    select: staffSelect,
  });
}

export async function deactivateStaff(daycareId: string, id: string) {
  await updateStaff(daycareId, id, { isActive: false });
}
