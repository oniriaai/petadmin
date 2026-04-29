import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { api, downloadFile } from "../../lib/api";
import { fmtCurrency } from "../../lib/utils";
import { PageLoader } from "../../components/ui/Spinner";

interface KPIs { ingresosMes: number; ingresosMesAnterior: number; gastosMes: number; utilidad: number; margenGanancia: number; crecimiento: number; reservacionesMes: number; ticketPromedio: number; ingresoPorReserva: number; totalClientes: number }
interface IncomeReport { total: number; count: number; vatTotal: number; byService: Array<{ type: string; _sum: { total: number }; _count: number }>; byMethod: Array<{ paymentMethod: string; _sum: { total: number } }>; monthly: Array<{ month: string; total: number }> }
interface ExpenseReport { total: number; paid: number; balance: number; count: number; byCategory: Array<{ category: string; _sum: { total: number } }>; byStatus: Array<{ status: string; _count: number }> }

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"];
const SVC_LABEL: Record<string, string> = { GUARDERIA: "Guardería", PELUQUERIA_CANINA: "Pel. Canina", PELUQUERIA_FELINA: "Pel. Felina", TRANSPORTE: "Transporte", OTRO: "Otro", RESERVA: "Reserva", TIENDA: "Tienda" };

function KPICard({ label, value, sub, trend, color = "text-gray-900" }: { label: string; value: string; sub?: string; trend?: number; color?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      {trend !== undefined && (
        <p className={`text-xs flex items-center gap-1 mt-1 ${trend >= 0 ? "text-green-600" : "text-red-500"}`}>
          {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {Math.abs(trend).toFixed(1)}% vs mes anterior
        </p>
      )}
    </div>
  );
}

export function InformesPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [income, setIncome] = useState<IncomeReport | null>(null);
  const [expense, setExpense] = useState<ExpenseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<KPIs>("/reports/kpis"),
      api.get<IncomeReport>("/reports/incomes"),
      api.get<ExpenseReport>("/reports/expenses"),
    ])
      .then(([k, i, e]) => { setKpis(k); setIncome(i); setExpense(e); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function exportFile(path: string, filename: string) {
    setDownloading(true);
    try { await downloadFile(path, filename); }
    catch (e) { alert("Error al descargar") }
    finally { setDownloading(false); }
  }

  if (loading) return <div className="p-6"><PageLoader /></div>;

  const monthlyData = income?.monthly.map(m => ({ name: m.month.slice(5), total: Number(m.total) })) ?? [];
  const pieData = income?.byService.map(s => ({ name: SVC_LABEL[s.type] ?? s.type, value: Number(s._sum.total) })) ?? [];
  const categoryData = expense?.byCategory.map(c => ({ name: c.category, value: Number(c._sum.total) })).sort((a, b) => b.value - a.value) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Informes y Gráficos</h1>
          <p className="text-gray-500 text-sm mt-1">Análisis financiero y KPIs</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportFile("/export/incomes", "ingresos.xlsx")} disabled={downloading} className="btn-secondary btn-sm">
            <Download size={14} /> Ingresos Excel
          </button>
          <button onClick={() => exportFile("/export/expenses", "gastos.xlsx")} disabled={downloading} className="btn-secondary btn-sm">
            <Download size={14} /> Gastos Excel
          </button>
          <button onClick={() => exportFile("/export/clients", "clientes.xlsx")} disabled={downloading} className="btn-secondary btn-sm">
            <Download size={14} /> Clientes Excel
          </button>
        </div>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KPICard label="Ingresos mes" value={fmtCurrency(kpis.ingresosMes)} trend={kpis.crecimiento} color="text-green-600" />
          <KPICard label="Gastos mes" value={fmtCurrency(kpis.gastosMes)} color="text-red-600" />
          <KPICard label="Utilidad mes" value={fmtCurrency(kpis.utilidad)} color={kpis.utilidad >= 0 ? "text-green-700" : "text-red-600"} sub={`Margen: ${kpis.margenGanancia.toFixed(1)}%`} />
          <KPICard label="Ticket promedio" value={fmtCurrency(kpis.ticketPromedio)} />
          <KPICard label="Reservas mes" value={String(kpis.reservacionesMes)} sub={`${kpis.totalClientes} clientes activos`} />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Ingresos por mes</h2>
          {monthlyData.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Sin datos de ingresos</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v: number) => [fmtCurrency(v), "Ingresos"]} />
                <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Ingresos por servicio</h2>
          {pieData.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                <Legend iconSize={8} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Gastos por categoría</h2>
          {categoryData.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Sin datos de gastos</p>
          ) : (
            <div className="space-y-2">
              {categoryData.map((c, i) => {
                const maxVal = categoryData[0].value;
                const pct = maxVal > 0 ? (c.value / maxVal) * 100 : 0;
                return (
                  <div key={c.name}>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="text-gray-700 capitalize">{c.name}</span>
                      <span className="font-medium text-gray-900">{fmtCurrency(c.value)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Resumen financiero</h2>
          {kpis && income && expense && (
            <div className="space-y-3">
              {[
                { label: "Total ingresos", value: fmtCurrency(income.total), color: "text-green-600" },
                { label: "IVA cobrado", value: fmtCurrency(income.vatTotal), color: "text-gray-600" },
                { label: "Total gastos/compras", value: fmtCurrency(expense.total), color: "text-red-600" },
                { label: "Gastos pagados", value: fmtCurrency(expense.paid), color: "text-gray-600" },
                { label: "Saldo pendiente gastos", value: fmtCurrency(expense.balance), color: "text-yellow-600" },
                { label: "Transacciones de ingreso", value: String(income.count), color: "text-gray-900" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-600">{label}</span>
                  <span className={`font-semibold text-sm ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
