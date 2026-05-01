import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Plus, Edit2, Trash2, RefreshCw, Search, TrendingUp, TrendingDown, ShoppingCart, BarChart3 } from "lucide-react";
import { api } from "../../lib/api";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { IncomeEntryForm } from "./IncomeEntryForm";
import { ExpenseEntryForm } from "./ExpenseEntryForm";

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

interface ExpenseEntry {
  id: string;
  category: string;
  description: string;
  amount: number;
  provider: string;
  date: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
}

interface PurchaseEntry {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  provider: string;
  date: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
}

export function FinancialPage() {
  const [activeTab, setActiveTab] = useState<"income" | "expenses" | "purchases">("income");
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeEntry | null>(null);
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseEntry | null>(null);

  const loadIncomes = useCallback(async () => {
    try {
      const data = await api.get<IncomeEntry[]>("/financial/incomes");
      setIncomes(data);
    } catch (e) {
      console.error("Error loading incomes:", e);
    }
  }, []);

  const loadExpenses = useCallback(async () => {
    try {
      const data = await api.get<ExpenseEntry[]>("/financial/expenses");
      setExpenses(data);
    } catch (e) {
      console.error("Error loading expenses:", e);
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    try {
      const data = await api.get<PurchaseEntry[]>("/financial/purchases");
      setPurchases(data);
    } catch (e) {
      console.error("Error loading purchases:", e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadIncomes(), loadExpenses(), loadPurchases()]);
    } finally {
      setLoading(false);
    }
  }, [loadIncomes, loadExpenses, loadPurchases]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function deleteIncome(id: string, concept: string) {
    if (!confirm(`¿Eliminar ingreso "${concept}"?`)) return;
    try {
      await api.del(`/financial/incomes/${id}`);
      loadIncomes();
    } catch (e) {
      alert("Error al eliminar: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  }

  async function deleteExpense(id: string, description: string) {
    if (!confirm(`¿Eliminar gasto "${description}"?`)) return;
    try {
      await api.del(`/financial/expenses/${id}`);
      loadExpenses();
    } catch (e) {
      alert("Error al eliminar: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  }

  async function deletePurchase(id: string, description: string) {
    if (!confirm(`¿Eliminar compra "${description}"?`)) return;
    try {
      await api.del(`/financial/purchases/${id}`);
      loadPurchases();
    } catch (e) {
      alert("Error al eliminar: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-CO", { month: "short", day: "numeric", year: "numeric" });
  };

  const filteredIncomes = incomes.filter((income) => {
    const matchSearch = income.concept.toLowerCase().includes(search.toLowerCase()) ||
      income.paymentMethod.toLowerCase().includes(search.toLowerCase());
    const matchDate = !dateFilter || income.date.startsWith(dateFilter);
    return matchSearch && matchDate;
  });

  const filteredExpenses = expenses.filter((expense) => {
    const matchSearch = expense.description.toLowerCase().includes(search.toLowerCase()) ||
      expense.provider.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !categoryFilter || expense.category === categoryFilter;
    const matchDate = !dateFilter || expense.date.startsWith(dateFilter);
    return matchSearch && matchCategory && matchDate;
  });

  const filteredPurchases = purchases.filter((purchase) => {
    const matchSearch = purchase.description.toLowerCase().includes(search.toLowerCase()) ||
      purchase.provider.toLowerCase().includes(search.toLowerCase());
    const matchDate = !dateFilter || purchase.date.startsWith(dateFilter);
    return matchSearch && matchDate;
  });

  const totalIncomes = filteredIncomes.reduce((sum, inc) => sum + (inc.total || inc.amount), 0);
  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalPurchases = filteredPurchases.reduce((sum, pur) => sum + pur.totalPrice, 0);

  if (loading) return <PageLoader />;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Gestión Financiera</h1>
          <p className="text-gray-500 text-sm mt-1">Ingresos, gastos y compras</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/transacciones/dashboard"
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
          >
            <BarChart3 size={20} />
            Dashboard
          </Link>
          <button
            onClick={() => {
              if (activeTab === "income") setShowIncomeForm(true);
              else if (activeTab === "expenses") setShowExpenseForm(true);
              else setShowPurchaseForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={20} />
            Nuevo
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: "income", label: "Ingresos", icon: TrendingUp },
          { id: "expenses", label: "Gastos", icon: TrendingDown },
          { id: "purchases", label: "Compras", icon: ShoppingCart },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              setActiveTab(id as typeof activeTab);
              setSearch("");
              setDateFilter("");
              setCategoryFilter("");
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

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600">Total Ingresos</div>
          <div className="text-2xl font-bold text-green-600 mt-1">${totalIncomes.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-2">{filteredIncomes.length} registros</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600">Total Gastos</div>
          <div className="text-2xl font-bold text-red-600 mt-1">${totalExpenses.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-2">{filteredExpenses.length} registros</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600">Total Compras</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">${totalPurchases.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-2">{filteredPurchases.length} registros</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center bg-white border border-gray-200 rounded-lg p-4">
        <Search size={18} className="text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            activeTab === "income"
              ? "Buscar concepto o método..."
              : activeTab === "expenses"
              ? "Buscar descripción o proveedor..."
              : "Buscar descripción o proveedor..."
          }
          className="flex-1 outline-none text-sm"
        />

        <input
          type="month"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />

        {activeTab === "expenses" && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las categorías</option>
            <option value="SUMINISTROS">Suministros</option>
            <option value="SERVICIOS">Servicios</option>
            <option value="PERSONAL">Personal</option>
            <option value="UTILIDADES">Utilidades</option>
            <option value="MANTENIMIENTO">Mantenimiento</option>
            <option value="OTRO">Otro</option>
          </select>
        )}

        <button
          onClick={() => {
            setSearch("");
            setDateFilter("");
            setCategoryFilter("");
            loadAll();
          }}
          className="p-2 hover:bg-gray-100 rounded transition"
          title="Limpiar filtros"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Income Tab */}
      {activeTab === "income" && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {filteredIncomes.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No hay ingresos registrados</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Concepto</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Monto Base</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">IVA</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Total</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Pago</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Estado</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Fecha</th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIncomes.map((income) => (
                    <tr key={income.id} className="border-b hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm">{income.concept}</td>
                      <td className="px-6 py-4 text-sm text-right font-mono">${income.amount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-right font-mono text-gray-600">
                        ${((income.vatPercent / 100) * income.amount).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-green-600">
                        ${((income.total || income.amount + (income.vatPercent / 100) * income.amount)).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm">{income.paymentMethod}</td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            income.invoiceStatus === "PAGADO"
                              ? "bg-green-100 text-green-800"
                              : income.invoiceStatus === "PENDIENTE"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {income.invoiceStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(income.date)}</td>
                      <td className="px-6 py-4 text-right flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setEditingIncome(income);
                            setShowIncomeForm(true);
                          }}
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded transition"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => deleteIncome(income.id, income.concept)}
                          className="p-2 hover:bg-red-50 text-red-600 rounded transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Expenses Tab */}
      {activeTab === "expenses" && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {filteredExpenses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No hay gastos registrados</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Descripción</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Categoría</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Monto</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Proveedor</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Fecha</th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="border-b hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm">{expense.description}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {expense.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-red-600">
                        ${expense.amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{expense.provider}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(expense.date)}</td>
                      <td className="px-6 py-4 text-right flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setEditingExpense(expense);
                            setShowExpenseForm(true);
                          }}
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded transition"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => deleteExpense(expense.id, expense.description)}
                          className="p-2 hover:bg-red-50 text-red-600 rounded transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Purchases Tab */}
      {activeTab === "purchases" && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {filteredPurchases.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No hay compras registradas</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Descripción</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Cantidad</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Precio Unit.</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Total</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Proveedor</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Fecha</th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map((purchase) => (
                    <tr key={purchase.id} className="border-b hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm">{purchase.description}</td>
                      <td className="px-6 py-4 text-sm text-center font-mono">{purchase.quantity}</td>
                      <td className="px-6 py-4 text-sm text-right font-mono">${purchase.unitPrice.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-blue-600">
                        ${purchase.totalPrice.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{purchase.provider}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(purchase.date)}</td>
                      <td className="px-6 py-4 text-right flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setEditingPurchase(purchase);
                            setShowPurchaseForm(true);
                          }}
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded transition"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => deletePurchase(purchase.id, purchase.description)}
                          className="p-2 hover:bg-red-50 text-red-600 rounded transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <IncomeEntryForm
        open={showIncomeForm}
        onClose={() => {
          setShowIncomeForm(false);
          setEditingIncome(null);
        }}
        income={editingIncome}
        onSaved={() => {
          loadIncomes();
          setEditingIncome(null);
        }}
      />

      <ExpenseEntryForm
        open={showExpenseForm}
        onClose={() => {
          setShowExpenseForm(false);
          setEditingExpense(null);
        }}
        type="expense"
        entry={editingExpense}
        onSaved={() => {
          loadExpenses();
          setEditingExpense(null);
        }}
      />

      <ExpenseEntryForm
        open={showPurchaseForm}
        onClose={() => {
          setShowPurchaseForm(false);
          setEditingPurchase(null);
        }}
        type="purchase"
        entry={editingPurchase}
        onSaved={() => {
          loadPurchases();
          setEditingPurchase(null);
        }}
      />
    </div>
  );
}
