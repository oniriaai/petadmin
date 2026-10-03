import { Router } from "express";
import { z } from "zod";
import { getRequiredBusinessUnit, handleAuthzError } from "../../middleware/auth";
import { prisma } from "../../db";
import {
  assertRecordAccess,
  buildScopeWhere,
  getRequiredDaycareId,
} from "../../core/tenancy/scope";
import { readPage, sendPage } from "../../utils/pagination";
import {
  cancelFuturePendingReservationsForPlan,
  syncFuturePendingReservationsForPlan,
} from "./recurring-plans.service";

export const recurringPlansRouter = Router();

const recurringPlanSchema = z.object({
  clientId: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Hora inválida"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Hora inválida"),
  daysOfWeek: z.string().min(1, "Selecciona al menos un día"),
  petIds: z.string().min(1, "Selecciona al menos una mascota"),
  service: z.string().default("GUARDERIA"),
  roomId: z.string().optional(),
  notes: z.string().optional(),
});

recurringPlansRouter.get("/", async (req, res) => {
  try {
    const { status, clientId } = req.query as Record<string, string>;

    const where: Record<string, unknown> = buildScopeWhere(req);
    if (status === "active") where.isActive = true;
    else if (status === "inactive") where.isActive = false;
    if (clientId) where.clientId = clientId;

    const page = readPage(req);
    const [plans, total] = await Promise.all([
      prisma.recurringPlan.findMany({
        where,
        include: {
          client: { select: { id: true, firstName: true, lastName: true } },
          room: { select: { id: true, name: true } },
          reservations: { select: { id: true, checkIn: true, checkOut: true, status: true } },
        },
        orderBy: [{ startDate: "desc" }, { id: "desc" }],
        skip: page.skip,
        take: page.take,
      }),
      prisma.recurringPlan.count({ where }),
    ]);
    sendPage(res, page, plans, total);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

recurringPlansRouter.get("/:id", async (req, res) => {
  try {
    const plan = await prisma.recurringPlan.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        room: true,
        reservations: { include: { pets: { include: { pet: true } }, client: true } },
      },
    });
    if (!plan) {
      res.status(404).json({ message: "Plan no encontrado" });
      return;
    }
    assertRecordAccess(req, plan);
    res.json(plan);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

recurringPlansRouter.post("/", async (req, res) => {
  const parsed = recurringPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
    return;
  }

  try {
    const bu = getRequiredBusinessUnit(req, req.body?.businessUnit);
    const {
      clientId,
      startDate,
      endDate,
      startTime,
      endTime,
      daysOfWeek,
      petIds,
      service,
      roomId,
      notes,
    } = parsed.data;
    if (endTime <= startTime) {
      res.status(400).json({ message: "La hora de salida debe ser mayor a la hora de entrada" });
      return;
    }

    // Verify client exists and belongs to business unit
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      res.status(404).json({ message: "Cliente no encontrado" });
      return;
    }

    // Verify room exists if provided
    if (roomId) {
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) {
        res.status(404).json({ message: "Sala no encontrada" });
        return;
      }
      if (room.businessUnit !== bu) {
        res.status(400).json({ message: "La sala no pertenece a la unidad seleccionada" });
        return;
      }
    }

    const plan = await prisma.recurringPlan.create({
      data: {
        businessUnit: bu,
        daycareId: getRequiredDaycareId(req),
        clientId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        startTime,
        endTime,
        daysOfWeek,
        petIds,
        service,
        roomId: roomId || null,
        notes,
        isActive: true,
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        room: { select: { id: true, name: true } },
      },
    });
    res.status(201).json(plan);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

recurringPlansRouter.put("/:id", async (req, res) => {
  try {
    const parsed = recurringPlanSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos" });
      return;
    }

    const plan = await prisma.recurringPlan.findUnique({ where: { id: req.params.id } });
    if (!plan) {
      res.status(404).json({ message: "Plan no encontrado" });
      return;
    }
    assertRecordAccess(req, plan);

    const { roomId, clientId, startDate, endDate, startTime, endTime, ...rest } = parsed.data;
    const effectiveStartTime = startTime ?? plan.startTime;
    const effectiveEndTime = endTime ?? plan.endTime;
    if (effectiveEndTime <= effectiveStartTime) {
      res.status(400).json({ message: "La hora de salida debe ser mayor a la hora de entrada" });
      return;
    }

    // Verify room exists if provided
    if (roomId) {
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) {
        res.status(404).json({ message: "Sala no encontrada" });
        return;
      }
      if (room.businessUnit !== plan.businessUnit) {
        res.status(400).json({ message: "La sala no pertenece a la unidad del plan" });
        return;
      }
    }

    // Verify client exists if changing
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!client) {
        res.status(404).json({ message: "Cliente no encontrado" });
        return;
      }
    }

    const updated = await prisma.recurringPlan.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(startTime && { startTime }),
        ...(endTime && { endTime }),
        ...(clientId && { clientId }),
        ...(roomId !== undefined && { roomId: roomId || null }),
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        room: { select: { id: true, name: true } },
        reservations: { select: { id: true, status: true } },
      },
    });

    await syncFuturePendingReservationsForPlan(updated.id);
    res.json(updated);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

recurringPlansRouter.patch("/:id/status", async (req, res) => {
  try {
    const { isActive } = req.body;
    const current = await prisma.recurringPlan.findUnique({
      where: { id: req.params.id },
      select: { businessUnit: true, daycareId: true },
    });
    if (!current) {
      res.status(404).json({ message: "Plan no encontrado" });
      return;
    }
    assertRecordAccess(req, current);
    const plan = await prisma.recurringPlan.update({
      where: { id: req.params.id },
      data: { isActive },
    });
    if (isActive === false) {
      await cancelFuturePendingReservationsForPlan(plan.id);
    }
    res.json(plan);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

recurringPlansRouter.delete("/:id", async (req, res) => {
  try {
    const current = await prisma.recurringPlan.findUnique({
      where: { id: req.params.id },
      select: { businessUnit: true, daycareId: true },
    });
    if (!current) {
      res.status(404).json({ message: "Plan no encontrado" });
      return;
    }
    assertRecordAccess(req, current);
    await cancelFuturePendingReservationsForPlan(req.params.id);
    // Soft delete by marking as inactive
    await prisma.recurringPlan.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
