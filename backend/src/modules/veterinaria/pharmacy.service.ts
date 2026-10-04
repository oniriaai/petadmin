import type { Prisma } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "../../db";
import { AuthzError } from "../../middleware/auth";
import { recordStockMovement } from "../../core/inventory/stock";
import type {
  dispenseSchema,
  prescriptionSchema,
  preventiveSchema,
  vaccinationSchema,
} from "./schemas";
import {
  VETERINARIA_BUSINESS_UNIT,
  assertEditable,
  parseDate,
  requireVisit,
} from "./visits.service";

const EXPIRY_WINDOW_DAYS = 90;
const QUEUE_WINDOW_DAYS = 30;

async function requirePet(daycareId: string, petId: string) {
  const pet = await prisma.pet.findFirst({ where: { id: petId, daycareId }, select: { id: true } });
  if (!pet) throw new AuthzError(404, "Paciente no encontrado");
  return pet;
}

/** A stock item of the clinic's own unit. Ids arrive in request bodies, so tenant and unit both. */
async function requireClinicItem(daycareId: string, inventoryItemId: string) {
  const item = await prisma.inventoryItem.findFirst({
    where: {
      id: inventoryItemId,
      daycareId,
      businessUnit: VETERINARIA_BUSINESS_UNIT,
      isActive: true,
    },
    select: { id: true, name: true, isControlled: true },
  });
  if (!item) throw new AuthzError(404, "Artículo no encontrado");
  return item;
}

// --- Vaccines and preventives ---------------------------------------------------------------

export async function addVaccination(
  daycareId: string,
  visitId: string,
  dto: z.infer<typeof vaccinationSchema>,
) {
  const visit = await requireVisit(daycareId, visitId);
  assertEditable(visit);
  const { date, nextDue, ...rest } = dto;
  // PetVaccination inherits tenancy through its pet, which the visit above already verified.
  return prisma.petVaccination.create({
    data: {
      ...rest,
      petId: visit.petId,
      vetVisitId: visit.id,
      veterinarianId: visit.veterinarianId,
      date: date ? parseDate(date, "Fecha de aplicación") : new Date(),
      nextDue: nextDue ? parseDate(nextDue, "Fecha de refuerzo") : null,
    },
  });
}

export async function removeVaccination(daycareId: string, visitId: string, id: string) {
  const visit = await requireVisit(daycareId, visitId);
  assertEditable(visit);
  const { count } = await prisma.petVaccination.deleteMany({
    where: { id, vetVisitId: visit.id, petId: visit.petId },
  });
  if (count === 0) throw new AuthzError(404, "Vacuna no encontrada");
}

function preventiveData(dto: z.infer<typeof preventiveSchema>) {
  const { date, nextDue, ...rest } = dto;
  return {
    ...rest,
    date: date ? parseDate(date, "Fecha de aplicación") : new Date(),
    nextDue: nextDue ? parseDate(nextDue, "Próxima dosis") : null,
  };
}

export async function addVisitPreventive(
  daycareId: string,
  visitId: string,
  dto: z.infer<typeof preventiveSchema>,
) {
  const visit = await requireVisit(daycareId, visitId);
  assertEditable(visit);
  return prisma.vetPreventive.create({
    data: { ...preventiveData(dto), daycareId, petId: visit.petId, visitId: visit.id },
  });
}

/** A preventive given elsewhere or before the clinic kept records: no visit behind it. */
export async function addPatientPreventive(
  daycareId: string,
  petId: string,
  dto: z.infer<typeof preventiveSchema>,
) {
  const pet = await requirePet(daycareId, petId);
  return prisma.vetPreventive.create({
    data: { ...preventiveData(dto), daycareId, petId: pet.id },
  });
}

export async function removePreventive(daycareId: string, petId: string, id: string) {
  const { count } = await prisma.vetPreventive.deleteMany({ where: { id, petId, daycareId } });
  if (count === 0) throw new AuthzError(404, "Registro no encontrado");
}

// --- Prescriptions ----------------------------------------------------------------------------

