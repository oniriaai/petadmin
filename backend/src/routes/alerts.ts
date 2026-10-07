import { Router } from "express";
import { z } from "zod";
import { getRequiredBusinessUnit, handleAuthzError } from "../middleware/auth";
import { prisma } from "../db";
import { assertRecordAccess, buildScopeWhere, getRequiredDaycareId } from "../core/tenancy/scope";
import { readPage, sendPage } from "../utils/pagination";

export const alertsRouter = Router();

const schema = z.object({
  petId: z.string().optional(),
  type: z.string(),
  severity: z.enum(["ALTA", "MEDIA", "BAJA"]).default("MEDIA"),
  title: z.string().min(1),
  description: z.string().min(1),
});

alertsRouter.get("/", async (req, res) => {
  try {
    const { resolved, severity } = req.query as Record<string, string>;
    const where: Record<string, unknown> = buildScopeWhere(req);
    if (resolved === "true") where.isResolved = true;
    else if (resolved === "false") where.isResolved = false;
    if (severity) where.severity = severity;
    const page = readPage(req);
    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        include: {
          pet: {
            select: {
              id: true,
              name: true,
              client: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ isResolved: "asc" }, { severity: "asc" }, { createdAt: "desc" }],
        skip: page.skip,
        take: page.take,
      }),
      prisma.alert.count({ where }),
    ]);
    sendPage(res, page, alerts, total);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

alertsRouter.post("/", async (req, res) => {
  try {
    const bu = getRequiredBusinessUnit(req, req.body?.businessUnit);
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos" });
      return;
    }
    // petId comes from the request body: resolved against this daycare before it is stored,
    // or the alert list would show another tenant's pet and tutor by name.
    const daycareId = getRequiredDaycareId(req);
    if (parsed.data.petId) {
      const pet = await prisma.pet.findFirst({
        where: { id: parsed.data.petId, daycareId },
        select: { id: true },
      });
      if (!pet) {
        res.status(404).json({ message: "Animal no encontrado" });
        return;
      }
    }
    const alert = await prisma.alert.create({
      data: { ...parsed.data, businessUnit: bu, daycareId },
    });
    res.status(201).json(alert);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

alertsRouter.patch("/:id/resolve", async (req, res) => {
  try {
    const existing = await prisma.alert.findUnique({
      where: { id: req.params.id },
      select: { businessUnit: true, daycareId: true },
    });
    if (!existing) {
      res.status(404).json({ message: "Alerta no encontrada" });
      return;
    }
    assertRecordAccess(req, existing);
    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data: { isResolved: true, resolvedAt: new Date() },
    });
    res.json(alert);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

alertsRouter.delete("/:id", async (req, res) => {
  try {
    const existing = await prisma.alert.findUnique({
      where: { id: req.params.id },
      select: { businessUnit: true, daycareId: true },
    });
    if (!existing) {
      res.status(404).json({ message: "Alerta no encontrada" });
      return;
    }
    assertRecordAccess(req, existing);
    await prisma.alert.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
