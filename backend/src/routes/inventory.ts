import { Router } from "express";
import { z } from "zod";
import { getRequiredBusinessUnit, handleAuthzError } from "../middleware/auth";
import { prisma } from "../db";
import { assertRecordAccess, buildScopeWhere, getRequiredDaycareId } from "../core/tenancy/scope";
import { DEFAULT_LIMIT, readPage, sendPage } from "../utils/pagination";
import { recordStockMovement } from "../core/inventory/stock";

export const inventoryRouter = Router();

const itemSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().default("unidad"),
  minStock: z.number().min(0).default(0),
  currentStock: z.number().min(0).default(0),
  unitCost: z.number().min(0).default(0),
  isControlled: z.boolean().optional(),
});

inventoryRouter.get("/items", async (req, res) => {
  try {
    const { lowStock } = req.query as Record<string, string>;
    // Bounded but deliberately NOT paginated. `lowStock` is applied below in JS because it is a
    // column-to-column comparison (`currentStock <= minStock`) that Prisma cannot express in a
    // `where`; filtering after a page has been taken would return a short page and a total that
    // disagrees with it. A tenant's stock list is small, so a cap is the right trade here —
    // moving the filter into the query would mean raw SQL, outside the tenancy helpers.
    const items = await prisma.inventoryItem.findMany({
      where: { ...buildScopeWhere(req), isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: DEFAULT_LIMIT,
    });
    const result = lowStock === "true" ? items.filter((i) => i.currentStock <= i.minStock) : items;
    res.json(result);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

inventoryRouter.post("/items", async (req, res) => {
  try {
    const bu = getRequiredBusinessUnit(req, req.body?.businessUnit);
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos" });
      return;
    }
    const item = await prisma.inventoryItem.create({
      data: { ...parsed.data, businessUnit: bu, daycareId: getRequiredDaycareId(req) },
    });
    res.status(201).json(item);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

inventoryRouter.put("/items/:id", async (req, res) => {
  try {
    const parsed = itemSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos" });
      return;
    }
    const current = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id },
      select: { businessUnit: true, daycareId: true },
    });
    if (!current) {
      res.status(404).json({ message: "Item no encontrado" });
      return;
    }
    assertRecordAccess(req, current);
    const item = await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(item);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

inventoryRouter.delete("/items/:id", async (req, res) => {
  try {
    const current = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id },
      select: { businessUnit: true, daycareId: true },
    });
    if (!current) {
      res.status(404).json({ message: "Item no encontrado" });
      return;
    }
    assertRecordAccess(req, current);
    await prisma.inventoryItem.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

const movementSchema = z.object({
  type: z.enum(["ENTRADA", "SALIDA", "AJUSTE"]),
  quantity: z.number(),
  cost: z.number().optional(),
  reason: z.string().optional(),
  date: z.string().optional(),
  lotNumber: z.string().trim().max(80).optional(),
  expiresAt: z.string().optional(),
});

inventoryRouter.get("/items/:id/movements", async (req, res) => {
  try {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id },
      select: { businessUnit: true, daycareId: true },
    });
    if (!item) {
      res.status(404).json({ message: "Item no encontrado" });
      return;
    }
    assertRecordAccess(req, item);
    // Newest first and capped like every other list: a product dispensed daily accumulates
    // movements for as long as the tenant exists.
    const page = readPage(req);
    const where = { itemId: req.params.id };
    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        orderBy: [{ date: "desc" }, { id: "desc" }],
        skip: page.skip,
        take: page.take,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);
    sendPage(res, page, movements, total);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

inventoryRouter.post("/items/:id/movements", async (req, res) => {
  try {
    const parsed = movementSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos" });
      return;
    }
    const { date, expiresAt, ...rest } = parsed.data;
    const item = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id },
      select: { businessUnit: true, daycareId: true },
    });
    if (!item) {
      res.status(404).json({ message: "Item no encontrado" });
      return;
    }
    assertRecordAccess(req, item);

    // One transaction: the movement and the stock level it implies succeed or fail together.
    const movement = await prisma.$transaction((tx) =>
      recordStockMovement(tx, {
        ...rest,
        daycareId: item.daycareId,
        itemId: req.params.id,
        date: date ? new Date(date) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      }),
    );

    res.status(201).json(movement);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
