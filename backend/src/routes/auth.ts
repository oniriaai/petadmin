import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db";
import { normalizeUserRole } from "../middleware/auth";

export const authRouter = Router();

const loginSchema = z.object({
  businessUnit: z.enum(["KINDERDOG", "PETHIJOS"]).optional(),
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Datos inválidos" });
    return;
  }

  const { businessUnit, username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !user.isActive || !bcrypt.compareSync(password, user.passwordHash)) {
    res.status(401).json({ message: "Credenciales incorrectas" });
    return;
  }

  const role = normalizeUserRole(user.role, user.businessUnit);
  if (!role) {
    res.status(403).json({ message: "Rol no autorizado" });
    return;
  }

  if (role !== "admin" && businessUnit && businessUnit !== user.businessUnit) {
    res.status(401).json({ message: "Credenciales incorrectas" });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, businessUnit: user.businessUnit, role },
    process.env.JWT_SECRET ?? "change_me",
    { expiresIn: "12h" }
  );

  res.json({ token, user: { id: user.id, username: user.username, name: user.name, businessUnit: user.businessUnit, role } });
});
