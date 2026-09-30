import { useEffect, useState, useCallback } from "react";
import { Plus, Edit2, Trash2, RefreshCw, Search, TrendingUp, TrendingDown, CreditCard, Building2, LayoutDashboard } from "lucide-react";
import { api } from "../../lib/api";
import { PageLoader } from "../../components/ui/Spinner";
import { IncomeEntryForm } from "./IncomeEntryForm";
import { PayableEntryForm } from "./PayableEntryForm";
import { ProviderForm } from "./ProviderForm";
import { PayModal } from "./PayModal";
import { FinancialDashboard } from "./FinancialDashboard";
import { Badge } from "../../components/ui/Badge";
import { fmt, fmtCurrency, EXPENSE_CATEGORIES } from "../../lib/utils";
import { PageHeader } from "../../components/layout/PageHeader";

interface IncomeEntry {
  id: string;
  concept: string;
  amount: number;
  vatPercent: number;
  vatAmount?: number;
  total?: number;
  paymentMethod: string;
  invoiceStatus: string;
  date: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
}

interface Provider { id: string; name: string; idNumber?: string; email?: string; phone?: string; address?: string; product?: string; city?: string; province?: string; bannerId?: string; isActive: boolean }
interface Payable { id: string; type: string; category: string; description: string; provider?: { id: string; name: string }; invoiceNumber?: string; invoiceDate?: string; subtotal: number; vatPercent: number; vatAmount: number; total: number; paid: number; balance: number; status: string; dueDate?: string; isRecurring: boolean; notes?: string; payments: Payment[] }
interface Payment { id: string; amount: number; date: string; method: string; reference?: string; notes?: string }

const STATUS_COLOR: Record<string, string> = {
  PENDIENTE: "bg-yellow-100 text-yellow-800",
  PARCIAL:   "bg-blue-100 text-blue-800",
  PAGADO:    "bg-green-100 text-green-800",
};

