import type { Prisma } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "../../db";
import { AuthzError } from "../../middleware/auth";
import { assertVeterinarianInTenant } from "../../utils/validation";
import type {
  ProcedureKind,
  consentSchema,
  labOrderSchema,
  labResultSchema,
  procedureFinishSchema,
  procedureSchema,
  procedureUpdateSchema,
} from "./schemas";
import { assertEditable, requireVisit } from "./visits.service";

/** Procedures that cannot begin without the tutor's signed consent of the same type. */
const CONSENT_REQUIRED: ProcedureKind[] = ["CIRUGIA", "EUTANASIA"];

// --- Procedures -------------------------------------------------------------------------------

const procedureInclude = {
  veterinarian: { select: { id: true, name: true } },
} satisfies Prisma.VetProcedureInclude;

export async function addProcedure(
  daycareId: string,
  visitId: string,
  dto: z.infer<typeof procedureSchema>,
) {
  const visit = await requireVisit(daycareId, visitId);
  assertEditable(visit);
  if (dto.veterinarianId) await assertVeterinarianInTenant(dto.veterinarianId, daycareId);

  return prisma.vetProcedure.create({
    data: {
      ...dto,
      daycareId,
      visitId: visit.id,
      petId: visit.petId,
      veterinarianId: dto.veterinarianId ?? visit.veterinarianId,
    },
    include: procedureInclude,
  });
}

/** A procedure with the state of its visit, tenant-scoped. */
async function requireProcedure(daycareId: string, id: string) {
  const procedure = await prisma.vetProcedure.findFirst({
    where: { id, daycareId },
    include: { visit: { select: { id: true, status: true } } },
  });
  if (!procedure) throw new AuthzError(404, "Procedimiento no encontrado");
  return procedure;
}

export async function updateProcedure(
  daycareId: string,
  id: string,
  dto: z.infer<typeof procedureUpdateSchema>,
) {
  const procedure = await requireProcedure(daycareId, id);
  assertEditable(procedure.visit);
  if (dto.veterinarianId) await assertVeterinarianInTenant(dto.veterinarianId, daycareId);

  return prisma.vetProcedure.update({
    where: { id: procedure.id },
    data: dto,
    include: procedureInclude,
  });
}

export async function startProcedure(daycareId: string, id: string) {
  const procedure = await requireProcedure(daycareId, id);
  assertEditable(procedure.visit);

  if (CONSENT_REQUIRED.includes(procedure.kind as ProcedureKind)) {
    const consent = await prisma.vetConsent.findFirst({
      where: {
        daycareId,
        petId: procedure.petId,
        visitId: procedure.visitId,
        type: procedure.kind,
        signedAt: { not: null },
      },
      select: { id: true },
    });
    if (!consent) {
      throw new AuthzError(
        409,
        "Falta el consentimiento firmado del tutor para este procedimiento",
      );
    }
  }

  const claimed = await prisma.vetProcedure.updateMany({
    where: { id: procedure.id, daycareId, status: "PROGRAMADO" },
    data: { status: "EN_CURSO", startAt: new Date() },
  });
  if (claimed.count === 0) throw new AuthzError(409, "El procedimiento ya fue iniciado");

  return prisma.vetProcedure.findFirst({
    where: { id: procedure.id, daycareId },
    include: procedureInclude,
  });
}

export async function finishProcedure(
  daycareId: string,
  id: string,
  dto: z.infer<typeof procedureFinishSchema>,
) {
  const procedure = await requireProcedure(daycareId, id);
  const endAt = new Date();

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.vetProcedure.updateMany({
      where: { id: procedure.id, daycareId, status: "EN_CURSO" },
      data: { ...dto, status: "FINALIZADO", endAt },
    });
    if (claimed.count === 0) throw new AuthzError(409, "El procedimiento no está en curso");

    if (procedure.kind === "EUTANASIA") {
      // Recorded once: a death already on file keeps its date and cause.
      await tx.pet.updateMany({
        where: { id: procedure.petId, daycareId, deceasedAt: null },
        data: { deceasedAt: endAt, deathCause: "Eutanasia" },
      });
    }
  });

  return prisma.vetProcedure.findFirst({
    where: { id: procedure.id, daycareId },
    include: procedureInclude,
  });
}

/** Removes a procedure that was planned and never started. */
export async function removeProcedure(daycareId: string, visitId: string, id: string) {
  const visit = await requireVisit(daycareId, visitId);
  assertEditable(visit);
  const { count } = await prisma.vetProcedure.deleteMany({
    where: { id, visitId: visit.id, daycareId, status: "PROGRAMADO" },
  });
  if (count === 0) throw new AuthzError(404, "Procedimiento no encontrado o ya iniciado");
}

// --- Laboratory and imaging -------------------------------------------------------------------

