import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, Trash2, CreditCard, ChevronDown } from "lucide-react";
import { api } from "../../lib/api";
import { fmt, fmtCurrency, EXPENSE_CATEGORIES, PAYMENT_METHODS } from "../../lib/utils";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";

type Tab = "proveedores" | "gastos" | "pagos";

interface Provider { id: string; name: string; idNumber?: string; email?: string; phone?: string; address?: string; product?: string; city?: string; province?: string; bannerId?: string; isActive: boolean }
interface Payable { id: string; type: string; category: string; description: string; provider?: { id: string; name: string }; invoiceNumber?: string; invoiceDate?: string; subtotal: number; vatPercent: number; vatAmount: number; total: number; paid: number; balance: number; status: string; dueDate?: string; isRecurring: boolean; notes?: string; payments: Payment[] }
interface Payment { id: string; amount: number; date: string; method: string; reference?: string; notes?: string }

const STATUS_COLOR: Record<string, string> = {
  PENDIENTE: "bg-yellow-100 text-yellow-800",
  PARCIAL:   "bg-blue-100 text-blue-800",
  PAGADO:    "bg-green-100 text-green-800",
};

export function AdministrativaPage() {
  const [tab, setTab] = useState<Tab>("gastos");

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="page-title">Gestión Administrativa</h1>
        <p className="text-gray-500 text-sm mt-1">Proveedores, gastos, compras y pagos</p>
      </div>
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([["gastos", "💸 Gastos y Compras"], ["pagos", "💳 Pagos"], ["proveedores", "🏢 Proveedores"]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "gastos" && <GastosTab />}
      {tab === "pagos" && <PagosTab />}
      {tab === "proveedores" && <ProveedoresTab />}
    </div>
  );
}

