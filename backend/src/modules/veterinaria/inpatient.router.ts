import { Router } from "express";

import { getRequiredDaycareId } from "../../core/tenancy/scope";
import { readPage, sendPage } from "../../utils/pagination";
import { fail, parseBody } from "./http";
import {
  addTreatmentOrder,
  addWardVitals,
  admit,
  discharge,
  getHospitalization,
  listHospitalizations,
  listWards,
  recordDose,
  stopTreatmentOrder,
} from "./inpatient.service";
import {
  addConsent,
  addLabOrder,
  addProcedure,
  finishProcedure,
  getConsent,
  listLabOrders,
  recordLabResult,
  removeConsent,
  removeLabOrder,
  removeProcedure,
  signConsent,
  startProcedure,
  updateLabStatus,
  updateProcedure,
} from "./orders.service";
import {
  admissionSchema,
  consentSchema,
  consentSignSchema,
  dischargeSchema,
  labOrderSchema,
  labResultSchema,
  labStatusSchema,
  procedureFinishSchema,
  procedureSchema,
  procedureUpdateSchema,
  treatmentDoseSchema,
  treatmentOrderSchema,
  vitalsSchema,
} from "./schemas";

/**
 * Hospitalization, procedures, laboratory and consents. Mounted inside `veterinariaRouter`, so it
 * sits behind the same gate and re-checks nothing.
 */
export const inpatientRouter = Router();

// --- Hospitalization --------------------------------------------------------------------------

inpatientRouter.get("/hospitalizations", async (req, res) => {
  try {
    const page = readPage(req);
    const { items, total } = await listHospitalizations(
      getRequiredDaycareId(req),
      req.query as Record<string, string>,
      page,
    );
    sendPage(res, page, items, total);
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.get("/hospitalizations/wards", async (req, res) => {
  try {
    res.json(await listWards(getRequiredDaycareId(req)));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.get("/hospitalizations/:id", async (req, res) => {
  try {
    res.json(await getHospitalization(getRequiredDaycareId(req), req.params.id));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.post("/visits/:id/hospitalizations", async (req, res) => {
  try {
    const body = parseBody(admissionSchema, req, res);
    if (!body) return;
    res.status(201).json(await admit(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.post("/hospitalizations/:id/discharge", async (req, res) => {
  try {
    const body = parseBody(dischargeSchema, req, res);
    if (!body) return;
    res.json(await discharge(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.post("/hospitalizations/:id/vitals", async (req, res) => {
  try {
    const body = parseBody(vitalsSchema, req, res);
    if (!body) return;
    res.status(201).json(await addWardVitals(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.post("/hospitalizations/:id/orders", async (req, res) => {
  try {
    const body = parseBody(treatmentOrderSchema, req, res);
    if (!body) return;
    res.status(201).json(await addTreatmentOrder(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.post("/treatment-orders/:orderId/stop", async (req, res) => {
  try {
    await stopTreatmentOrder(getRequiredDaycareId(req), req.params.orderId);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.post("/treatment-orders/:orderId/doses", async (req, res) => {
  try {
    const body = parseBody(treatmentDoseSchema, req, res);
    if (!body) return;
    res
      .status(201)
      .json(
        await recordDose(getRequiredDaycareId(req), req.params.orderId, req.user?.userId, body),
      );
  } catch (error) {
    fail(res, error);
  }
});

// --- Procedures -------------------------------------------------------------------------------

inpatientRouter.post("/visits/:id/procedures", async (req, res) => {
  try {
    const body = parseBody(procedureSchema, req, res);
    if (!body) return;
    res.status(201).json(await addProcedure(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.delete("/visits/:id/procedures/:childId", async (req, res) => {
  try {
    await removeProcedure(getRequiredDaycareId(req), req.params.id, req.params.childId);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.patch("/procedures/:id", async (req, res) => {
  try {
    const body = parseBody(procedureUpdateSchema, req, res);
    if (!body) return;
    res.json(await updateProcedure(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.post("/procedures/:id/start", async (req, res) => {
  try {
    res.json(await startProcedure(getRequiredDaycareId(req), req.params.id));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.post("/procedures/:id/finish", async (req, res) => {
  try {
    const body = parseBody(procedureFinishSchema, req, res);
    if (!body) return;
    res.json(await finishProcedure(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

// --- Laboratory and imaging -------------------------------------------------------------------

inpatientRouter.get("/lab-orders", async (req, res) => {
  try {
    const page = readPage(req);
    const { items, total } = await listLabOrders(
      getRequiredDaycareId(req),
      req.query as Record<string, string>,
      page,
    );
    sendPage(res, page, items, total);
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.post("/visits/:id/lab-orders", async (req, res) => {
  try {
    const body = parseBody(labOrderSchema, req, res);
    if (!body) return;
    res.status(201).json(await addLabOrder(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.delete("/visits/:id/lab-orders/:childId", async (req, res) => {
  try {
    await removeLabOrder(getRequiredDaycareId(req), req.params.id, req.params.childId);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.patch("/lab-orders/:id/status", async (req, res) => {
  try {
    const body = parseBody(labStatusSchema, req, res);
    if (!body) return;
    res.json(await updateLabStatus(getRequiredDaycareId(req), req.params.id, body.status));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.post("/lab-orders/:id/result", async (req, res) => {
  try {
    const body = parseBody(labResultSchema, req, res);
    if (!body) return;
    res.json(await recordLabResult(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

// --- Consents ---------------------------------------------------------------------------------

inpatientRouter.post("/visits/:id/consents", async (req, res) => {
  try {
    const body = parseBody(consentSchema, req, res);
    if (!body) return;
    res.status(201).json(await addConsent(getRequiredDaycareId(req), req.params.id, body));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.delete("/visits/:id/consents/:childId", async (req, res) => {
  try {
    await removeConsent(getRequiredDaycareId(req), req.params.id, req.params.childId);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.get("/consents/:id", async (req, res) => {
  try {
    res.json(await getConsent(getRequiredDaycareId(req), req.params.id));
  } catch (error) {
    fail(res, error);
  }
});

inpatientRouter.post("/consents/:id/sign", async (req, res) => {
  try {
    const body = parseBody(consentSignSchema, req, res);
    if (!body) return;
    res.json(await signConsent(getRequiredDaycareId(req), req.params.id, body.signedByName));
  } catch (error) {
    fail(res, error);
  }
});
