import { Router } from "express";
import { buildBusinessUnitWhere, handleAuthzError, requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/summary", async (req, res) => {
  try {
  const buWhere = buildBusinessUnitWhere(req);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [reservasHoy, activas, entradas, salidas, ingresosHoy, alertas, proximasReservas] = await Promise.all([
    prisma.reservation.count({ where: { ...buWhere, checkIn: { gte: todayStart, lte: todayEnd } } }),
    prisma.reservation.count({ where: { ...buWhere, status: { in: ["ACTIVA", "RECEPCIONADA", "EN_PROCESO", "LISTO"] } } }),
    prisma.reservation.count({ where: { ...buWhere, status: { in: ["CONFIRMADA", "ACTIVA", "RECEPCIONADA", "EN_PROCESO", "LISTO"] }, checkIn: { gte: todayStart, lte: todayEnd } } }),
    prisma.reservation.count({ where: { ...buWhere, status: { in: ["ACTIVA", "COMPLETADA", "LISTO"] }, checkOut: { gte: todayStart, lte: todayEnd } } }),
    prisma.income.aggregate({ where: { ...buWhere, date: { gte: todayStart, lte: todayEnd } }, _sum: { total: true } }),
    prisma.alert.findMany({ where: { ...buWhere, isResolved: false }, orderBy: [{ severity: "asc" }, { createdAt: "desc" }], take: 5, include: { pet: { select: { name: true } } } }),
    prisma.reservation.findMany({
      where: { ...buWhere, status: { in: ["PENDIENTE", "CONFIRMADA", "RECEPCIONADA", "EN_PROCESO", "LISTO"] }, checkIn: { gte: todayStart } },
      take: 8,
      orderBy: { checkIn: "asc" },
      include: { client: { select: { firstName: true, lastName: true } }, pets: { include: { pet: { select: { name: true } } } }, room: { select: { name: true } } },
    }),
  ]);

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const ingresosMes = await prisma.income.aggregate({ where: { ...buWhere, date: { gte: monthStart } }, _sum: { total: true } });
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
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// Financial Summary: Income vs Expenses for a date range
dashboardRouter.get("/financial/summary", async (req, res) => {
  try {
  const buWhere = buildBusinessUnitWhere(req);
  const { startDate, endDate } = req.query;
  
  const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
  const end = endDate ? new Date(endDate as string) : new Date();

  const [totalIncome, totalPayables] = await Promise.all([
    prisma.income.aggregate({
      where: { ...buWhere, date: { gte: start, lte: end } },
      _sum: { total: true },
    }),
    prisma.payable.aggregate({
      where: { ...buWhere, createdAt: { gte: start, lte: end } },
      _sum: { total: true },
    }),
  ]);

  const income = totalIncome._sum.total ?? 0;
  const totalCosts = totalPayables._sum.total ?? 0;

  res.json({
    income,
    expenses: totalCosts, // Unified expenses/purchases from payables
    purchases: 0, // Deprecated separate purchases
    totalCosts,
    profit: income - totalCosts,
    profitMargin: income > 0 ? ((income - totalCosts) / income) * 100 : 0,
  });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// Monthly financial data for last 6 months
dashboardRouter.get("/financial/trends", async (req, res) => {
  try {
  const buWhere = buildBusinessUnitWhere(req);
  const months = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    
    const [income, payables] = await Promise.all([
      prisma.income.aggregate({
        where: { ...buWhere, date: { gte: date, lt: nextDate } },
        _sum: { total: true },
      }),
      prisma.payable.aggregate({
        where: { ...buWhere, createdAt: { gte: date, lt: nextDate } },
        _sum: { total: true },
      }),
    ]);

    months.push({
      month: date.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }),
      income: income._sum.total ?? 0,
      expenses: payables._sum.total ?? 0,
    });
  }

  res.json(months);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// Expense breakdown by category
dashboardRouter.get("/financial/expense-categories", async (req, res) => {
  try {
  const buWhere = buildBusinessUnitWhere(req);
  const { startDate, endDate } = req.query;
  
  const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
  const end = endDate ? new Date(endDate as string) : new Date();

  const payables = await prisma.payable.groupBy({
    by: ["category"],
    where: { ...buWhere, createdAt: { gte: start, lte: end } },
    _sum: { total: true },
  });

  const data = payables.map(e => ({
    category: e.category,
    amount: e._sum.total ?? 0,
  }));

  res.json(data);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// Top clients by revenue
dashboardRouter.get("/financial/top-clients", async (req, res) => {
  try {
  const buWhere = buildBusinessUnitWhere(req);
  const { startDate, endDate, limit = "10" } = req.query;
  
  const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
  const end = endDate ? new Date(endDate as string) : new Date();

  const topClients = await prisma.income.groupBy({
    by: ["concept"],
    where: { ...buWhere, date: { gte: start, lte: end }, isActive: true },
    _sum: { total: true },
    orderBy: { _sum: { total: "desc" } },
    take: parseInt(limit as string),
  });

  const data = topClients.map(c => ({
    client: c.concept,
    revenue: c._sum.total ?? 0,
  }));

  res.json(data);
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// Occupancy analytics
dashboardRouter.get("/analytics/occupancy", async (req, res) => {
  try {
  const buWhere = buildBusinessUnitWhere(req);

  const [rooms, totalCapacity, activeReservations] = await Promise.all([
    prisma.room.findMany({ where: { ...buWhere, isActive: true } }),
    prisma.room.aggregate({
      where: { ...buWhere, isActive: true },
      _sum: { capacity: true },
    }),
    prisma.reservation.count({
      where: { ...buWhere, status: "ACTIVA" },
    }),
  ]);

  const totalCap = totalCapacity._sum.capacity ?? 0;
  const occupancyPercent = totalCap > 0 ? (activeReservations / totalCap) * 100 : 0;

  res.json({
    totalRooms: rooms.length,
    totalCapacity: totalCap,
    activeReservations,
    occupancyPercent: Math.round(occupancyPercent),
    roomDetails: rooms.map(r => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      occupancy: 0, // Can be calculated per room if needed
    })),
  });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
