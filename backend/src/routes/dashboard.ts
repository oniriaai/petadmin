import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/summary", async (req, res) => {
  const bu = req.user!.businessUnit;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [reservasHoy, activas, entradas, salidas, ingresosHoy, alertas, proximasReservas] = await Promise.all([
    prisma.reservation.count({ where: { businessUnit: bu, checkIn: { gte: todayStart, lte: todayEnd } } }),
    prisma.reservation.count({ where: { businessUnit: bu, status: "ACTIVA" } }),
    prisma.reservation.count({ where: { businessUnit: bu, status: { in: ["CONFIRMADA", "ACTIVA"] }, checkIn: { gte: todayStart, lte: todayEnd } } }),
    prisma.reservation.count({ where: { businessUnit: bu, status: "ACTIVA", checkOut: { gte: todayStart, lte: todayEnd } } }),
    prisma.income.aggregate({ where: { businessUnit: bu, date: { gte: todayStart, lte: todayEnd } }, _sum: { total: true } }),
    prisma.alert.findMany({ where: { businessUnit: bu, isResolved: false }, orderBy: [{ severity: "asc" }, { createdAt: "desc" }], take: 5, include: { pet: { select: { name: true } } } }),
    prisma.reservation.findMany({
      where: { businessUnit: bu, status: { in: ["PENDIENTE", "CONFIRMADA"] }, checkIn: { gte: todayStart } },
      take: 8,
      orderBy: { checkIn: "asc" },
      include: { client: { select: { firstName: true, lastName: true } }, pets: { include: { pet: { select: { name: true } } } }, room: { select: { name: true } } },
    }),
  ]);

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const ingresosMes = await prisma.income.aggregate({ where: { businessUnit: bu, date: { gte: monthStart } }, _sum: { total: true } });
  const totalClientes = await prisma.client.count({ where: { isActive: true } });

  res.json({
    reservasHoy,
    activas,
    entradas,
    salidas,
    ingresosHoy: ingresosHoy._sum.total ?? 0,
    ingresosMes: ingresosMes._sum.total ?? 0,
    totalClientes,
    alertas: alertas.map(a => ({ id: a.id, severity: a.severity, title: a.title, pet: a.pet?.name })),
    proximasReservas: proximasReservas.map(r => ({
      id: r.id,
      cliente: `${r.client.firstName} ${r.client.lastName}`,
      mascotas: r.pets.map(p => p.pet.name).join(", "),
      servicio: r.service,
      estado: r.status,
      checkIn: r.checkIn,
      sala: r.room?.name,
    })),
  });
});
