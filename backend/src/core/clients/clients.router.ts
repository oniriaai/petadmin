import { Router } from "express";
import { z } from "zod";
import { handleAuthzError } from "../../middleware/auth";
import { buildDaycareWhere, getRequiredDaycareId } from "../../core/tenancy/scope";
import { readPage, sendPage } from "../../utils/pagination";
import { prisma } from "../../db";

export const clientsRouter = Router();

const clientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  idNumber: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  language: z.string().optional(),
  birthdate: z.string().optional(),
  notes: z.string().optional(),
  firstServiceDate: z.string().optional(),
});

clientsRouter.get("/", async (req, res) => {
  try {
  const { search, status } = req.query as Record<string, string>;
  const where: Record<string, unknown> = { ...buildDaycareWhere(req) };
  if (status === "active") where.isActive = true;
  else if (status === "inactive") where.isActive = false;
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
    ];
  }
  // Bounded, but the bare array is preserved for callers that have no pager: CheckInOutForm,
  // NuevaReservaModal and RecurringPlanForm all load this into a <select>, and a silently
  // truncated picker is a worse bug than a slow query. See utils/pagination.ts.
  const page = readPage(req);
  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: { pets: { where: { isActive: true }, select: { id: true, name: true, species: true, breed: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.client.count({ where }),
  ]);
  sendPage(res, page, clients, total);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

clientsRouter.get("/:id", async (req, res) => {
  try {
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, ...buildDaycareWhere(req) },
    include: {
      pets: { include: { vaccinations: true, documents: true } },
      reservations: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { pets: { include: { pet: { select: { name: true } } } }, room: { select: { name: true } } },
      },
      contracts: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!client) {
    res.status(404).json({ message: "Cliente no encontrado" });
    return;
  }
  res.json(client);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

clientsRouter.post("/", async (req, res) => {
  try {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
    return;
  }
  const { birthdate, firstServiceDate, email, ...rest } = parsed.data;
  const client = await prisma.client.create({
    data: {
      ...rest,
      daycareId: getRequiredDaycareId(req),
      email: email || null,
      birthdate: birthdate ? new Date(birthdate) : null,
      firstServiceDate: firstServiceDate ? new Date(firstServiceDate) : null,
    },
  });
  res.status(201).json(client);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

clientsRouter.put("/:id", async (req, res) => {
  try {
  const parsed = clientSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Datos inválidos" });
    return;
  }
  const existing = await prisma.client.findFirst({
    where: { id: req.params.id, ...buildDaycareWhere(req) },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ message: "Cliente no encontrado" });
    return;
  }
  const { birthdate, firstServiceDate, email, ...rest } = parsed.data;
  const client = await prisma.client.update({
    where: { id: existing.id },
    data: {
      ...rest,
      email: email !== undefined ? (email || null) : undefined,
      birthdate: birthdate !== undefined ? (birthdate ? new Date(birthdate) : null) : undefined,
      firstServiceDate: firstServiceDate !== undefined ? (firstServiceDate ? new Date(firstServiceDate) : null) : undefined,
    },
  });
  res.json(client);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

clientsRouter.delete("/:id", async (req, res) => {
  try {
    const existing = await prisma.client.findFirst({
      where: { id: req.params.id, ...buildDaycareWhere(req) },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ message: "Cliente no encontrado" });
      return;
    }
    await prisma.client.update({ where: { id: existing.id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
