import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

const itemSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().default("unidad"),
  minStock: z.number().min(0).default(0),
  currentStock: z.number().min(0).default(0),
  unitCost: z.number().min(0).default(0),
});

inventoryRouter.get("/items", async (req, res) => {
  const bu = req.user!.businessUnit;
  const { lowStock } = req.query as Record<string, string>;
  const items = await prisma.inventoryItem.findMany({
    where: { businessUnit: bu, isActive: true },
    orderBy: { name: "asc" },
  });
  const result = lowStock === "true" ? items.filter(i => i.currentStock <= i.minStock) : items;
  res.json(result);
});

inventoryRouter.post("/items", async (req, res) => {
  const bu = req.user!.businessUnit;
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const item = await prisma.inventoryItem.create({ data: { ...parsed.data, businessUnit: bu } });
  res.status(201).json(item);
});

inventoryRouter.put("/items/:id", async (req, res) => {
  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(item);
});

inventoryRouter.delete("/items/:id", async (req, res) => {
  await prisma.inventoryItem.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ ok: true });
});

const movementSchema = z.object({
  type: z.enum(["ENTRADA", "SALIDA", "AJUSTE"]),
  quantity: z.number(),
  cost: z.number().optional(),
  reason: z.string().optional(),
  date: z.string().optional(),
});

inventoryRouter.get("/items/:id/movements", async (req, res) => {
  const movements = await prisma.inventoryMovement.findMany({
    where: { itemId: req.params.id },
    orderBy: { date: "desc" },
  });
  res.json(movements);
});

inventoryRouter.post("/items/:id/movements", async (req, res) => {
  const parsed = movementSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const { date, type, quantity, ...rest } = parsed.data;

  const movement = await prisma.inventoryMovement.create({
    data: { itemId: req.params.id, type, quantity, date: date ? new Date(date) : new Date(), ...rest },
  });

  const delta = type === "SALIDA" ? -quantity : type === "AJUSTE" ? quantity - (await prisma.inventoryItem.findUnique({ where: { id: req.params.id } }))!.currentStock : quantity;
  if (type === "AJUSTE") {
    await prisma.inventoryItem.update({ where: { id: req.params.id }, data: { currentStock: quantity } });
  } else {
    await prisma.inventoryItem.update({ where: { id: req.params.id }, data: { currentStock: { increment: delta } } });
  }

  res.status(201).json(movement);
});