function GastosTab() {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPay, setShowPay] = useState<Payable | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState({ type: "GASTO", category: "renta", description: "", providerId: "", invoiceNumber: "", invoiceDate: "", subtotal: "", vatPercent: "0", dueDate: "", isRecurring: false, notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      const [p, pr] = await Promise.all([api.get<Payable[]>(`/payables?${params}`), api.get<Provider[]>("/providers?status=active")]);
      setPayables(p); setProviders(pr);
    } finally { setLoading(false); }
  }, [typeFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function savePayable() {
    setSaving(true);
    try {
      await api.post("/payables", { ...form, subtotal: +form.subtotal, vatPercent: +form.vatPercent, providerId: form.providerId || undefined, invoiceDate: form.invoiceDate || undefined, dueDate: form.dueDate || undefined });
      setShowForm(false); setForm({ type: "GASTO", category: "renta", description: "", providerId: "", invoiceNumber: "", invoiceDate: "", subtotal: "", vatPercent: "0", dueDate: "", isRecurring: false, notes: "" });
      load();
    } finally { setSaving(false); }
  }

  async function deletePayable(id: string) {
    if (!confirm("¿Eliminar este documento?")) return;
    await api.del(`/payables/${id}`);
    load();
  }

  return (
    <>
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2">
          <select className="input w-36" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">Tipo: Todos</option>
            <option value="GASTO">Gasto</option>
            <option value="COMPRA">Compra</option>
          </select>
          <select className="input w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Estado: Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="PARCIAL">Parcial</option>
            <option value="PAGADO">Pagado</option>
          </select>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus size={16} /> Nuevo</button>
      </div>

      <div className="card overflow-hidden">
        {loading ? <PageLoader /> : payables.length === 0 ? (
          <p className="text-center text-gray-400 py-12">Sin documentos registrados</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Descripción</th>
                <th className="table-th">Proveedor</th>
                <th className="table-th">Categoría</th>
                <th className="table-th">Total</th>
                <th className="table-th">Pagado</th>
                <th className="table-th">Saldo</th>
                <th className="table-th">Estado</th>
                <th className="table-th">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payables.map(p => (
                <tr key={p.id} className="table-tr">
                  <td className="table-td">
                    <p className="font-medium text-gray-900 text-sm">{p.description}</p>
                    <p className="text-xs text-gray-400">{p.type} · {p.invoiceNumber ?? "Sin factura"}</p>
                  </td>
                  <td className="table-td text-xs">{p.provider?.name ?? "—"}</td>
                  <td className="table-td text-xs capitalize">{EXPENSE_CATEGORIES.find(c => c.value === p.category)?.label ?? p.category}</td>
                  <td className="table-td font-medium">{fmtCurrency(p.total)}</td>
                  <td className="table-td text-green-600">{fmtCurrency(p.paid)}</td>
                  <td className="table-td font-semibold text-red-600">{fmtCurrency(p.balance)}</td>
                  <td className="table-td"><Badge color={STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-700"}>{p.status}</Badge></td>
                  <td className="table-td">
                    <div className="flex gap-1">
                      {p.status !== "PAGADO" && (
                        <button onClick={() => setShowPay(p)} className="btn-success btn-sm" title="Registrar pago"><CreditCard size={13} /></button>
                      )}
                      <button onClick={() => deletePayable(p.id)} className="btn-ghost btn-sm p-1.5 text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuevo Gasto / Compra" size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={savePayable} disabled={saving}>{saving ? <Spinner size={14} /> : null} Guardar</button>
          </>
        }>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="GASTO">Gasto</option>
              <option value="COMPRA">Compra</option>
            </select>
          </div>
          <div>
            <label className="label">Categoría</label>
            <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="col-span-2"><label className="label">Descripción *</label><input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div>
            <label className="label">Proveedor</label>
            <select className="input" value={form.providerId} onChange={e => setForm(f => ({ ...f, providerId: e.target.value }))}>
              <option value="">— Sin proveedor —</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="label">No. Factura</label><input className="input" value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} /></div>
          <div><label className="label">Fecha factura</label><input className="input" type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} /></div>
          <div><label className="label">Fecha de vencimiento</label><input className="input" type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
          <div><label className="label">Subtotal ($) *</label><input className="input" type="number" min="0" step="0.01" value={form.subtotal} onChange={e => setForm(f => ({ ...f, subtotal: e.target.value }))} /></div>
          <div><label className="label">IVA (%)</label><input className="input" type="number" min="0" value={form.vatPercent} onChange={e => setForm(f => ({ ...f, vatPercent: e.target.value }))} /></div>
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" checked={form.isRecurring} onChange={e => setForm(f => ({ ...f, isRecurring: e.target.checked }))} className="w-4 h-4 rounded" />
            <label className="text-sm text-gray-700">Gasto recurrente</label>
          </div>
          <div className="col-span-2"><label className="label">Notas</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
      </Modal>

      <PayModal payable={showPay} onClose={() => setShowPay(null)} onSaved={load} />
    </>
  );
}

function PayModal({ payable, onClose, onSaved }: { payable: Payable | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("EFECTIVO");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (payable) setAmount(payable.balance.toFixed(2)); }, [payable]);

  async function save() {
    if (!payable) return;
    setSaving(true);
    try {
      await api.post(`/payables/${payable.id}/payments`, { amount: +amount, method, reference, date });
      onClose(); onSaved();
    } finally { setSaving(false); }
  }

  return (
    <Modal open={!!payable} onClose={onClose} title="Registrar Pago" size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-success" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null} Registrar pago</button>
        </>
      }>
      {payable && (
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg text-sm">
            <p className="font-medium">{payable.description}</p>
            <p className="text-gray-500">Saldo pendiente: <strong className="text-red-600">{fmtCurrency(payable.balance)}</strong></p>
          </div>
          <div><label className="label">Monto a pagar ($)</label><input className="input" type="number" min="0.01" step="0.01" max={payable.balance} value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><label className="label">Forma de pago</label><select className="input" value={method} onChange={e => setMethod(e.target.value)}>{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
          <div><label className="label">Referencia / Comprobante</label><input className="input" value={reference} onChange={e => setReference(e.target.value)} /></div>
          <div><label className="label">Fecha de pago</label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        </div>
      )}
    </Modal>
  );
}

function PagosTab() {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Payable[]>("/payables").then(data => {
      setPayables(data.filter(p => p.payments.length > 0));
      setLoading(false);
    });
  }, []);

  const allPayments = payables.flatMap(p => p.payments.map(pay => ({ ...pay, payable: p })));
  allPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="card overflow-hidden">
      {loading ? <PageLoader /> : allPayments.length === 0 ? (
        <p className="text-center text-gray-400 py-12">Sin pagos registrados</p>
      ) : (
        <table className="w-full">
          <thead><tr>
            <th className="table-th">Fecha</th>
            <th className="table-th">Concepto</th>
            <th className="table-th">Monto</th>
            <th className="table-th">Forma de pago</th>
            <th className="table-th">Referencia</th>
          </tr></thead>
          <tbody>
            {allPayments.map(pay => (
              <tr key={pay.id} className="table-tr">
                <td className="table-td text-xs">{fmt(pay.date)}</td>
                <td className="table-td text-sm">{pay.payable.description}</td>
                <td className="table-td font-semibold text-green-600">{fmtCurrency(pay.amount)}</td>
                <td className="table-td text-xs">{pay.method}</td>
                <td className="table-td text-xs">{pay.reference ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ProveedoresTab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProvider, setEditProvider] = useState<Provider | null>(null);
  const [form, setForm] = useState({ name: "", idNumber: "", email: "", phone: "", address: "", city: "", province: "", product: "", bannerId: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    api.get<Provider[]>(`/providers?${params}`).then(setProviders).finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (editProvider) setForm({ name: editProvider.name, idNumber: editProvider.idNumber ?? "", email: editProvider.email ?? "", phone: editProvider.phone ?? "", address: editProvider.address ?? "", city: editProvider.city ?? "", province: editProvider.province ?? "", product: editProvider.product ?? "", bannerId: editProvider.bannerId ?? "" });
    else setForm({ name: "", idNumber: "", email: "", phone: "", address: "", city: "", province: "", product: "", bannerId: "" });
  }, [editProvider, showForm]);

  async function save() {
    setSaving(true);
    try {
      if (editProvider) await api.put(`/providers/${editProvider.id}`, form);
      else await api.post("/providers", form);
      setShowForm(false); setEditProvider(null); load();
    } finally { setSaving(false); }
  }

  async function deactivate(id: string) {
    if (!confirm("¿Desactivar proveedor?")) return;
    await api.del(`/providers/${id}`);
    load();
  }

  return (
    <>
      <div className="flex gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar proveedor…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => { setEditProvider(null); setShowForm(true); }} className="btn-primary"><Plus size={16} /> Nuevo Proveedor</button>
      </div>
      <div className="card overflow-hidden">
        {loading ? <PageLoader /> : providers.length === 0 ? (
          <p className="text-center text-gray-400 py-12">Sin proveedores</p>
        ) : (
          <table className="w-full">
            <thead><tr>
              <th className="table-th">Nombre</th>
              <th className="table-th">Cédula / RUC</th>
              <th className="table-th">Producto</th>
              <th className="table-th">Contacto</th>
              <th className="table-th">Localidad</th>
              <th className="table-th">Estado</th>
              <th className="table-th">Acciones</th>
            </tr></thead>
            <tbody>
              {providers.map(p => (
                <tr key={p.id} className="table-tr">
                  <td className="table-td font-medium">{p.name}</td>
                  <td className="table-td text-xs">{p.idNumber ?? "—"}</td>
                  <td className="table-td text-xs">{p.product ?? "—"}</td>
                  <td className="table-td text-xs">
                    {p.phone && <p>{p.phone}</p>}
                    {p.email && <p className="text-gray-400 truncate max-w-32">{p.email}</p>}
                  </td>
                  <td className="table-td text-xs">{[p.city, p.province].filter(Boolean).join(", ") || "—"}</td>
                  <td className="table-td"><Badge color={p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>{p.isActive ? "Activo" : "Inactivo"}</Badge></td>
                  <td className="table-td">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditProvider(p); setShowForm(true); }} className="btn-ghost btn-sm p-1.5">✏️</button>
                      {p.isActive && <button onClick={() => deactivate(p.id)} className="btn-ghost btn-sm p-1.5 text-red-500"><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditProvider(null); }} title={editProvider ? "Editar Proveedor" : "Nuevo Proveedor"} size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => { setShowForm(false); setEditProvider(null); }}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null} Guardar</button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="label">Nombre *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="label">Cédula / RUC</label><input className="input" value={form.idNumber} onChange={e => setForm(f => ({ ...f, idNumber: e.target.value }))} /></div>
          <div><label className="label">Producto / Servicio</label><input className="input" value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div><label className="label">Teléfono</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className="label">Ciudad</label><input className="input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
          <div><label className="label">Provincia</label><input className="input" value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value }))} /></div>
          <div className="col-span-2"><label className="label">Dirección</label><input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
        </div>
      </Modal>
    </>
  );
}
