import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const contractsRouter = Router();
contractsRouter.use(requireAuth);

const schema = z.object({
  clientId: z.string(),
  petId: z.string().optional(),
  name: z.string().min(1),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

contractsRouter.get("/", async (req, res) => {
  const bu = req.user!.businessUnit;
  const { status } = req.query as Record<string, string>;
  const where: Record<string, unknown> = { businessUnit: bu };
  if (status) where.status = status;
  const contracts = await prisma.contract.findMany({
    where,
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      pet: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(contracts);
});

contractsRouter.post("/", async (req, res) => {
  const bu = req.user!.businessUnit;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const { startDate, endDate, ...rest } = parsed.data;
  const contract = await prisma.contract.create({
    data: {
      ...rest,
      businessUnit: bu,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
    include: { client: { select: { firstName: true, lastName: true } }, pet: { select: { name: true } } },
  });
  res.status(201).json(contract);
});

contractsRouter.patch("/:id/status", async (req, res) => {
  const { status } = req.body;
  const contract = await prisma.contract.update({ where: { id: req.params.id }, data: { status } });
  res.json(contract);
});

contractsRouter.delete("/:id", async (req, res) => {
  await prisma.contract.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