const labOrderInclude = {
  values: true,
  pet: { select: { id: true, name: true, species: true, breed: true } },
  visit: {
    select: {
      id: true,
      client: { select: { id: true, firstName: true, lastName: true, phone: true } },
      veterinarian: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.VetLabOrderInclude;

export async function addLabOrder(
  daycareId: string,
  visitId: string,
  dto: z.infer<typeof labOrderSchema>,
) {
  const visit = await requireVisit(daycareId, visitId);
  assertEditable(visit);
  return prisma.vetLabOrder.create({
    data: { ...dto, daycareId, visitId: visit.id, petId: visit.petId },
    include: { values: true },
  });
}

export async function listLabOrders(
  daycareId: string,
  query: { status?: string; kind?: string; petId?: string },
  page: { skip: number; take: number },
) {
  const where: Prisma.VetLabOrderWhereInput = { daycareId };
  if (query.status === "PENDIENTE") where.status = { not: "RESULTADO" };
  else if (query.status && query.status !== "ALL") where.status = query.status;
  if (query.kind) where.kind = query.kind;
  if (query.petId) where.petId = query.petId;

  const [items, total] = await Promise.all([
    prisma.vetLabOrder.findMany({
      where,
      include: labOrderInclude,
      orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.vetLabOrder.count({ where }),
  ]);
  return { items, total };
}

export async function updateLabStatus(
  daycareId: string,
  id: string,
  status: "SOLICITADO" | "EN_PROCESO",
) {
  const { count } = await prisma.vetLabOrder.updateMany({
    where: { id, daycareId, status: { not: "RESULTADO" } },
    data: { status },
  });
  if (count === 0) throw new AuthzError(404, "Orden no encontrada o ya con resultado");
  return prisma.vetLabOrder.findFirst({ where: { id, daycareId }, include: labOrderInclude });
}

/**
 * Records, or corrects, the result of an order.
 *
 * Deliberately not tied to the visit being open: a result routinely arrives days after the
 * consultation that requested it was closed and paid.
 */
export async function recordLabResult(
  daycareId: string,
  id: string,
  dto: z.infer<typeof labResultSchema>,
) {
  const order = await prisma.vetLabOrder.findFirst({
    where: { id, daycareId },
    select: { id: true },
  });
  if (!order) throw new AuthzError(404, "Orden no encontrada");

  await prisma.$transaction([
    prisma.vetLabResultValue.deleteMany({ where: { orderId: order.id, daycareId } }),
    prisma.vetLabResultValue.createMany({
      data: dto.values.map((value) => ({ ...value, daycareId, orderId: order.id })),
    }),
    prisma.vetLabOrder.update({
      where: { id: order.id },
      data: { status: "RESULTADO", resultSummary: dto.resultSummary ?? null, resultAt: new Date() },
    }),
  ]);

  return prisma.vetLabOrder.findFirst({
    where: { id: order.id, daycareId },
    include: labOrderInclude,
  });
}

/** Removes an order that the laboratory has not started on. */
export async function removeLabOrder(daycareId: string, visitId: string, id: string) {
  const visit = await requireVisit(daycareId, visitId);
  assertEditable(visit);
  const { count } = await prisma.vetLabOrder.deleteMany({
    where: { id, visitId: visit.id, daycareId, status: "SOLICITADO" },
  });
  if (count === 0) throw new AuthzError(404, "Orden no encontrada o ya en proceso");
}

// --- Consents ---------------------------------------------------------------------------------

export async function addConsent(
  daycareId: string,
  visitId: string,
  dto: z.infer<typeof consentSchema>,
) {
  const visit = await prisma.vetVisit.findFirst({
    where: { id: visitId, daycareId },
    select: { id: true, status: true, petId: true, clientId: true },
  });
  if (!visit) throw new AuthzError(404, "Consulta no encontrada");
  assertEditable(visit);

  return prisma.vetConsent.create({
    data: {
      daycareId,
      visitId: visit.id,
      petId: visit.petId,
      clientId: visit.clientId,
      type: dto.type,
      text: dto.text,
      signedByName: dto.signedByName ?? null,
      signedAt: dto.signedByName ? new Date() : null,
    },
  });
}

export async function signConsent(daycareId: string, id: string, signedByName: string) {
  // Conditional on being unsigned: a signed consent is a record, not a draft.
  const { count } = await prisma.vetConsent.updateMany({
    where: { id, daycareId, signedAt: null },
    data: { signedByName, signedAt: new Date() },
  });
  if (count === 0) throw new AuthzError(404, "Consentimiento no encontrado o ya firmado");
  return prisma.vetConsent.findFirst({ where: { id, daycareId } });
}

/** One consent with everything its printed form shows. */
export async function getConsent(daycareId: string, id: string) {
  const consent = await prisma.vetConsent.findFirst({
    where: { id, daycareId },
    include: {
      pet: { select: { id: true, name: true, species: true, breed: true, birthdate: true } },
      client: {
        select: { id: true, firstName: true, lastName: true, idNumber: true, phone: true },
      },
      visit: {
        select: { id: true, veterinarian: { select: { name: true, licenseNumber: true } } },
      },
    },
  });
  if (!consent) throw new AuthzError(404, "Consentimiento no encontrado");
  return consent;
}

export async function removeConsent(daycareId: string, visitId: string, id: string) {
  const visit = await requireVisit(daycareId, visitId);
  assertEditable(visit);
  const { count } = await prisma.vetConsent.deleteMany({
    where: { id, visitId: visit.id, daycareId, signedAt: null },
  });
  if (count === 0) throw new AuthzError(404, "Consentimiento no encontrado o ya firmado");
}
