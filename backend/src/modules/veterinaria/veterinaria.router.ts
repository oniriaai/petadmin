import { Router, type Request, type Response } from "express";
import { z, type ZodTypeAny } from "zod";

import { AuthzError, handleAuthzError } from "../../middleware/auth";
import { getRequiredDaycareId } from "../../core/tenancy/scope";
import { readPage, sendPage } from "../../utils/pagination";
import {
  createService,
  createStaff,
  deactivateService,
  deactivateStaff,
  listServices,
  listStaff,
  updateService,
  updateStaff,
} from "./catalog.service";
import { getPatientHistory, updatePatient } from "./history.service";
import {
  addPatientPreventive,
  addVaccination,
  addVisitPreventive,
  createPrescription,
  dispenseItem,
  getPrescription,
  listControlledLog,
  listDispenseQueue,
  listExpiringLots,
  listPharmacyItems,
  removePrescription,
  removePreventive,
  removeVaccination,
} from "./pharmacy.service";
import {
  chargeSchema,
  closeVisitSchema,
  createVisitSchema,
  diagnosisSchema,
  dispenseSchema,
  patientSchema,
  paymentSchema,
  prescriptionSchema,
  preventiveSchema,
  serviceSchema,
  staffSchema,
  vaccinationSchema,
  visitRecordSchema,
  visitStatusSchema,
  vitalsSchema,
} from "./schemas";
import {
  addCharge,
  addDiagnosis,
  addDocument,
  addVitals,
  closeVisit,
  createVisit,
  deleteVisit,
  getVisit,
  listVisits,
  recordPayment,
  removeVisitChild,
  updateVisitRecord,
  updateVisitStatus,
} from "./visits.service";

/**
 * The veterinary clinic. Mounted by the registry behind `requireAuth` and the entitlement gate
 * for the `admin` and `veterinary` roles in the VETERINARY unit, so nothing here re-checks
 * authentication, role or module.
 */
export const veterinariaRouter = Router();

function fail(res: Response, error: unknown): void {
  if (handleAuthzError(res, error)) return;
  console.error(error);
  res.status(500).json({ message: "Error interno del servidor" });
}

/** Parses the body, or answers 400 and returns null. */
function parseBody<S extends ZodTypeAny>(
  schema: S,
  req: Request,
  res: Response,
): z.infer<S> | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
    return null;
  }
  return parsed.data;
}

/** The catalogue and the staff list set prices and who may attend: an admin's decision. */
function assertAdmin(req: Request): void {
  const role = req.user?.role;
  if (role !== "admin" && role !== "superadmin") {
    throw new AuthzError(403, "Solo un administrador puede modificar el catálogo de la clínica");
  }
}

const documentSchema = z.object({
  type: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  filePath: z.string().trim().max(1000).optional(),
});

// --- Catalogue -------------------------------------------------------------------------------

