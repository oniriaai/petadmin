import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { api, downloadFile } from "../../lib/api";
import { fmtCurrency } from "../../lib/utils";
import { CHART_COLORS, CHART_GRID } from "../../lib/chart-theme";
import { PageLoader } from "../../components/ui/Spinner";
import { PageHeader } from "../../components/layout/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { Stat, StatStrip } from "../../components/ui/Stat";

interface KPIs {
  ingresosMes: number;
  ingresosMesAnterior: number;
  gastosMes: number;
  utilidad: number;
  margenGanancia: number;
  crecimiento: number;
  reservacionesMes: number;
  ticketPromedio: number;
  ingresoPorReserva: number;
  totalClientes: number;
}
interface IncomeReport {
  total: number;
  count: number;
  vatTotal: number;
  byService: Array<{ type: string; _sum: { total: number }; _count: number }>;
  byMethod: Array<{ paymentMethod: string; _sum: { total: number } }>;
  monthly: Array<{ month: string; total: number }>;
}
interface ExpenseReport {
  total: number;
  paid: number;
  balance: number;
  count: number;
  byCategory: Array<{ category: string; _sum: { total: number } }>;
  byStatus: Array<{ status: string; _count: number }>;
}

const SVC_LABEL: Record<string, string> = {
  GUARDERIA: "Guardería",
  PELUQUERIA_CANINA: "Pel. Canina",
  PELUQUERIA_FELINA: "Pel. Felina",
  TRANSPORTE: "Transporte",
  OTRO: "Otro",
  RESERVA: "Reserva",
  TIENDA: "Tienda",
};

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
      .then(([k, i, e]) => {
        setKpis(k);
        setIncome(i);
        setExpense(e);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function exportFile(path: string, filename: string) {
    setDownloading(true);
    try {
      await downloadFile(path, filename);
    } catch {
      alert("No pudimos descargar el archivo. Inténtalo de nuevo.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading)
    return (
      <div className="p-4 sm:p-6">
        <PageLoader />
      </div>
    );

  const monthlyData =
    income?.monthly.map((m) => ({ name: m.month.slice(5), total: Number(m.total) })) ?? [];
  const pieData =
    income?.byService.map((s) => ({
      name: SVC_LABEL[s.type] ?? s.type,
      value: Number(s._sum.total),
    })) ?? [];
  const categoryData =
    expense?.byCategory
      .map((c) => ({ name: c.category, value: Number(c._sum.total) }))
      .sort((a, b) => b.value - a.value) ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Informes y Gráficos"
        subtitle="Análisis financiero y KPIs"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => exportFile("/export/incomes", "ingresos.xlsx")}
              disabled={downloading}
              className="btn-secondary btn-sm"
            >
              <Download size={14} /> Ingresos Excel
            </button>
            <button
              onClick={() => exportFile("/export/expenses", "gastos.xlsx")}
              disabled={downloading}
              className="btn-secondary btn-sm"
            >
              <Download size={14} /> Gastos Excel
            </button>
            <button
              onClick={() => exportFile("/export/clients", "clientes.xlsx")}
              disabled={downloading}
              className="btn-secondary btn-sm"
            >
              <Download size={14} /> Clientes Excel
            </button>
          </div>
        }
      />

      {kpis && (
        <StatStrip>
          <Stat
            label="Ingresos del mes"
            value={fmtCurrency(kpis.ingresosMes)}
            tone="success"
            hint={
              <span
                className={`flex items-center gap-1 ${kpis.crecimiento >= 0 ? "text-success" : "text-danger"}`}
              >
                {kpis.crecimiento >= 0 ? (
                  <TrendingUp size={11} aria-hidden="true" />
                ) : (
                  <TrendingDown size={11} aria-hidden="true" />
                )}
                {Math.abs(kpis.crecimiento).toFixed(1)}% frente al mes anterior
              </span>
            }
          />
          <Stat label="Gastos del mes" value={fmtCurrency(kpis.gastosMes)} />
          <Stat
            label="Utilidad del mes"
            value={fmtCurrency(kpis.utilidad)}
            tone={kpis.utilidad < 0 ? "danger" : undefined}
            hint={`Margen: ${kpis.margenGanancia.toFixed(1)}%`}
          />
          <Stat label="Ticket promedio" value={fmtCurrency(kpis.ticketPromedio)} />
          <Stat
            label="Reservas del mes"
            value={kpis.reservacionesMes}
            hint={`${kpis.totalClientes} clientes activos`}
          />
        </StatStrip>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card p-5">
          <h2 className="section-title mb-4">Ingresos por mes</h2>
          {monthlyData.length === 0 ? (
            <EmptyState title="Todavía no hay ingresos en este periodo." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => [fmtCurrency(v), "Ingresos"]} />
                <Bar dataKey="total" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h2 className="section-title mb-4">Ingresos por servicio</h2>
          {pieData.length === 0 ? (
            <EmptyState title="Todavía no hay datos en este periodo." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
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
          <h2 className="section-title mb-4">Gastos por categoría</h2>
          {categoryData.length === 0 ? (
            <EmptyState title="Todavía no hay gastos en este periodo." />
          ) : (
            <div className="space-y-2">
              {categoryData.map((c, i) => {
                const maxVal = categoryData[0].value;
                const pct = maxVal > 0 ? (c.value / maxVal) * 100 : 0;
                return (
                  <div key={c.name}>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="text-muted capitalize">{c.name}</span>
                      <span className="font-medium text-ink">{fmtCurrency(c.value)}</span>
                    </div>
                    <div className="h-1.5 bg-sunken rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="section-title mb-4">Resumen financiero</h2>
          {kpis && income && expense && (
            <div className="space-y-3">
              {[
                {
                  label: "Total ingresos",
                  value: fmtCurrency(income.total),
                  color: "text-success",
                },
                {
                  label: "IVA cobrado",
                  value: fmtCurrency(income.vatTotal),
                  color: "text-muted",
                },
                {
                  label: "Total gastos/compras",
                  value: fmtCurrency(expense.total),
                  color: "text-danger",
                },
                {
                  label: "Gastos pagados",
                  value: fmtCurrency(expense.paid),
                  color: "text-muted",
                },
                {
                  label: "Saldo pendiente gastos",
                  value: fmtCurrency(expense.balance),
                  color: "text-warning-ink",
                },
                {
                  label: "Transacciones de ingreso",
                  value: String(income.count),
                  color: "text-ink",
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="flex justify-between items-center py-2 border-b border-line-subtle last:border-0"
                >
                  <span className="text-sm text-muted">{label}</span>
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
