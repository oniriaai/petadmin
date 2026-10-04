import { Router } from "express";
import { z } from "zod";
import { handleAuthzError } from "../../middleware/auth";
import { buildChildScopeWhere, buildDaycareWhere } from "../../core/tenancy/scope";
import { readPage, sendPage } from "../../utils/pagination";
import { prisma } from "../../db";

export const petsRouter = Router();

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
  try {
    const { search, clientId, species } = req.query as Record<string, string>;
    const where: Record<string, unknown> = { isActive: true, ...buildDaycareWhere(req) };
    if (clientId) where.clientId = clientId;
    if (species) where.species = species;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { breed: { contains: search, mode: "insensitive" } },
        { microchip: { contains: search } },
      ];
    }
    // Bare array by default, as for clients: HerramientasPage loads this whole list.
    const page = readPage(req);
    const [pets, total] = await Promise.all([
      prisma.pet.findMany({
        where,
        include: {
          client: { select: { id: true, firstName: true, lastName: true, phone: true } },
          vaccinations: true,
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: page.skip,
        take: page.take,
      }),
      prisma.pet.count({ where }),
    ]);
    sendPage(res, page, pets, total);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

petsRouter.get("/:id", async (req, res) => {
  try {
    const pet = await prisma.pet.findFirst({
      where: { id: req.params.id, ...buildDaycareWhere(req) },
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
    if (!pet) {
      res.status(404).json({ message: "Animal no encontrado" });
      return;
    }
    res.json(pet);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

petsRouter.post("/", async (req, res) => {
  try {
    const parsed = petSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      return;
    }
    const { birthdate, ...rest } = parsed.data;

    // A pet inherits its tenant from its owner, so pet.daycareId always matches
    // client.daycareId, and a client from another tenant simply does not exist here.
    const owner = await prisma.client.findFirst({
      where: { id: rest.clientId, ...buildDaycareWhere(req) },
      select: { daycareId: true },
    });
    if (!owner) {
      res.status(404).json({ message: "Cliente no encontrado" });
      return;
    }

    const pet = await prisma.pet.create({
      data: {
        ...rest,
        daycareId: owner.daycareId,
        birthdate: birthdate ? new Date(birthdate) : null,
      },
    });
    res.status(201).json(pet);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

petsRouter.put("/:id", async (req, res) => {
  try {
    const parsed = petSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos" });
      return;
    }
    const existing = await prisma.pet.findFirst({
      where: { id: req.params.id, ...buildDaycareWhere(req) },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ message: "Animal no encontrado" });
      return;
    }
    const { birthdate, clientId, ...rest } = parsed.data;

    // Reassigning an owner may not move the pet to another tenant.
    if (clientId) {
      const owner = await prisma.client.findFirst({
        where: { id: clientId, ...buildDaycareWhere(req) },
        select: { id: true },
      });
      if (!owner) {
        res.status(404).json({ message: "Cliente no encontrado" });
        return;
      }
    }

    const pet = await prisma.pet.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(clientId ? { clientId } : {}),
        birthdate: birthdate !== undefined ? (birthdate ? new Date(birthdate) : null) : undefined,
      },
    });
    res.json(pet);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

petsRouter.delete("/:id", async (req, res) => {
  try {
    const existing = await prisma.pet.findFirst({
      where: { id: req.params.id, ...buildDaycareWhere(req) },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ message: "Animal no encontrado" });
      return;
    }
    await prisma.pet.update({ where: { id: existing.id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

const vaccinationSchema = z.object({
  name: z.string().min(1),
  date: z.string(),
  nextDue: z.string().optional(),
  notes: z.string().optional(),
});

petsRouter.post("/:id/vaccinations", async (req, res) => {
  try {
    const parsed = vaccinationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos" });
      return;
    }
    // PetVaccination has no daycareId of its own; it inherits tenancy through its pet, so the
    // pet must be verified before writing.
    const pet = await prisma.pet.findFirst({
      where: { id: req.params.id, ...buildDaycareWhere(req) },
      select: { id: true },
    });
    if (!pet) {
      res.status(404).json({ message: "Animal no encontrado" });
      return;
    }
    const { date, nextDue, ...rest } = parsed.data;
    const vaccination = await prisma.petVaccination.create({
      data: {
        petId: pet.id,
        date: new Date(date),
        nextDue: nextDue ? new Date(nextDue) : null,
        ...rest,
      },
    });
    res.status(201).json(vaccination);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

petsRouter.delete("/:id/vaccinations/:vid", async (req, res) => {
  try {
    const { deleted } = await prisma.petVaccination
      .deleteMany({
        where: {
          id: req.params.vid,
          petId: req.params.id,
          ...buildChildScopeWhere(req, "pet"),
        },
      })
      .then((result) => ({ deleted: result.count }));
    if (deleted === 0) {
      res.status(404).json({ message: "Vacuna no encontrada" });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
