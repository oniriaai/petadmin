import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { DaycareAttendanceService } from "./attendance.service";

export const guarderiaRouter = Router();
guarderiaRouter.use(requireAuth);

// Access check: only admin and kinderdog role can access this module
guarderiaRouter.use((req, res, next) => {
  if (req.user?.role !== "admin" && req.user?.role !== "kinderdog") {
    res.status(403).json({ message: "No tienes permiso para acceder al módulo de Guardería" });
    return;
  }
  next();
});

// Live Room Occupancy
guarderiaRouter.get("/occupancy", async (_req, res) => {
  try {
    const occupancy = await DaycareAttendanceService.getLiveOccupancy();
    res.json(occupancy);
  } catch (error: any) {
    console.error("Error getting daycare occupancy:", error);
    res.status(500).json({ message: error.message || "Error al obtener ocupación de guardería" });
  }
});

// Today Attendance (Reservations & Active Check-ins)
guarderiaRouter.get("/attendance/today", async (_req, res) => {
  try {
    const attendance = await DaycareAttendanceService.getTodayAttendance();
    res.json(attendance);
  } catch (error: any) {
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
      performedByUserId: req.user?.userId,
    });
    res.status(201).json(checkInRecord);
  } catch (error: any) {
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
      performedByUserId: req.user?.userId,
    });
    res.json(checkOutRecord);
  } catch (error: any) {
    console.error("Error registering daycare check-out:", error);
    res.status(400).json({ message: error.message || "Error al registrar check-out en guardería" });
  }
});

// Transport Routes
guarderiaRouter.get("/transport", async (_req, res) => {
  try {
    const transport = await DaycareAttendanceService.getTodayTransport();
    res.json(transport);
  } catch (error: any) {
    console.error("Error getting daycare transport:", error);
    res.status(500).json({ message: error.message || "Error al obtener transporte de guardería" });
  }
});
