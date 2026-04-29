import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const providersRouter = Router();
providersRouter.use(requireAuth);

const schema = z.object({
  bannerId: z.string().optional(),
  name: z.string().min(1),
  idNumber: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  product: z.string().optional(),
  isActive: z.boolean().optional(),
});

providersRouter.get("/", async (req, res) => {
  const { search, status } = req.query as Record<string, string>;
  const where: Record<string, unknown> = {};
  if (status === "active") where.isActive = true;
  else if (status === "inactive") where.isActive = false;
  if (search) where.OR = [
    { name: { contains: search, mode: "insensitive" } },
    { product: { contains: search, mode: "insensitive" } },
  ];
  const providers = await prisma.provider.findMany({ where, orderBy: { name: "asc" } });
  res.json(providers);
});

providersRouter.get("/:id", async (req, res) => {
  const p = await prisma.provider.findUnique({
    where: { id: req.params.id },
    include: { payables: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!p) { res.status(404).json({ message: "Proveedor no encontrado" }); return; }
  res.json(p);
});

providersRouter.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const { email, ...rest } = parsed.data;
  const p = await prisma.provider.create({ data: { ...rest, email: email || null } });
  res.status(201).json(p);
});

providersRouter.put("/:id", async (req, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const { email, ...rest } = parsed.data;
  const p = await prisma.provider.update({ where: { id: req.params.id }, data: { ...rest, email: email !== undefined ? (email || null) : undefined } });
  res.json(p);
});

providersRouter.delete("/:id", async (req, res) => {
  await prisma.provider.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ ok: true });
});
