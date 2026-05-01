import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const petsRouter = Router();
petsRouter.use(requireAuth);

const petSchema = z.object({
  clientId: z.string(),
  name: z.string().min(1),
  species: z.string().default("dog"),
  breed: z.string().optional(),
  variety: z.string().optional(),
  color: z.string().optional(),
  sex: z.enum(["M", "F"]),
  birthdate: z.string().optional(),
  weight: z.number().optional(),
  height: z.number().optional(),
  microchip: z.string().optional(),
  isNeutered: z.boolean().optional(),
  allergies: z.string().optional(),
  notes: z.string().optional(),
  bannerId: z.string().optional(),
  photoUrl: z.string().url().optional().or(z.literal("")),
});

petsRouter.get("/", async (req, res) => {
  const { search, clientId, species } = req.query as Record<string, string>;
  const where: Record<string, unknown> = { isActive: true };
  if (clientId) where.clientId = clientId;
  if (species) where.species = species;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { breed: { contains: search, mode: "insensitive" } },
      { microchip: { contains: search } },
    ];
  }
  const pets = await prisma.pet.findMany({
    where,
    include: { client: { select: { id: true, firstName: true, lastName: true, phone: true } }, vaccinations: true },
    orderBy: { name: "asc" },
  });
  res.json(pets);
});

petsRouter.get("/:id", async (req, res) => {
  const pet = await prisma.pet.findUnique({
    where: { id: req.params.id },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      vaccinations: { orderBy: { date: "desc" } },
      documents: { orderBy: { uploadedAt: "desc" } },
      alerts: { where: { isResolved: false }, orderBy: { createdAt: "desc" } },
      reservationPets: {
        include: { reservation: { include: { room: { select: { name: true } } } } },
        orderBy: { reservation: { createdAt: "desc" } },
        take: 10,
      },
    },
  });
  if (!pet) { res.status(404).json({ message: "Animal no encontrado" }); return; }
  res.json(pet);
});

petsRouter.post("/", async (req, res) => {
  const parsed = petSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() }); return; }
  const { birthdate, ...rest } = parsed.data;
  const pet = await prisma.pet.create({
    data: { ...rest, birthdate: birthdate ? new Date(birthdate) : null },
  });
  res.status(201).json(pet);
});

petsRouter.put("/:id", async (req, res) => {
  const parsed = petSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const { birthdate, ...rest } = parsed.data;
  const pet = await prisma.pet.update({
    where: { id: req.params.id },
    data: { ...rest, birthdate: birthdate !== undefined ? (birthdate ? new Date(birthdate) : null) : undefined },
  });
  res.json(pet);
});

petsRouter.delete("/:id", async (req, res) => {
  await prisma.pet.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ ok: true });
});

const vaccinationSchema = z.object({
  name: z.string().min(1),
  date: z.string(),
  nextDue: z.string().optional(),
  notes: z.string().optional(),
});

petsRouter.post("/:id/vaccinations", async (req, res) => {
  const parsed = vaccinationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const { date, nextDue, ...rest } = parsed.data;
  const v = await prisma.petVaccination.create({
    data: { petId: req.params.id, date: new Date(date), nextDue: nextDue ? new Date(nextDue) : null, ...rest },
  });
  res.status(201).json(v);
});

petsRouter.delete("/:id/vaccinations/:vid", async (req, res) => {
  await prisma.petVaccination.delete({ where: { id: req.params.vid } });
  res.json({ ok: true });
});
