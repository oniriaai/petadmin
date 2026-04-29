import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, RefreshCw, CheckCircle, LogOut, XCircle, Eye } from "lucide-react";
import { api } from "../../lib/api";
import { fmt, fmtTime, fmtCurrency, STATUSES, SERVICES } from "../../lib/utils";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { NuevaReservaModal } from "./NuevaReservaModal";
import { CheckinModal } from "./CheckinModal";

interface Reservation {
  id: string;
  client: { id: string; firstName: string; lastName: string; phone?: string };
  pets: Array<{ pet: { id: string; name: string; species: string } }>;
  room?: { id: string; name: string };
  service: string;
  status: string;
  checkIn?: string;
  checkOut?: string;
  needsTransport: boolean;
  totalAmount: number;
  pendingAmount: number;
  paymentMethod?: string;
  concept?: string;
  notes?: string;
  label?: string;
}

export function ReservasPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [checkinTarget, setCheckinTarget] = useState<Reservation | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<Reservation | null>(null);
  const [selected, setSelected] = useState<Reservation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const data = await api.get<Reservation[]>(`/reservations?${params}`);
      setReservations(data);
    } finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function doCheckin(id: string, time?: string) {
    await api.post(`/reservations/${id}/checkin`, { time });
    setCheckinTarget(null);
    load();
  }

  async function doCheckout(id: string, createIncome: boolean, paymentMethod: string) {
    await api.post(`/reservations/${id}/checkout`, { createIncome, paymentMethod });
    setCheckoutTarget(null);
    load();
  }

  async function cancelReservation(id: string) {
    if (!confirm("¿Cancelar esta reserva?")) return;
    await api.del(`/reservations/${id}`);
    load();
  }

  const svc = (s: string) => SERVICES.find(x => x.value === s)?.label ?? s;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Control de Reservas</h1>
          <p className="text-gray-500 text-sm mt-1">{reservations.length} reservas</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary">
          <Plus size={16} /> Nueva Reserva
        </button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar cliente…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-44" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUSES).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button onClick={load} className="btn-ghost"><RefreshCw size={15} /></button>
      </div>

      <div className="card overflow-hidden">
        {loading ? <PageLoader /> : reservations.length === 0 ? (
          <p className="text-center text-gray-400 py-16">Sin reservas. ¡Crea la primera!</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Cliente / Mascotas</th>
                <th className="table-th">Servicio</th>
                <th className="table-th">Sala</th>
                <th className="table-th">Entrada</th>
                <th className="table-th">Salida</th>
                <th className="table-th">Total</th>
                <th className="table-th">Estado</th>
                <th className="table-th">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map(r => {
                const st = STATUSES[r.status] ?? { label: r.status, color: "bg-gray-100 text-gray-700" };
                return (
                  <tr key={r.id} className="table-tr">
                    <td className="table-td">
                      <p className="font-medium text-gray-900">{r.client.firstName} {r.client.lastName}</p>
                      <p className="text-xs text-gray-400">{r.pets.map(p => p.pet.name).join(", ")}</p>
                    </td>
                    <td className="table-td">
                      <span className="text-xs">{svc(r.service)}</span>
                      {r.needsTransport && <span className="ml-1">🚗</span>}
                    </td>
                    <td className="table-td text-xs">{r.room?.name ?? "—"}</td>
                    <td className="table-td text-xs">{r.checkIn ? <><div>{fmt(r.checkIn)}</div><div className="text-gray-400">{fmtTime(r.checkIn)}</div></> : "—"}</td>
                    <td className="table-td text-xs">{r.checkOut ? <><div>{fmt(r.checkOut)}</div><div className="text-gray-400">{fmtTime(r.checkOut)}</div></> : "—"}</td>
                    <td className="table-td font-medium">{fmtCurrency(r.totalAmount)}</td>
                    <td className="table-td"><Badge color={st.color}>{st.label}</Badge></td>
                    <td className="table-td">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setSelected(r)} className="btn-ghost btn-sm p-1.5" title="Ver detalle"><Eye size={14} /></button>
                        {r.status === "CONFIRMADA" && (
                          <button onClick={() => setCheckinTarget(r)} className="btn-success btn-sm" title="Hacer entrada"><CheckCircle size={14} /></button>
                        )}
                        {r.status === "ACTIVA" && (
                          <button onClick={() => setCheckoutTarget(r)} className="btn-warning btn-sm" title="Hacer salida"><LogOut size={14} /></button>
                        )}
                        {["PENDIENTE", "CONFIRMADA"].includes(r.status) && (
                          <button onClick={() => cancelReservation(r.id)} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50" title="Cancelar"><XCircle size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <NuevaReservaModal open={showNew} onClose={() => setShowNew(false)} onSaved={load} />

      <CheckinModal
        open={!!checkinTarget}
        onClose={() => setCheckinTarget(null)}
        reservation={checkinTarget}
        mode="checkin"
        onConfirm={(id, time) => doCheckin(id, time)}
      />
      <CheckinModal
        open={!!checkoutTarget}
        onClose={() => setCheckoutTarget(null)}
        reservation={checkoutTarget}
        mode="checkout"
        onConfirm={(id, _time, createIncome, method) => doCheckout(id, createIncome ?? false, method ?? "EFECTIVO")}
      />

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Detalle de Reserva" size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="label">Cliente</p><p>{selected.client.firstName} {selected.client.lastName}</p></div>
              <div><p className="label">Mascotas</p><p>{selected.pets.map(p => p.pet.name).join(", ")}</p></div>
              <div><p className="label">Servicio</p><p>{svc(selected.service)}</p></div>
              <div><p className="label">Sala</p><p>{selected.room?.name ?? "—"}</p></div>
              <div><p className="label">Entrada</p><p>{selected.checkIn ? `${fmt(selected.checkIn)} ${fmtTime(selected.checkIn)}` : "—"}</p></div>
              <div><p className="label">Salida</p><p>{selected.checkOut ? `${fmt(selected.checkOut)} ${fmtTime(selected.checkOut)}` : "—"}</p></div>
              <div><p className="label">Total</p><p className="font-semibold text-lg">{fmtCurrency(selected.totalAmount)}</p></div>
              <div><p className="label">Pendiente</p><p className="font-semibold text-red-600">{fmtCurrency(selected.pendingAmount)}</p></div>
              <div><p className="label">Forma de pago</p><p>{selected.paymentMethod ?? "—"}</p></div>
              <div><p className="label">Transporte</p><p>{selected.needsTransport ? "Sí" : "No"}</p></div>
            </div>
            {selected.concept && <div><p className="label">Concepto</p><p>{selected.concept}</p></div>}
            {selected.notes && <div><p className="label">Notas</p><p className="text-gray-600">{selected.notes}</p></div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
