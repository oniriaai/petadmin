import { Router } from "express";
import { handleAuthzError } from "../middleware/auth";
import { prisma } from "../db";
import { hasPermission } from "../core/tenancy/permissions";
import { buildDaycareWhere, buildScopeWhere } from "../core/tenancy/scope";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", async (req, res) => {
  try {
    const buWhere = buildScopeWhere(req);
    // This summary is open to every user, so the two income figures are left out (null, and not
    // even queried) for one who may not read the finances.
    const canSeeIncome = hasPermission(req, "finanzas.read");
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [reservasHoy, activas, entradas, salidas, ingresosHoy, alertas, proximasReservas] =
      await Promise.all([
        prisma.reservation.count({
          where: { ...buWhere, checkIn: { gte: todayStart, lte: todayEnd } },
        }),
        prisma.reservation.count({
          where: { ...buWhere, status: { in: ["ACTIVA", "RECEPCIONADA", "EN_PROCESO", "LISTO"] } },
        }),
        prisma.reservation.count({
          where: {
            ...buWhere,
            status: { in: ["CONFIRMADA", "ACTIVA", "RECEPCIONADA", "EN_PROCESO", "LISTO"] },
            checkIn: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.reservation.count({
          where: {
            ...buWhere,
            status: { in: ["ACTIVA", "COMPLETADA", "LISTO"] },
            checkOut: { gte: todayStart, lte: todayEnd },
          },
        }),
        canSeeIncome
          ? prisma.income.aggregate({
              where: { ...buWhere, date: { gte: todayStart, lte: todayEnd } },
              _sum: { total: true },
            })
          : null,
        prisma.alert.findMany({
          where: { ...buWhere, isResolved: false },
          orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
          take: 5,
          include: { pet: { select: { name: true } } },
        }),
        prisma.reservation.findMany({
          where: {
            ...buWhere,
            status: { in: ["PENDIENTE", "CONFIRMADA", "RECEPCIONADA", "EN_PROCESO", "LISTO"] },
            checkIn: { gte: todayStart },
          },
          take: 8,
          orderBy: { checkIn: "asc" },
          include: {
            client: { select: { firstName: true, lastName: true } },
            pets: { include: { pet: { select: { name: true } } } },
            room: { select: { name: true } },
          },
        }),
      ]);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const ingresosMes = canSeeIncome
      ? await prisma.income.aggregate({
          where: { ...buWhere, date: { gte: monthStart } },
          _sum: { total: true },
        })
      : null;
    const totalClientes = await prisma.client.count({
      where: { isActive: true, ...buildDaycareWhere(req) },
    });

    res.json({
      reservasHoy,
      activas,
      entradas,
      salidas,
      ingresosHoy: ingresosHoy ? (ingresosHoy._sum.total ?? 0) : null,
      ingresosMes: ingresosMes ? (ingresosMes._sum.total ?? 0) : null,
      totalClientes,
      alertas: alertas.map((a) => ({
        id: a.id,
        severity: a.severity,
        title: a.title,
        pet: a.pet?.name,
      })),
      proximasReservas: proximasReservas.map((r) => ({
        id: r.id,
        cliente: `${r.client.firstName} ${r.client.lastName}`,
        mascotas: r.pets.map((p) => p.pet.name).join(", "),
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
