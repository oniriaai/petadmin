import type { z } from "zod";

import { prisma } from "../../db";
import { AuthzError } from "../../middleware/auth";
import type { patientSchema } from "./schemas";

const HISTORY_VISIT_LIMIT = 100;
const HISTORY_VITALS_LIMIT = 60;

/**
 * Everything the clinic knows about one patient, newest first.
 *
 * The pet is resolved against the daycare first; every child query after it is then keyed by
 * that verified pet as well as by the tenant.
 */
export async function getPatientHistory(daycareId: string, petId: string) {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, daycareId },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          whatsapp: true,
          email: true,
        },
      },
      vaccinations: { orderBy: { date: "desc" } },
      documents: { orderBy: { uploadedAt: "desc" } },
    },
  });
  if (!pet) throw new AuthzError(404, "Paciente no encontrado");

  const [
    visits,
    vitals,
    chronicDiagnoses,
    preventives,
    prescriptions,
    hospitalizations,
    procedures,
    labOrders,
    consents,
  ] = await Promise.all([
    prisma.vetVisit.findMany({
      where: { petId: pet.id, daycareId },
      include: {
        veterinarian: { select: { id: true, name: true } },
        reservation: { select: { checkIn: true, service: true, totalAmount: true } },
        diagnoses: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { reservation: { checkIn: "desc" } },
      take: HISTORY_VISIT_LIMIT,
    }),
    prisma.vetVitals.findMany({
      where: { petId: pet.id, daycareId },
      orderBy: { takenAt: "desc" },
      take: HISTORY_VITALS_LIMIT,
    }),
    prisma.vetDiagnosis.findMany({
      where: { petId: pet.id, daycareId, isChronic: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.vetPreventive.findMany({
      where: { petId: pet.id, daycareId },
      orderBy: { date: "desc" },
      take: HISTORY_VISIT_LIMIT,
    }),
    prisma.vetPrescription.findMany({
      where: { petId: pet.id, daycareId },
      include: { items: true, veterinarian: { select: { id: true, name: true } } },
      orderBy: { issuedAt: "desc" },
      take: HISTORY_VISIT_LIMIT,
    }),
    prisma.vetHospitalization.findMany({
      where: { petId: pet.id, daycareId },
      include: { room: { select: { id: true, name: true } } },
      orderBy: { admittedAt: "desc" },
      take: HISTORY_VISIT_LIMIT,
    }),
    prisma.vetProcedure.findMany({
      where: { petId: pet.id, daycareId },
      include: { veterinarian: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: HISTORY_VISIT_LIMIT,
    }),
    prisma.vetLabOrder.findMany({
      where: { petId: pet.id, daycareId },
      include: { values: true },
      orderBy: { requestedAt: "desc" },
      take: HISTORY_VISIT_LIMIT,
    }),
    prisma.vetConsent.findMany({
      where: { petId: pet.id, daycareId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_VISIT_LIMIT,
    }),
  ]);

  return {
    pet,
    visits,
    vitals,
    chronicDiagnoses,
    preventives,
    prescriptions,
    hospitalizations,
    procedures,
    labOrders,
    consents,
  };
}

/** The clinical fields of a pet's profile. The rest of the profile belongs to Core's `/pets`. */
export async function updatePatient(
  daycareId: string,
  petId: string,
  dto: z.infer<typeof patientSchema>,
) {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, daycareId },
    select: { id: true },
  });
  if (!pet) throw new AuthzError(404, "Paciente no encontrado");

  const { deceasedAt, ...rest } = dto;
  let deceased: Date | null | undefined;
  if (deceasedAt !== undefined) {
    deceased = deceasedAt ? new Date(deceasedAt) : null;
    if (deceased && Number.isNaN(deceased.getTime())) {
      throw new AuthzError(400, "Fecha de fallecimiento inválida");
    }
  }

  return prisma.pet.update({
    where: { id: pet.id },
    data: {
      ...rest,
      ...(deceased !== undefined ? { deceasedAt: deceased } : {}),
      // Clearing the date clears its cause: a cause of death without a death is noise.
      ...(deceased === null ? { deathCause: null } : {}),
    },
    select: {
      id: true,
      bloodType: true,
      chronicConditions: true,
      allergies: true,
      deceasedAt: true,
      deathCause: true,
    },
  });
}
