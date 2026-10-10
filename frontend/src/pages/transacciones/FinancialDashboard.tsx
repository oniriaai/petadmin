import { useEffect, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { api } from "../../lib/api";
import { EXPENSE_CATEGORIES, fmt, fmtCurrency } from "../../lib/utils";
import { CHART_COLORS, CHART_EXPENSE, CHART_GRID, CHART_INCOME } from "../../lib/chart-theme";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { InlineError } from "../../components/ui/InlineError";
import { PageLoader } from "../../components/ui/Spinner";
import { Stat, StatStrip } from "../../components/ui/Stat";
import { INCOME_PAYMENT_METHODS, INCOME_TYPES, labelOf, toQuery, type Period } from "./finance";

interface Totals {
  income: number;
  incomeVat: number;
  incomeCount: number;
  avgTicket: number;
  expenses: number;
  expenseVat: number;
  profit: number;
  margin: number;
}

interface FinanceReport {
  period: Totals;
  previous: Totals;
  monthly: Array<{ month: string; income: number; expenses: number }>;
  byService: Array<{ type: string; total: number }>;
  byMethod: Array<{ paymentMethod: string; total: number }>;
  expensesByCategory: Array<{ category: string; total: number }>;
  payables: {
    overdue: { total: number; count: number };
    upcoming: { total: number; count: number };
    items: Array<{
      id: string;
      description: string;
      provider: string | null;
      dueDate: string;
      balance: number;
      overdue: boolean;
    }>;
  };
}

/** How a figure moved against the previous period. Nothing to say when that one was empty. */
function Change({ now, before, good }: { now: number; before: number; good?: "up" }) {
  if (before <= 0) return <>Sin datos del periodo anterior</>;
  const pct = ((now - before) / before) * 100;
  const Icon = pct >= 0 ? TrendingUp : TrendingDown;
  const tone = good ? (pct >= 0 ? "text-success" : "text-danger") : "";
  return (
    <span className={`flex items-center gap-1 ${tone}`}>
      <Icon size={11} aria-hidden="true" />
      {Math.abs(pct).toFixed(1)}% {pct >= 0 ? "más" : "menos"} que el periodo anterior
    </span>
  );
}

function Panel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card p-5 ${className ?? ""}`}>
      <h2 className="section-title mb-4">{title}</h2>
      {children}
    </section>
  );
}

/** Amounts as labelled bars, largest first. The rows arrive sorted from the server. */
function BarList({ rows, empty }: { rows: Array<{ name: string; value: number }>; empty: string }) {
  if (rows.length === 0) return <EmptyState compact title={empty} />;
  const max = rows[0].value;
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={row.name}>
          <div className="mb-0.5 flex justify-between text-sm">
            <span className="text-muted">{row.name}</span>
            <span className="font-medium tabular-nums text-ink">{fmtCurrency(row.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-sunken">
            <div
              className="h-full rounded-full"
              style={{
                width: `${max > 0 ? (row.value / max) * 100 : 0}%`,
                backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line-subtle py-2 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${tone ?? "text-ink"}`}>
        {fmtCurrency(value)}
      </span>
    </div>
  );
}

export function FinancialDashboard({ period }: { period: Period }) {
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stale = false;
    api
      .get<FinanceReport>(`/reports/finance?${toQuery({ ...period })}`)
      .then((data) => {
        if (stale) return;
        setReport(data);
        setFailed(false);
      })
      .catch(() => {
        if (!stale) setFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [period, attempt]);

  if (failed) return <InlineError onRetry={() => setAttempt((n) => n + 1)} />;
  if (!report) return <PageLoader />;

  const { period: now, previous, payables } = report;
  const monthly = report.monthly.map((m) => ({
    name: fmt(`${m.month}-01`, "MMM yy"),
    Ingresos: m.income,
    Gastos: m.expenses,
  }));
  const services = report.byService.map((s) => ({
    name: labelOf(INCOME_TYPES, s.type),
    value: s.total,
  }));
  const vatBalance = now.incomeVat - now.expenseVat;

  return (
    <div className="space-y-6">
      <StatStrip>
        <Stat
          label="Ingresos"
          value={fmtCurrency(now.income)}
          tone="success"
          hint={<Change now={now.income} before={previous.income} good="up" />}
        />
        <Stat
          label="Gastos"
          value={fmtCurrency(now.expenses)}
          hint={<Change now={now.expenses} before={previous.expenses} />}
        />
        <Stat
          label="Utilidad"
          value={fmtCurrency(now.profit)}
          tone={now.profit < 0 ? "danger" : undefined}
          hint={`Margen: ${now.margin.toFixed(1)}%`}
        />
        <Stat
          label="Ticket promedio"
          value={fmtCurrency(now.avgTicket)}
          hint={`${now.incomeCount} ingresos`}
        />
      </StatStrip>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Ingresos y gastos por mes" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: number) => fmtCurrency(v)} />
              <Legend iconSize={8} iconType="circle" />
              <Bar dataKey="Ingresos" fill={CHART_INCOME} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Gastos" fill={CHART_EXPENSE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Ingresos por servicio">
          {services.length === 0 ? (
            <EmptyState compact title="No hay ingresos en este periodo." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={services}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {services.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                <Legend iconSize={8} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Ingresos por método de pago">
          <BarList
            empty="No hay ingresos en este periodo."
            rows={report.byMethod.map((m) => ({
              name: labelOf(INCOME_PAYMENT_METHODS, m.paymentMethod),
              value: m.total,
            }))}
          />
        </Panel>
        <Panel title="Gastos por categoría">
          <BarList
            empty="No hay gastos en este periodo."
            rows={report.expensesByCategory.map((c) => ({
              name: labelOf(EXPENSE_CATEGORIES, c.category),
              value: c.total,
            }))}
          />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="IVA del periodo">
          <Line label="IVA cobrado en ingresos" value={now.incomeVat} />
          <Line label="IVA pagado en gastos y compras" value={now.expenseVat} />
          <Line
            label={vatBalance >= 0 ? "IVA por pagar" : "IVA a favor"}
            value={Math.abs(vatBalance)}
            tone={vatBalance > 0 ? "text-warning-ink" : "text-success"}
          />
          <p className="mt-3 text-xs text-muted">
            Es una referencia calculada con lo registrado aquí. Confírmala con tu contador antes de
            declarar.
          </p>
        </Panel>

        <Panel title="Cuentas por pagar">
          <Line
            label={`Vencido (${payables.overdue.count})`}
            value={payables.overdue.total}
            tone={payables.overdue.total > 0 ? "text-danger" : undefined}
          />
          <Line
            label={`Vence en los próximos 30 días (${payables.upcoming.count})`}
            value={payables.upcoming.total}
          />
          {payables.items.length === 0 ? (
            <EmptyState compact title="No hay documentos por vencer." />
          ) : (
            <ul className="mt-3 divide-y divide-line-subtle">
              {payables.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{item.description}</span>
                    <span className="text-xs text-muted">
                      {item.provider ?? "Sin proveedor"} · vence {fmt(item.dueDate)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {item.overdue && <Badge tone="danger">Vencido</Badge>}
                    <span className="font-semibold tabular-nums">{fmtCurrency(item.balance)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
