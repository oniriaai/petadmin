import { Router } from "express";
import { z } from "zod";
import { handleAuthzError } from "../middleware/auth";
import { buildDaycareWhere, getRequiredDaycareId } from "../core/tenancy/scope";
import { readPage, sendPage } from "../utils/pagination";
import { prisma } from "../db";

export const providersRouter = Router();

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
  try {
    const { search, status } = req.query as Record<string, string>;
    const where: Record<string, unknown> = { ...buildDaycareWhere(req) };
    if (status === "active") where.isActive = true;
    else if (status === "inactive") where.isActive = false;
    if (search) where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { product: { contains: search, mode: "insensitive" } },
    ];
    const page = readPage(req);
    const [providers, total] = await Promise.all([
      prisma.provider.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: page.skip,
        take: page.take,
      }),
      prisma.provider.count({ where }),
    ]);
    sendPage(res, page, providers, total);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

providersRouter.get("/:id", async (req, res) => {
  try {
    // findFirst with the tenant filter, not findUnique: another tenant's provider must read
    // as absent rather than forbidden, so ids are not confirmed across tenants.
    const p = await prisma.provider.findFirst({
      where: { id: req.params.id, ...buildDaycareWhere(req) },
      include: { payables: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    if (!p) { res.status(404).json({ message: "Proveedor no encontrado" }); return; }
    res.json(p);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

providersRouter.post("/", async (req, res) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
    const { email, ...rest } = parsed.data;
    const p = await prisma.provider.create({
      data: { ...rest, email: email || null, daycareId: getRequiredDaycareId(req) },
    });
    res.status(201).json(p);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

providersRouter.put("/:id", async (req, res) => {
  try {
    const parsed = schema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
    const existing = await prisma.provider.findFirst({
      where: { id: req.params.id, ...buildDaycareWhere(req) },
      select: { id: true },
    });
    if (!existing) { res.status(404).json({ message: "Proveedor no encontrado" }); return; }
    const { email, ...rest } = parsed.data;
    const p = await prisma.provider.update({
      where: { id: existing.id },
      data: { ...rest, email: email !== undefined ? (email || null) : undefined },
    });
    res.json(p);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

providersRouter.delete("/:id", async (req, res) => {
  try {
    const existing = await prisma.provider.findFirst({
      where: { id: req.params.id, ...buildDaycareWhere(req) },
      select: { id: true },
    });
    if (!existing) { res.status(404).json({ message: "Proveedor no encontrado" }); return; }
    await prisma.provider.update({ where: { id: existing.id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
