import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../db";

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

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
  const { search, status } = req.query as Record<string, string>;
  const where: Record<string, unknown> = {};
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
  const clients = await prisma.client.findMany({
    where,
    include: { pets: { where: { isActive: true }, select: { id: true, name: true, species: true, breed: true } } },
    orderBy: { lastName: "asc" },
  });
  res.json(clients);
});

clientsRouter.get("/:id", async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
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
});

clientsRouter.post("/", async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
    return;
  }
  const { birthdate, firstServiceDate, email, ...rest } = parsed.data;
  const client = await prisma.client.create({
    data: {
      ...rest,
      email: email || null,
      birthdate: birthdate ? new Date(birthdate) : null,
      firstServiceDate: firstServiceDate ? new Date(firstServiceDate) : null,
    },
  });
  res.status(201).json(client);
});

clientsRouter.put("/:id", async (req, res) => {
  const parsed = clientSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Datos inválidos" });
    return;
  }
  const { birthdate, firstServiceDate, email, ...rest } = parsed.data;
  const client = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      email: email !== undefined ? (email || null) : undefined,
      birthdate: birthdate !== undefined ? (birthdate ? new Date(birthdate) : null) : undefined,
      firstServiceDate: firstServiceDate !== undefined ? (firstServiceDate ? new Date(firstServiceDate) : null) : undefined,
    },
  });
  res.json(client);
});

clientsRouter.delete("/:id", async (req, res) => {
  await prisma.client.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ ok: true });
});
