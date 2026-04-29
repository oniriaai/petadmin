import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const alertsRouter = Router();
alertsRouter.use(requireAuth);

const schema = z.object({
  petId: z.string().optional(),
  type: z.string(),
  severity: z.enum(["ALTA", "MEDIA", "BAJA"]).default("MEDIA"),
  title: z.string().min(1),
  description: z.string().min(1),
});

alertsRouter.get("/", async (req, res) => {
  const bu = req.user!.businessUnit;
  const { resolved, severity } = req.query as Record<string, string>;
  const where: Record<string, unknown> = { businessUnit: bu };
  if (resolved === "true") where.isResolved = true;
  else if (resolved === "false") where.isResolved = false;
  if (severity) where.severity = severity;
  const alerts = await prisma.alert.findMany({
    where,
    include: { pet: { select: { id: true, name: true, client: { select: { firstName: true, lastName: true } } } } },
    orderBy: [{ isResolved: "asc" }, { severity: "asc" }, { createdAt: "desc" }],
  });
  res.json(alerts);
});

alertsRouter.post("/", async (req, res) => {
  const bu = req.user!.businessUnit;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const alert = await prisma.alert.create({ data: { ...parsed.data, businessUnit: bu } });
  res.status(201).json(alert);
});

alertsRouter.patch("/:id/resolve", async (req, res) => {
  const alert = await prisma.alert.update({
    where: { id: req.params.id },
    data: { isResolved: true, resolvedAt: new Date() },
  });
  res.json(alert);
});

alertsRouter.delete("/:id", async (req, res) => {
  await prisma.alert.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
