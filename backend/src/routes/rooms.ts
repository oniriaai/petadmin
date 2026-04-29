import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const roomsRouter = Router();
roomsRouter.use(requireAuth);

const schema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1),
  type: z.string(),
  isActive: z.boolean().optional(),
});

roomsRouter.get("/", async (req, res) => {
  const bu = req.user!.businessUnit;
  const rooms = await prisma.room.findMany({
    where: { businessUnit: bu, isActive: true },
    orderBy: { name: "asc" },
  });
  res.json(rooms);
});

roomsRouter.post("/", async (req, res) => {
  const bu = req.user!.businessUnit;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const room = await prisma.room.create({ data: { ...parsed.data, businessUnit: bu } });
  res.status(201).json(room);
});

roomsRouter.put("/:id", async (req, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Datos inválidos" }); return; }
  const room = await prisma.room.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(room);
});
