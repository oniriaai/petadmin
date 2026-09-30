import { Router } from "express";
import { z } from "zod";
import { handleAuthzError } from "../../middleware/auth";
import { getRequiredDaycareId } from "../../core/tenancy/scope";
import { DaycareAttendanceService } from "./attendance.service";

export const guarderiaRouter = Router();

// Live Room Occupancy
guarderiaRouter.get("/occupancy", async (req, res) => {
  try {
    const occupancy = await DaycareAttendanceService.getLiveOccupancy(getRequiredDaycareId(req));
    res.json(occupancy);
  } catch (error: any) {
    if (handleAuthzError(res, error)) return;
    console.error("Error getting daycare occupancy:", error);
    res.status(500).json({ message: error.message || "Error al obtener ocupación de guardería" });
  }
});

// Today Attendance (Reservations & Active Check-ins)
guarderiaRouter.get("/attendance/today", async (req, res) => {
  try {
    const attendance = await DaycareAttendanceService.getTodayAttendance(getRequiredDaycareId(req));
    res.json(attendance);
  } catch (error: any) {
    if (handleAuthzError(res, error)) return;
    console.error("Error getting daycare attendance:", error);
    res.status(500).json({ message: error.message || "Error al obtener asistencia de guardería" });
  }
});

// Check-in
const checkInSchema = z.object({
  petId: z.string().min(1, "ID de mascota requerido"),
  clientId: z.string().min(1, "ID de cliente requerido"),
  roomId: z.string().min(1, "ID de sala requerido"),
  reservationId: z.string().optional(),
  checkInTime: z.string().optional(),
  notes: z.string().optional(),
});

guarderiaRouter.post("/attendance/check-in", async (req, res) => {
  try {
    const parsed = checkInSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      return;
    }

    const checkInRecord = await DaycareAttendanceService.registerCheckIn({
      ...parsed.data,
      daycareId: getRequiredDaycareId(req),
      performedByUserId: req.user?.userId,
    });
    res.status(201).json(checkInRecord);
  } catch (error: any) {
    if (handleAuthzError(res, error)) return;
    console.error("Error registering daycare check-in:", error);
    res.status(400).json({ message: error.message || "Error al registrar check-in en guardería" });
  }
});

// Check-out
const checkOutSchema = z.object({
  checkInOutId: z.string().min(1, "ID de registro requerido"),
  checkOutTime: z.string().optional(),
  createIncome: z.boolean().default(false),
  paymentMethod: z.string().default("EFECTIVO"),
  amount: z.number().min(0).optional(),
  notes: z.string().optional(),
});

guarderiaRouter.post("/attendance/check-out", async (req, res) => {
  try {
    const parsed = checkOutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      return;
    }

    const checkOutRecord = await DaycareAttendanceService.registerCheckOut({
      ...parsed.data,
      daycareId: getRequiredDaycareId(req),
      performedByUserId: req.user?.userId,
    });
    res.json(checkOutRecord);
  } catch (error: any) {
    if (handleAuthzError(res, error)) return;
    console.error("Error registering daycare check-out:", error);
    res.status(400).json({ message: error.message || "Error al registrar check-out en guardería" });
  }
});

// Transport Routes
guarderiaRouter.get("/transport", async (req, res) => {
  try {
    const transport = await DaycareAttendanceService.getTodayTransport(getRequiredDaycareId(req));
    res.json(transport);
  } catch (error: any) {
    if (handleAuthzError(res, error)) return;
    console.error("Error getting daycare transport:", error);
    res.status(500).json({ message: error.message || "Error al obtener transporte de guardería" });
  }
});