const prescriptionInclude = {
  items: { include: { inventoryItem: { select: { id: true, name: true, unit: true } } } },
  veterinarian: { select: { id: true, name: true, licenseNumber: true } },
} satisfies Prisma.VetPrescriptionInclude;

export async function createPrescription(
  daycareId: string,
  visitId: string,
  dto: z.infer<typeof prescriptionSchema>,
) {
  const visit = await requireVisit(daycareId, visitId);
  assertEditable(visit);

  const itemIds = [...new Set(dto.items.flatMap((item) => item.inventoryItemId ?? []))];
  for (const itemId of itemIds) await requireClinicItem(daycareId, itemId);

  return prisma.vetPrescription.create({
    data: {
      daycareId,
      visitId: visit.id,
      petId: visit.petId,
      veterinarianId: visit.veterinarianId,
      notes: dto.notes,
      items: { create: dto.items.map((item) => ({ ...item, daycareId })) },
    },
    include: prescriptionInclude,
  });
}

/** The prescription as it is printed: with the patient, the tutor and who signed it. */
export async function getPrescription(daycareId: string, id: string) {
  const prescription = await prisma.vetPrescription.findFirst({
    where: { id, daycareId },
    include: {
      ...prescriptionInclude,
      pet: {
        select: {
          id: true,
          name: true,
          species: true,
          breed: true,
          sex: true,
          birthdate: true,
          weight: true,
          client: { select: { firstName: true, lastName: true, phone: true, idNumber: true } },
        },
      },
    },
  });
  if (!prescription) throw new AuthzError(404, "Receta no encontrada");
  return prescription;
}

export async function removePrescription(daycareId: string, visitId: string, id: string) {
  const visit = await requireVisit(daycareId, visitId);
  assertEditable(visit);
  const dispensed = await prisma.vetPrescriptionItem.count({
    where: { prescriptionId: id, daycareId, dispensedAt: { not: null } },
  });
  if (dispensed > 0) {
    throw new AuthzError(409, "La receta ya tiene medicamentos dispensados y no se puede eliminar");
  }
  const { count } = await prisma.vetPrescription.deleteMany({
    where: { id, visitId: visit.id, daycareId },
  });
  if (count === 0) throw new AuthzError(404, "Receta no encontrada");
}

/**
 * Hands a prescribed medicine over from the clinic's own stock.
 *
 * One transaction: the line is claimed, the stock leaves and, if asked, the visit is billed. A
 * line is dispensed once; claiming it conditionally on `dispensedAt` being empty is what stops a
 * double click from taking the stock twice.
 */
export async function dispenseItem(
  daycareId: string,
  itemId: string,
  userId: string | undefined,
  dto: z.infer<typeof dispenseSchema>,
) {
  const line = await prisma.vetPrescriptionItem.findFirst({
    where: { id: itemId, daycareId },
    include: {
      prescription: {
        select: { visitId: true, visit: { select: { id: true, status: true } } },
      },
    },
  });
  if (!line) throw new AuthzError(404, "Línea de receta no encontrada");
  if (line.dispensedAt) throw new AuthzError(409, "Ese medicamento ya fue dispensado");

  const inventoryItemId = dto.inventoryItemId ?? line.inventoryItemId;
  if (!inventoryItemId) {
    throw new AuthzError(400, "Indica de qué artículo del inventario se dispensa");
  }
  const stockItem = await requireClinicItem(daycareId, inventoryItemId);

  const visit = line.prescription.visit;
  if (dto.unitPrice !== undefined) assertEditable(visit);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.vetPrescriptionItem.updateMany({
      where: { id: line.id, daycareId, dispensedAt: null },
      data: {
        inventoryItemId: stockItem.id,
        quantityDispensed: dto.quantity,
        dispensedAt: new Date(),
        dispensedByUserId: userId ?? null,
        lotNumber: dto.lotNumber,
      },
    });
    if (claimed.count === 0) throw new AuthzError(409, "Ese medicamento ya fue dispensado");

    await recordStockMovement(tx, {
      daycareId,
      itemId: stockItem.id,
      type: "SALIDA",
      quantity: dto.quantity,
      reason: `Receta: ${line.drug}`,
      lotNumber: dto.lotNumber,
      vetPrescriptionItemId: line.id,
      requireStock: true,
    });

    if (dto.unitPrice !== undefined) {
      await tx.vetVisitCharge.create({
        data: {
          daycareId,
          visitId: visit.id,
          inventoryItemId: stockItem.id,
          description: stockItem.name,
          quantity: dto.quantity,
          unitPrice: dto.unitPrice,
        },
      });
    }
  });

  return prisma.vetPrescriptionItem.findFirst({
    where: { id: line.id, daycareId },
    include: { inventoryItem: { select: { id: true, name: true, unit: true } } },
  });
}

