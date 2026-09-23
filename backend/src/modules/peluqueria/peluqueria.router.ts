import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { DEFAULT_GROOMING_SERVICES } from "./services";
import { GroomingAppointmentsService } from "./appointments.service";

export const peluqueriaRouter = Router();
peluqueriaRouter.use(requireAuth);

// Access check: only admin and pethijos role can access this module
peluqueriaRouter.use((req, res, next) => {
  if (req.user?.role !== "admin" && req.user?.role !== "pethijos") {
    res.status(403).json({ message: "No tienes permiso para acceder al módulo de Peluquería" });
    return;
  }
  next();
});

// Services Catalog
peluqueriaRouter.get("/services", (_req, res) => {
  res.json(DEFAULT_GROOMING_SERVICES);
});

// List Appointments
peluqueriaRouter.get("/appointments", async (req, res) => {
  try {
    const { date, status, search } = req.query as Record<string, string>;
    const list = await GroomingAppointmentsService.listAppointments({ date, status, search });
    res.json(list);
  } catch (error: any) {
    console.error("Error listing appointments:", error);
    res.status(500).json({ message: error.message || "Error obteniendo citas de peluquería" });
  }
});

// Get Appointment Detail
peluqueriaRouter.get("/appointments/:id", async (req, res) => {
  try {
    const appt = await GroomingAppointmentsService.getAppointment(req.params.id);
    if (!appt) {
      res.status(404).json({ message: "Cita no encontrada" });
      return;
    }
    res.json(appt);
  } catch (error: any) {
    console.error("Error getting appointment:", error);
    res.status(500).json({ message: error.message || "Error al obtener cita" });
  }
});

// Create Appointment
const createSchema = z.object({
  clientId: z.string().min(1, "Cliente es requerido"),
  petIds: z.array(z.string()).min(1, "Al menos una mascota requerida"),
  serviceId: z.string().optional(),
  serviceName: z.string().optional(),
  startTime: z.string().min(1, "Fecha y hora requeridas"),
  durationMinutes: z.number().min(10).max(480).default(60),
  notes: z.string().optional(),
  basePrice: z.number().min(0).optional(),
  vatPercent: z.number().min(0).default(15),
  discountAmount: z.number().min(0).default(0),
  advanceAmount: z.number().min(0).default(0),
  paymentMethod: z.string().default("EFECTIVO"),
});

peluqueriaRouter.post("/appointments", async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      return;
    }

    const created = await GroomingAppointmentsService.createAppointment(parsed.data);
    res.status(201).json(created);
  } catch (error: any) {
    console.error("Error creating appointment:", error);
    res.status(400).json({ message: error.message || "Error al agendar cita de peluquería" });
  }
});

// Update Status
const statusSchema = z.object({
  status: z.enum(["PENDIENTE", "RECEPCIONADA", "EN_PROCESO", "LISTO", "COMPLETADA", "CANCELADA"]),
  notes: z.string().optional(),
});

peluqueriaRouter.patch("/appointments/:id/status", async (req, res) => {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Estado inválido", errors: parsed.error.flatten() });
      return;
    }

    const updated = await GroomingAppointmentsService.updateStatus(req.params.id, parsed.data);
    res.json(updated);
  } catch (error: any) {
    console.error("Error updating appointment status:", error);
    res.status(400).json({ message: error.message || "Error al actualizar estado de cita" });
  }
});

// Complete and Collect (Cobro Independiente Pethijos)
const completeSchema = z.object({
  paymentMethod: z.string().default("EFECTIVO"),
  amount: z.number().min(0).optional(),
  notes: z.string().optional(),
});

peluqueriaRouter.post("/appointments/:id/complete", async (req, res) => {
  try {
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos de cobro inválidos", errors: parsed.error.flatten() });
      return;
    }

    const completed = await GroomingAppointmentsService.completeAndCollect(req.params.id, parsed.data);
    res.json(completed);
  } catch (error: any) {
    console.error("Error completing appointment:", error);
    res.status(400).json({ message: error.message || "Error al completar y cobrar cita" });
  }
});

// Delete Appointment
peluqueriaRouter.delete("/appointments/:id", async (req, res) => {
  try {
    await GroomingAppointmentsService.deleteAppointment(req.params.id);
    res.json({ ok: true, message: "Cita eliminada" });
  } catch (error: any) {
    console.error("Error deleting appointment:", error);
    res.status(400).json({ message: error.message || "Error al eliminar cita" });
  }
});