veterinariaRouter.get("/services", async (req, res) => {
  try {
    res.json(await listServices(getRequiredDaycareId(req), req.query.includeInactive === "true"));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/services", async (req, res) => {
  try {
    assertAdmin(req);
    const body = parseBody(serviceSchema, req, res);
    if (!body) return;
    res.status(201).json(await createService(getRequiredDaycareId(req), body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.put("/services/:id", async (req, res) => {
  try {
    assertAdmin(req);
    const body = parseBody(serviceSchema.partial(), req, res);
    if (!body) return;
    res.json(await updateService(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.delete("/services/:id", async (req, res) => {
  try {
    assertAdmin(req);
    await deactivateService(getRequiredDaycareId(req), req.params.id);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.get("/staff", async (req, res) => {
  try {
    res.json(await listStaff(getRequiredDaycareId(req), req.query.includeInactive === "true"));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/staff", async (req, res) => {
  try {
    assertAdmin(req);
    const body = parseBody(staffSchema, req, res);
    if (!body) return;
    res.status(201).json(await createStaff(getRequiredDaycareId(req), body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.put("/staff/:id", async (req, res) => {
  try {
    assertAdmin(req);
    const body = parseBody(staffSchema.partial(), req, res);
    if (!body) return;
    res.json(await updateStaff(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.delete("/staff/:id", async (req, res) => {
  try {
    assertAdmin(req);
    await deactivateStaff(getRequiredDaycareId(req), req.params.id);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

// --- Visits ----------------------------------------------------------------------------------

veterinariaRouter.get("/visits", async (req, res) => {
  try {
    const page = readPage(req);
    const { items, total } = await listVisits(
      getRequiredDaycareId(req),
      req.query as Record<string, string>,
      page,
    );
    sendPage(res, page, items, total);
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/visits", async (req, res) => {
  try {
    const body = parseBody(createVisitSchema, req, res);
    if (!body) return;
    res.status(201).json(await createVisit(getRequiredDaycareId(req), body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.get("/visits/:id", async (req, res) => {
  try {
    res.json(await getVisit(getRequiredDaycareId(req), req.params.id));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.patch("/visits/:id", async (req, res) => {
  try {
    const body = parseBody(visitRecordSchema, req, res);
    if (!body) return;
    res.json(await updateVisitRecord(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.patch("/visits/:id/status", async (req, res) => {
  try {
    const body = parseBody(visitStatusSchema, req, res);
    if (!body) return;
    res.json(await updateVisitStatus(getRequiredDaycareId(req), req.params.id, body.status));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.delete("/visits/:id", async (req, res) => {
  try {
    await deleteVisit(getRequiredDaycareId(req), req.params.id);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/visits/:id/vitals", async (req, res) => {
  try {
    const body = parseBody(vitalsSchema, req, res);
    if (!body) return;
    res.status(201).json(await addVitals(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.delete("/visits/:id/vitals/:childId", async (req, res) => {
  try {
    await removeVisitChild(
      getRequiredDaycareId(req),
      req.params.id,
      "vetVitals",
      req.params.childId,
    );
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/visits/:id/diagnoses", async (req, res) => {
  try {
    const body = parseBody(diagnosisSchema, req, res);
    if (!body) return;
    res.status(201).json(await addDiagnosis(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.delete("/visits/:id/diagnoses/:childId", async (req, res) => {
  try {
    await removeVisitChild(
      getRequiredDaycareId(req),
      req.params.id,
      "vetDiagnosis",
      req.params.childId,
    );
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/visits/:id/charges", async (req, res) => {
  try {
    const body = parseBody(chargeSchema, req, res);
    if (!body) return;
    res.status(201).json(await addCharge(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.delete("/visits/:id/charges/:childId", async (req, res) => {
  try {
    await removeVisitChild(
      getRequiredDaycareId(req),
      req.params.id,
      "vetVisitCharge",
      req.params.childId,
    );
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/visits/:id/documents", async (req, res) => {
  try {
    const body = parseBody(documentSchema, req, res);
    if (!body) return;
    res.status(201).json(await addDocument(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/visits/:id/close", async (req, res) => {
  try {
    const body = parseBody(closeVisitSchema, req, res);
    if (!body) return;
    res.json(await closeVisit(getRequiredDaycareId(req), req.params.id, req.user?.userId, body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/visits/:id/payments", async (req, res) => {
  try {
    const body = parseBody(paymentSchema, req, res);
    if (!body) return;
    res.status(201).json(await recordPayment(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

// --- Patients --------------------------------------------------------------------------------

veterinariaRouter.get("/patients/:petId/history", async (req, res) => {
  try {
    res.json(await getPatientHistory(getRequiredDaycareId(req), req.params.petId));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.patch("/patients/:petId", async (req, res) => {
  try {
    const body = parseBody(patientSchema, req, res);
    if (!body) return;
    res.json(await updatePatient(getRequiredDaycareId(req), req.params.petId, body));
  } catch (error) {
    fail(res, error);
  }
});

// --- Preventive care, prescriptions and pharmacy ---------------------------------------------

veterinariaRouter.post("/visits/:id/vaccinations", async (req, res) => {
  try {
    const body = parseBody(vaccinationSchema, req, res);
    if (!body) return;
    res.status(201).json(await addVaccination(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.delete("/visits/:id/vaccinations/:childId", async (req, res) => {
  try {
    await removeVaccination(getRequiredDaycareId(req), req.params.id, req.params.childId);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/visits/:id/preventives", async (req, res) => {
  try {
    const body = parseBody(preventiveSchema, req, res);
    if (!body) return;
    res.status(201).json(await addVisitPreventive(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/patients/:petId/preventives", async (req, res) => {
  try {
    const body = parseBody(preventiveSchema, req, res);
    if (!body) return;
    res
      .status(201)
      .json(await addPatientPreventive(getRequiredDaycareId(req), req.params.petId, body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.delete("/patients/:petId/preventives/:childId", async (req, res) => {
  try {
    await removePreventive(getRequiredDaycareId(req), req.params.petId, req.params.childId);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/visits/:id/prescriptions", async (req, res) => {
  try {
    const body = parseBody(prescriptionSchema, req, res);
    if (!body) return;
    res.status(201).json(await createPrescription(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.delete("/visits/:id/prescriptions/:childId", async (req, res) => {
  try {
    await removePrescription(getRequiredDaycareId(req), req.params.id, req.params.childId);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.get("/prescriptions/:id", async (req, res) => {
  try {
    res.json(await getPrescription(getRequiredDaycareId(req), req.params.id));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.post("/prescription-items/:itemId/dispense", async (req, res) => {
  try {
    const body = parseBody(dispenseSchema, req, res);
    if (!body) return;
    res.json(
      await dispenseItem(getRequiredDaycareId(req), req.params.itemId, req.user?.userId, body),
    );
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.get("/pharmacy/items", async (req, res) => {
  try {
    res.json(await listPharmacyItems(getRequiredDaycareId(req)));
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.get("/pharmacy/queue", async (req, res) => {
  try {
    const page = readPage(req);
    const { items, total } = await listDispenseQueue(getRequiredDaycareId(req), page);
    sendPage(res, page, items, total);
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.get("/pharmacy/controlled-log", async (req, res) => {
  try {
    const page = readPage(req);
    const { items, total } = await listControlledLog(
      getRequiredDaycareId(req),
      req.query as Record<string, string>,
      page,
    );
    sendPage(res, page, items, total);
  } catch (error) {
    fail(res, error);
  }
});

veterinariaRouter.get("/pharmacy/expiring", async (req, res) => {
  try {
    res.json(await listExpiringLots(getRequiredDaycareId(req)));
  } catch (error) {
    fail(res, error);
  }
});
