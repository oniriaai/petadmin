import React, { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Calendar, TrendingUp, TrendingDown } from "lucide-react";
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

const COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Resumen General</h2>
        </div>

        <div className="flex gap-3 items-center">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition self-end"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Ingresos</div>
                <div className="text-2xl font-bold text-green-600 mt-1">${(summary.income ?? 0).toLocaleString()}</div>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <TrendingUp className="text-green-600" size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Gastos</div>
                <div className="text-2xl font-bold text-red-600 mt-1">${(summary.expenses ?? 0).toLocaleString()}</div>
              </div>
              <div className="bg-red-100 p-3 rounded-lg">
                <TrendingDown className="text-red-600" size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div>
              <div className="text-sm text-gray-600">Ganancias</div>
              <div className={`text-2xl font-bold mt-1 ${summary.profit >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                ${(summary.profit ?? 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Margen: {(summary.profitMargin ?? 0).toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            {occupancy && (
              <div>
                <div className="text-sm text-gray-600">Ocupación</div>
                <div className="text-2xl font-bold text-blue-600 mt-1">{occupancy.occupancyPercent}%</div>
                <div className="text-xs text-gray-500 mt-2">
                  {occupancy.activeReservations}/{occupancy.totalCapacity} espacios
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Trend Chart */}
        {trends.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Tendencia Últimos 6 Meses</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke="#10B981"
                  strokeWidth={2}
                  name="Ingresos"
                  dot={{ fill: "#10B981" }}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="#EF4444"
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
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Gastos por Categoría</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categories}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ category, amount }) => `${category}: $${(amount / 1000).toFixed(0)}K`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="amount"
                >
                  {categories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Comparación Mensual</h2>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="income" fill="#10B981" name="Ingresos" />
              <Bar dataKey="expenses" fill="#EF4444" name="Gastos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Occupancy Info */}
      {occupancy && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Información de Ocupación</h2>
          <div className="grid grid-cols-4 gap-4">
            <div className="border-l-4 border-blue-500 pl-4 py-2">
              <div className="text-sm text-gray-600">Total de Salas</div>
              <div className="text-2xl font-bold text-gray-900">{occupancy.totalRooms}</div>
            </div>
            <div className="border-l-4 border-green-500 pl-4 py-2">
              <div className="text-sm text-gray-600">Capacidad Total</div>
              <div className="text-2xl font-bold text-gray-900">{occupancy.totalCapacity}</div>
            </div>
            <div className="border-l-4 border-orange-500 pl-4 py-2">
              <div className="text-sm text-gray-600">Reservas Activas</div>
              <div className="text-2xl font-bold text-gray-900">{occupancy.activeReservations}</div>
            </div>
            <div className="border-l-4 border-purple-500 pl-4 py-2">
              <div className="text-sm text-gray-600">Porcentaje Ocupación</div>
              <div className="text-2xl font-bold text-gray-900">{occupancy.occupancyPercent}%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
