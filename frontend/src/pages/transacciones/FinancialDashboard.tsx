import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { fmtCurrency } from "../../lib/utils";
import { Stat, StatStrip } from "../../components/ui/Stat";
import { CHART_COLORS, CHART_EXPENSE, CHART_GRID, CHART_INCOME } from "../../lib/chart-theme";
import { api } from "../../lib/api";
import { PageLoader } from "../../components/ui/Spinner";

interface SummaryData {
  income: number;
  expenses: number;
  purchases: number;
  totalCosts: number;
  profit: number;
  profitMargin: number;
}

interface TrendData {
  month: string;
  income: number;
  expenses: number;
}

interface CategoryData {
  category: string;
  amount: number;
}

interface OccupancyData {
  totalRooms: number;
  totalCapacity: number;
  activeReservations: number;
  occupancyPercent: number;
}

export function FinancialDashboard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const [summaryData, trendData, categoryData, occupancyData] = await Promise.all([
        api.get<SummaryData>(`/dashboard/financial/summary?${params}`),
        api.get<TrendData[]>("/dashboard/financial/trends"),
        api.get<CategoryData[]>(`/dashboard/financial/expense-categories?${params}`),
        api.get<OccupancyData>("/dashboard/analytics/occupancy"),
      ]);

      setSummary(summaryData);
      setTrends(trendData);
      setCategories(categoryData);
      setOccupancy(occupancyData);
    } catch (e) {
      console.error("Error loading dashboard data:", e);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="section-title">Resumen general</h2>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label text-xs" htmlFor="fin-desde">
              Desde
            </label>
            <input
              id="fin-desde"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input w-auto"
            />
          </div>
          <div>
            <label className="label text-xs" htmlFor="fin-hasta">
              Hasta
            </label>
            <input
              id="fin-hasta"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input w-auto"
            />
          </div>
          <button onClick={loadData} className="btn-secondary">
            Actualizar
          </button>
        </div>
      </div>

      {summary && (
        <StatStrip>
          <Stat label="Ingresos" value={fmtCurrency(summary.income ?? 0)} tone="success" />
          <Stat label="Gastos" value={fmtCurrency(summary.expenses ?? 0)} />
          <Stat
            label="Ganancias"
            value={fmtCurrency(summary.profit ?? 0)}
            tone={summary.profit < 0 ? "danger" : undefined}
            hint={`Margen: ${(summary.profitMargin ?? 0).toFixed(1)}%`}
          />
          {occupancy && (
            <Stat
              label="Ocupación"
              value={`${occupancy.occupancyPercent}%`}
              hint={`${occupancy.activeReservations} de ${occupancy.totalCapacity} espacios`}
            />
          )}
        </StatStrip>
      )}

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trend Chart */}
        {trends.length > 0 && (
          <div className="card p-5">
            <h2 className="section-title mb-4">Tendencia Últimos 6 Meses</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke={CHART_INCOME}
                  strokeWidth={2}
                  name="Ingresos"
                  dot={{ fill: "#10B981" }}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke={CHART_EXPENSE}
                  strokeWidth={2}
                  name="Gastos"
                  dot={{ fill: "#EF4444" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Category Breakdown */}
        {categories.length > 0 && (
          <div className="card p-5">
            <h2 className="section-title mb-4">Gastos por Categoría</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categories}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ category, amount }) => `${category}: $${(amount / 1000).toFixed(0)}K`}
                  outerRadius={80}
                  fill={CHART_COLORS[0]}
                  dataKey="amount"
                >
                  {categories.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Monthly Comparison */}
      {trends.length > 0 && (
        <div className="card p-5">
          <h2 className="section-title mb-4">Comparación Mensual</h2>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="income" fill={CHART_INCOME} name="Ingresos" />
              <Bar dataKey="expenses" fill={CHART_EXPENSE} name="Gastos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {occupancy && (
        <section className="space-y-3" aria-label="Ocupación">
          <h2 className="section-title">Ocupación</h2>
          <StatStrip>
            <Stat label="Salas" value={occupancy.totalRooms} />
            <Stat label="Capacidad total" value={occupancy.totalCapacity} />
            <Stat label="Reservas activas" value={occupancy.activeReservations} />
            <Stat label="Ocupación" value={`${occupancy.occupancyPercent}%`} />
          </StatStrip>
        </section>
      )}
    </div>
  );
}