// --- Pharmacy desk ----------------------------------------------------------------------------

/** The clinic's stock, for the dispensing picker. Bounded: a clinic's formulary is small. */
export async function listPharmacyItems(daycareId: string) {
  return prisma.inventoryItem.findMany({
    where: { daycareId, businessUnit: VETERINARIA_BUSINESS_UNIT, isActive: true },
    select: {
      id: true,
      name: true,
      category: true,
      unit: true,
      currentStock: true,
      minStock: true,
      isControlled: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 500,
  });
}

const lineContext = {
  inventoryItem: { select: { id: true, name: true, unit: true, isControlled: true } },
  prescription: {
    select: {
      id: true,
      issuedAt: true,
      visitId: true,
      veterinarian: { select: { id: true, name: true, licenseNumber: true } },
      pet: {
        select: {
          id: true,
          name: true,
          client: { select: { firstName: true, lastName: true, idNumber: true } },
        },
      },
    },
  },
} satisfies Prisma.VetPrescriptionItemInclude;

/** Recently prescribed lines nobody has dispensed yet. */
export async function listDispenseQueue(daycareId: string, page: { skip: number; take: number }) {
  const since = new Date(Date.now() - QUEUE_WINDOW_DAYS * 86_400_000);
  const where: Prisma.VetPrescriptionItemWhereInput = {
    daycareId,
    dispensedAt: null,
    prescription: { issuedAt: { gte: since } },
  };
  const [items, total] = await Promise.all([
    prisma.vetPrescriptionItem.findMany({
      where,
      include: lineContext,
      orderBy: [{ prescription: { issuedAt: "desc" } }, { id: "asc" }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.vetPrescriptionItem.count({ where }),
  ]);
  return { items, total };
}

/** The controlled-substance register: every dispensing of an item flagged as controlled. */
export async function listControlledLog(
  daycareId: string,
  query: { from?: string; to?: string },
  page: { skip: number; take: number },
) {
  const where: Prisma.VetPrescriptionItemWhereInput = {
    daycareId,
    dispensedAt: {
      not: null,
      ...(query.from ? { gte: parseDate(query.from, "Fecha inicial") } : {}),
      ...(query.to ? { lte: parseDate(query.to, "Fecha final") } : {}),
    },
    inventoryItem: { isControlled: true },
  };
  const [items, total] = await Promise.all([
    prisma.vetPrescriptionItem.findMany({
      where,
      include: lineContext,
      orderBy: [{ dispensedAt: "desc" }, { id: "asc" }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.vetPrescriptionItem.count({ where }),
  ]);
  return { items, total };
}

/**
 * Received lots that have expired or will within the window.
 *
 * Stock is not tracked per lot, so this lists what was received with an expiry date for items
 * that still have stock; it cannot tell whether that particular lot is the one left on the shelf.
 */
export async function listExpiringLots(daycareId: string) {
  const until = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86_400_000);
  return prisma.inventoryMovement.findMany({
    where: {
      type: "ENTRADA",
      expiresAt: { not: null, lte: until },
      item: {
        daycareId,
        businessUnit: VETERINARIA_BUSINESS_UNIT,
        isActive: true,
        currentStock: { gt: 0 },
      },
    },
    select: {
      id: true,
      lotNumber: true,
      expiresAt: true,
      quantity: true,
      date: true,
      item: { select: { id: true, name: true, unit: true, currentStock: true } },
    },
    orderBy: { expiresAt: "asc" },
    take: 200,
  });
}
