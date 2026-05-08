import { Router } from "express";
import { buildBusinessUnitWhere, handleAuthzError, requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get("/incomes", async (req, res) => {
  try {
  const buWhere = buildBusinessUnitWhere(req);
  const { from, to } = req.query as Record<string, string>;
  const where: Record<string, unknown> = { ...buWhere };
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }

  const monthlyRows = await prisma.income.findMany({
    where,
    select: { date: true, total: true },
    orderBy: { date: "asc" },
  });
  const monthlyMap = new Map<string, number>();
  for (const row of monthlyRows) {
    const month = row.date.toISOString().slice(0, 7);
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + row.total);
  }
  const monthlySeries = Array.from(monthlyMap.entries()).map(([month, total]) => ({ month, total }));

  const [total, byService, byMethod, monthly] = await Promise.all([
    prisma.income.aggregate({ where, _sum: { total: true, vatAmount: true }, _count: true }),
    prisma.income.groupBy({ by: ["type"], where, _sum: { total: true }, _count: true }),
    prisma.income.groupBy({ by: ["paymentMethod"], where, _sum: { total: true }, _count: true }),
    Promise.resolve(monthlySeries),
  ]);

  res.json({ total: total._sum.total ?? 0, count: total._count, vatTotal: total._sum.vatAmount ?? 0, byService, byMethod, monthly });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

reportsRouter.get("/expenses", async (req, res) => {
  try {
  const buWhere = buildBusinessUnitWhere(req);
  const { from, to } = req.query as Record<string, string>;
  const where: Record<string, unknown> = { ...buWhere };
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
  }

  const [total, byCategory, byType, byStatus] = await Promise.all([
    prisma.payable.aggregate({ where, _sum: { total: true, paid: true, balance: true }, _count: true }),
    prisma.payable.groupBy({ by: ["category"], where, _sum: { total: true } }),
    prisma.payable.groupBy({ by: ["type"], where, _sum: { total: true } }),
    prisma.payable.groupBy({ by: ["status"], where, _count: true }),
  ]);

  res.json({ total: total._sum.total ?? 0, paid: total._sum.paid ?? 0, balance: total._sum.balance ?? 0, count: total._count, byCategory, byType, byStatus });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

reportsRouter.get("/kpis", async (req, res) => {
  try {
  const buWhere = buildBusinessUnitWhere(req);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [incomeThisMonth, incomeLastMonth, expenseThisMonth, reservationsThisMonth, clientCount, avgTicket] = await Promise.all([
    prisma.income.aggregate({ where: { ...buWhere, date: { gte: monthStart } }, _sum: { total: true }, _count: true }),
    prisma.income.aggregate({ where: { ...buWhere, date: { gte: lastMonthStart, lte: lastMonthEnd } }, _sum: { total: true } }),
    prisma.payable.aggregate({ where: { ...buWhere, createdAt: { gte: monthStart } }, _sum: { total: true } }),
    prisma.reservation.count({ where: { ...buWhere, createdAt: { gte: monthStart }, status: { not: "CANCELADA" } } }),
    prisma.client.count({ where: { isActive: true } }),
    prisma.income.aggregate({ where: { ...buWhere }, _avg: { total: true } }),
  ]);

  const ingresosMes = incomeThisMonth._sum.total ?? 0;
  const ingresosMesAnterior = incomeLastMonth._sum.total ?? 0;
  const gastosMes = expenseThisMonth._sum.total ?? 0;
  const utilidad = ingresosMes - gastosMes;
  const crecimiento = ingresosMesAnterior > 0 ? ((ingresosMes - ingresosMesAnterior) / ingresosMesAnterior) * 100 : 0;
  const ticketPromedio = avgTicket._avg.total ?? 0;
  const ingresoPorReserva = reservationsThisMonth > 0 ? ingresosMes / reservationsThisMonth : 0;

  res.json({
    ingresosMes,
    ingresosMesAnterior,
    gastosMes,
    utilidad,
    margenGanancia: ingresosMes > 0 ? (utilidad / ingresosMes) * 100 : 0,
    crecimiento,
    reservacionesMes: reservationsThisMonth,
    ticketPromedio,
    ingresoPorReserva,
    totalClientes: clientCount,
  });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

reportsRouter.get("/transport", async (req, res) => {
  try {
  const buWhere = buildBusinessUnitWhere(req);
  const { date } = req.query as Record<string, string>;
  const d = date ? new Date(date) : new Date();
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setHours(23, 59, 59, 999);

  const reservations = await prisma.reservation.findMany({
    where: {
      ...buWhere,
      needsTransport: true,
      status: { in: ["PENDIENTE", "CONFIRMADA", "ACTIVA"] },
      OR: [
        { checkIn: { gte: start, lte: end } },
        { checkOut: { gte: start, lte: end } },
      ],
    },
    include: {
      client: { select: { firstName: true, lastName: true, phone: true, whatsapp: true, address: true, city: true } },
      pets: { include: { pet: { select: { name: true, species: true, breed: true, sex: true } } } },
    },
    orderBy: { checkIn: "asc" },
  });

  const pickups = reservations.filter(r => r.transportType === "RECOGIDA" || r.transportType === "AMBAS");
  const deliveries = reservations.filter(r => r.transportType === "ENTREGA" || r.transportType === "AMBAS");

  res.json({ pickups, deliveries });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