export function FinancialPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "income" | "egresos" | "providers">("dashboard");
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showPayableForm, setShowPayableForm] = useState(false);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [showPayModal, setShowPayModal] = useState<Payable | null>(null);
  
  const [editingIncome, setEditingIncome] = useState<IncomeEntry | null>(null);
  const [editingPayable, setEditingPayable] = useState<Payable | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  const loadIncomes = useCallback(async () => {
    try {
      const data = await api.get<IncomeEntry[]>("/incomes");
      setIncomes(data);
    } catch (e) {
      console.error("Error loading incomes:", e);
    }
  }, []);

  const loadPayables = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const data = await api.get<Payable[]>(`/payables?${params}`);
      setPayables(data);
    } catch (e) {
      console.error("Error loading payables:", e);
    }
  }, [statusFilter]);

  const loadProviders = useCallback(async () => {
    try {
      const data = await api.get<Provider[]>("/providers");
      setProviders(data);
    } catch (e) {
      console.error("Error loading providers:", e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "income") await loadIncomes();
      else if (activeTab === "egresos") await Promise.all([loadPayables(), loadProviders()]);
      else if (activeTab === "providers") await loadProviders();
    } finally {
      setLoading(false);
    }
  }, [activeTab, loadIncomes, loadPayables, loadProviders]);

  useEffect(() => {
    if (activeTab !== "dashboard") {
      loadAll();
    } else {
      setLoading(false);
    }
  }, [activeTab, loadAll]);

  async function deleteIncome(id: string, concept: string) {
    if (!confirm(`¿Eliminar ingreso "${concept}"?`)) return;
    try {
      await api.del(`/incomes/${id}`);
      loadIncomes();
    } catch (e) {
      alert("Error al eliminar: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  }

  async function deletePayable(id: string) {
    if (!confirm("¿Eliminar este documento?")) return;
    await api.del(`/payables/${id}`);
    loadPayables();
  }

  const filteredIncomes = incomes.filter((income) => {
    const matchSearch = income.concept.toLowerCase().includes(search.toLowerCase()) ||
      income.paymentMethod.toLowerCase().includes(search.toLowerCase());
    const matchDate = !dateFilter || income.date.startsWith(dateFilter);
    return matchSearch && matchDate;
  });

  const filteredPayables = payables.filter((p) => {
    const matchSearch = p.description.toLowerCase().includes(search.toLowerCase()) ||
      (p.provider?.name?.toLowerCase().includes(search.toLowerCase()) ?? false);
    return matchSearch;
  });

  const totalIncomes = filteredIncomes.reduce((sum, inc) => sum + (inc.total || inc.amount), 0);
  const totalEgresos = filteredPayables.reduce((sum, p) => sum + p.total, 0);
  const pendingEgresos = filteredPayables.reduce((sum, p) => sum + p.balance, 0);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
          title="Gestión Financiera"
          subtitle={<>{activeTab === "dashboard" ? "Resumen y analítica" :
             activeTab === "income" ? "Ingresos y recaudación" : 
             activeTab === "egresos" ? "Gastos, compras y pagos" : "Directorio de proveedores"}</>}
          actions={
            activeTab !== "dashboard" && (
              <button
                onClick={() => {
                  if (activeTab === "income") { setEditingIncome(null); setShowIncomeForm(true); }
                  else if (activeTab === "egresos") { setEditingPayable(null); setShowPayableForm(true); }
                  else if (activeTab === "providers") { setEditingProvider(null); setShowProviderForm(true); }
                }}
                className="btn-primary"
              >
                <Plus size={16} />
                Nuevo {activeTab === "providers" ? "Proveedor" : activeTab === "egresos" ? "Egreso" : "Ingreso"}
              </button>
            )
          }
        />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
          { id: "income",    label: "Ingresos",  icon: TrendingUp },
          { id: "egresos",   label: "Egresos",   icon: TrendingDown },
          { id: "providers", label: "Proveedores", icon: Building2 },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              setActiveTab(id as typeof activeTab);
              setSearch("");
              setDateFilter("");
              setStatusFilter("");
            }}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition ${
              activeTab === id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {activeTab !== "providers" && activeTab !== "dashboard" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {activeTab === "income" ? (
            <>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600">Total Ingresos</div>
                <div className="text-2xl font-bold text-green-600 mt-1">${totalIncomes.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-2">{filteredIncomes.length} registros</div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600">Total Egresos</div>
                <div className="text-2xl font-bold text-red-600 mt-1">${totalEgresos.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-2">{filteredPayables.length} documentos</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600">Saldo Pendiente</div>
                <div className="text-2xl font-bold text-orange-600 mt-1">${pendingEgresos.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-2">Cuentas por pagar</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Filters */}
      {activeTab !== "dashboard" && (
        <div className="flex gap-3 items-center bg-white border border-gray-200 rounded-lg p-4">
        <Search size={18} className="text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="flex-1 outline-none text-sm"
        />

        {activeTab === "income" && (
          <input
            type="month"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}

        {activeTab === "egresos" && (
          <select
            className="input w-40"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="PARCIAL">Parcial</option>
            <option value="PAGADO">Pagado</option>
          </select>
        )}

        <button
          onClick={() => {
            setSearch("");
            setDateFilter("");
            setStatusFilter("");
            loadAll();
          }}
          className="p-2 hover:bg-gray-100 rounded transition"
          title="Limpiar filtros"
        >
          <RefreshCw size={18} />
        </button>
      </div>
      )}

      {loading ? <PageLoader /> : (
        <>
          {activeTab === "dashboard" && <FinancialDashboard />}
          {activeTab === "income" && <IncomesTable incomes={filteredIncomes} onEdit={setEditingIncome} onDelete={deleteIncome} onOpenForm={() => setShowIncomeForm(true)} />}
          {activeTab === "egresos" && <EgresosTable payables={filteredPayables} onPay={setShowPayModal} onDelete={deletePayable} />}
          {activeTab === "providers" && <ProvidersTable providers={providers} onEdit={(p: Provider) => { setEditingProvider(p); setShowProviderForm(true); }} load={loadProviders} />}
        </>
      )}

      {/* Modals */}
      <IncomeEntryForm
        open={showIncomeForm}
        onClose={() => { setShowIncomeForm(false); setEditingIncome(null); }}
        income={editingIncome}
        onSaved={() => { loadIncomes(); setEditingIncome(null); }}
      />

      <PayableEntryForm 
        open={showPayableForm}
        onClose={() => { setShowPayableForm(false); setEditingPayable(null); }}
        payable={editingPayable}
        providers={providers}
        onSaved={loadPayables}
      />

      <ProviderForm 
        open={showProviderForm}
        onClose={() => { setShowProviderForm(false); setEditingProvider(null); }}
        provider={editingProvider}
        onSaved={loadProviders}
      />

      <PayModal 
        payable={showPayModal} 
        onClose={() => setShowPayModal(null)} 
        onSaved={loadPayables} 
      />
    </div>
  );
}

function IncomesTable({ incomes, onEdit, onDelete, onOpenForm }: any) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {incomes.length === 0 ? (
        <div className="p-8 text-center text-gray-500">No hay ingresos registrados</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="table-th">Concepto</th>
                  <th className="table-th text-right">Monto Base</th>
                  <th className="table-th text-right">IVA</th>
                  <th className="table-th text-right">Total</th>
                  <th className="table-th">Pago</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th">Fecha</th>
                  <th className="table-th text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {incomes.map((income: any) => (
                  <tr key={income.id} className="table-tr">
                    <td className="table-td font-medium">{income.concept}</td>
                    <td className="table-td text-right font-mono">{fmtCurrency(income.amount)}</td>
                    <td className="table-td text-right font-mono text-gray-600">
                      {fmtCurrency((income.vatPercent / 100) * income.amount)}
                    </td>
                    <td className="table-td text-right font-bold text-green-600">
                      {fmtCurrency(income.total || income.amount + (income.vatPercent / 100) * income.amount)}
                    </td>
                    <td className="table-td text-xs uppercase">{income.paymentMethod}</td>
                    <td className="table-td">
                      <Badge color={income.invoiceStatus === "PAGADO" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                        {income.invoiceStatus}
                      </Badge>
                    </td>
                    <td className="table-td text-xs">{fmt(income.date)}</td>
                    <td className="table-td text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { onEdit(income); onOpenForm(); }} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded transition"><Edit2 size={14} /></button>
                        <button onClick={() => onDelete(income.id, income.concept)} className="p-1.5 hover:bg-red-50 text-red-600 rounded transition"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EgresosTable({ payables, onPay, onDelete }: any) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {payables.length === 0 ? (
        <p className="text-center text-gray-400 py-12">Sin documentos registrados</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="table-th">Descripción</th>
                <th className="table-th">Proveedor</th>
                <th className="table-th">Categoría</th>
                <th className="table-th text-right">Total</th>
                <th className="table-th text-right">Pagado</th>
                <th className="table-th text-right">Saldo</th>
                <th className="table-th">Estado</th>
                <th className="table-th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payables.map((p: any) => (
                <tr key={p.id} className="table-tr">
                  <td className="table-td">
                    <p className="font-medium text-gray-900 text-sm">{p.description}</p>
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight">{p.type} · {p.invoiceNumber ?? "Sin factura"}</p>
                  </td>
                  <td className="table-td text-xs font-medium text-indigo-600">{p.provider?.name ?? "—"}</td>
                  <td className="table-td text-xs capitalize">{EXPENSE_CATEGORIES.find(c => c.value === p.category)?.label ?? p.category}</td>
                  <td className="table-td text-right font-medium">{fmtCurrency(p.total)}</td>
                  <td className="table-td text-right text-green-600">{fmtCurrency(p.paid)}</td>
                  <td className="table-td text-right font-semibold text-red-600">{fmtCurrency(p.balance)}</td>
                  <td className="table-td"><Badge color={STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-700"}>{p.status}</Badge></td>
                  <td className="table-td text-right">
                    <div className="flex gap-1 justify-end">
                      {p.status !== "PAGADO" && (
                        <button onClick={() => onPay(p)} className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100 transition" title="Registrar pago"><CreditCard size={14} /></button>
                      )}
                      <button onClick={() => onDelete(p.id)} className="p-1.5 hover:bg-red-50 text-red-500 rounded transition"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProvidersTable({ providers, onEdit, load }: any) {
  async function deactivate(id: string) {
    if (!confirm("¿Desactivar proveedor?")) return;
    await api.del(`/providers/${id}`);
    load();
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {providers.length === 0 ? (
        <p className="text-center text-gray-400 py-12">Sin proveedores</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="table-th">Nombre</th>
                <th className="table-th">Producto</th>
                <th className="table-th">Contacto</th>
                <th className="table-th">Localidad</th>
                <th className="table-th">Estado</th>
                <th className="table-th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p: any) => (
                <tr key={p.id} className="table-tr">
                  <td className="table-td">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-[10px] text-gray-400">{p.idNumber ?? "—"}</p>
                  </td>
                  <td className="table-td text-xs">{p.product ?? "—"}</td>
                  <td className="table-td text-xs">
                    {p.phone && <p>{p.phone}</p>}
                    {p.email && <p className="text-gray-400 truncate max-w-32">{p.email}</p>}
                  </td>
                  <td className="table-td text-xs">{[p.city, p.province].filter(Boolean).join(", ") || "—"}</td>
                  <td className="table-td"><Badge color={p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>{p.isActive ? "Activo" : "Inactivo"}</Badge></td>
                  <td className="table-td text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => onEdit(p)} className="p-1.5 hover:bg-gray-100 rounded transition">✏️</button>
                      {p.isActive && <button onClick={() => deactivate(p.id)} className="p-1.5 hover:bg-red-50 text-red-500 rounded transition"><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
