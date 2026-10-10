import { Router } from "express";
import { handleAuthzError } from "../middleware/auth";
import { prisma } from "../db";
import { buildScopeWhere } from "../core/tenancy/scope";
import { localDayBoundsUtc } from "../core/tenancy/local-time";
import {
  monthsEndingAt,
  type Period,
  previousPeriod,
  rangeWhere,
  readPeriod,
  requestTimezone,
} from "../utils/period";
import { overdueWhere, payableDateWhere } from "./payables";

/** How many months the income-against-expenses chart shows, ending with the period's last. */
const MONTHLY_SERIES_MONTHS = 12;
/** How far ahead "about to fall due" looks. */
const UPCOMING_DAYS = 30;

export const reportsRouter = Router();

/**
 * Every financial figure of the Finanzas summary, for one period and the one before it.
 *
 * It is the single source for those figures on purpose: they used to come from two sets of
 * endpoints with different default windows, which showed two different "ingresos" on two pages.
 * Nothing here reads rows except the short list of documents about to fall due.
 */
reportsRouter.get("/finance", async (req, res) => {
  try {
    const scope = buildScopeWhere(req);
    const timezone = await requestTimezone(req);
    const period = readPeriod(req, timezone);
    const previous = previousPeriod(period, timezone);

    const totals = async (range: Period) => {
      const [income, expenses] = await Promise.all([
        prisma.income.aggregate({
          where: { ...scope, date: rangeWhere(range) },
          _sum: { total: true, vatAmount: true },
          _count: true,
        }),
        prisma.payable.aggregate({
          where: { ...scope, ...payableDateWhere(range) },
          _sum: { total: true, vatAmount: true },
        }),
      ]);
      const incomeTotal = income._sum.total ?? 0;
      const expenseTotal = expenses._sum.total ?? 0;
      const profit = incomeTotal - expenseTotal;
      return {
        income: incomeTotal,
        incomeVat: income._sum.vatAmount ?? 0,
        incomeCount: income._count,
        avgTicket: income._count > 0 ? incomeTotal / income._count : 0,
        expenses: expenseTotal,
        expenseVat: expenses._sum.vatAmount ?? 0,
        profit,
        margin: incomeTotal > 0 ? (profit / incomeTotal) * 100 : 0,
      };
    };

    const incomeWhere = { ...scope, date: rangeWhere(period) };
    const today = localDayBoundsUtc(new Date(), timezone)!.start;
    const upcomingEnd = new Date(today.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000);
    const unpaid = { ...scope, status: { not: "PAGADO" } };
    const due = (where: Record<string, unknown>) =>
      prisma.payable.aggregate({ where, _sum: { balance: true }, _count: true });

    const [
      current,
      before,
      monthly,
      byService,
      byMethod,
      expensesByCategory,
      overdue,
      upcoming,
      nextDue,
    ] = await Promise.all([
      totals(period),
      totals(previous),
      // Twelve small aggregates rather than one read of every row bucketed in JS: Prisma cannot
      // group by month without raw SQL, and raw SQL would mean writing the tenant filter by hand.
      Promise.all(
        monthsEndingAt(period, timezone, MONTHLY_SERIES_MONTHS).map(async ({ month, ...range }) => {
          const [income, expenses] = await Promise.all([
            prisma.income.aggregate({
              where: { ...scope, date: rangeWhere(range) },
              _sum: { total: true },
            }),
            prisma.payable.aggregate({
              where: { ...scope, ...payableDateWhere(range) },
              _sum: { total: true },
            }),
          ]);
          return { month, income: income._sum.total ?? 0, expenses: expenses._sum.total ?? 0 };
        }),
      ),
      prisma.income.groupBy({ by: ["type"], where: incomeWhere, _sum: { total: true } }),
      prisma.income.groupBy({ by: ["paymentMethod"], where: incomeWhere, _sum: { total: true } }),
      prisma.payable.groupBy({
        by: ["category"],
        where: { ...scope, ...payableDateWhere(period) },
        _sum: { total: true },
      }),
      due({ ...scope, ...overdueWhere(timezone) }),
      due({ ...unpaid, dueDate: { gte: today, lt: upcomingEnd } }),
      prisma.payable.findMany({
        where: { ...unpaid, dueDate: { not: null, lt: upcomingEnd } },
        select: {
          id: true,
          description: true,
          dueDate: true,
          balance: true,
          provider: { select: { name: true } },
        },
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        take: 10,
      }),
    ]);

    const byTotal = (a: { total: number }, b: { total: number }) => b.total - a.total;
    res.json({
      from: period.start,
      to: period.end,
      period: current,
      previous: before,
      monthly,
      byService: byService.map((r) => ({ type: r.type, total: r._sum.total ?? 0 })).sort(byTotal),
      byMethod: byMethod
        .map((r) => ({ paymentMethod: r.paymentMethod, total: r._sum.total ?? 0 }))
        .sort(byTotal),
      expensesByCategory: expensesByCategory
        .map((r) => ({ category: r.category, total: r._sum.total ?? 0 }))
        .sort(byTotal),
      payables: {
        overdue: { total: overdue._sum.balance ?? 0, count: overdue._count },
        upcoming: { total: upcoming._sum.balance ?? 0, count: upcoming._count },
        items: nextDue.map((p) => ({
          id: p.id,
          description: p.description,
          provider: p.provider?.name ?? null,
          dueDate: p.dueDate,
          balance: p.balance,
          overdue: p.dueDate! < today,
        })),
      },
    });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

reportsRouter.get("/transport", async (req, res) => {
  try {
    const buWhere = buildScopeWhere(req);
    const { date } = req.query as Record<string, string>;
    const d = date ? new Date(date) : new Date();
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);

    const reservations = await prisma.reservation.findMany({
      where: {
        ...buWhere,
        needsTransport: true,
        status: { in: ["PENDIENTE", "CONFIRMADA", "ACTIVA"] },
        OR: [{ checkIn: { gte: start, lte: end } }, { checkOut: { gte: start, lte: end } }],
      },
      include: {
        client: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            whatsapp: true,
            address: true,
            city: true,
          },
        },
        pets: {
          include: { pet: { select: { name: true, species: true, breed: true, sex: true } } },
        },
      },
      orderBy: { checkIn: "asc" },
    });

    const pickups = reservations.filter(
      (r) => r.transportType === "RECOGIDA" || r.transportType === "AMBAS",
    );
    const deliveries = reservations.filter(
      (r) => r.transportType === "ENTREGA" || r.transportType === "AMBAS",
    );

    res.json({ pickups, deliveries });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
