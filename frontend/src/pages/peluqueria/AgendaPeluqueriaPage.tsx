import { useState, useEffect, useMemo } from "react";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Scissors, 
  Plus, 
  Search, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  User,
  PawPrint,
  ArrowRight
} from "lucide-react";
import {
  peluqueriaApi,
  GroomingAppointment,
  GroomingService,
} from "../../lib/api";
import { clientsApi } from "../../modules/shared/api";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { Modal } from "../../components/ui/Modal";
import { fmtCurrency, fmtDateTimeLocalInput } from "../../lib/utils";
import { setHours, setMinutes, startOfToday } from "date-fns";

const STATUS_COLUMNS = [
  { key: "PENDIENTE", label: "Agendadas", color: "bg-blue-50 border-blue-200 text-blue-800" },
  { key: "RECEPCIONADA", label: "En Salón", color: "bg-amber-50 border-amber-200 text-amber-800" },
  { key: "EN_PROCESO", label: "En Baño / Corte", color: "bg-purple-50 border-purple-200 text-purple-800" },
  { key: "LISTO", label: "Listo para Entrega", color: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  { key: "COMPLETADA", label: "Entregadas / Cobradas", color: "bg-gray-50 border-gray-200 text-gray-700" },
];

export function AgendaPeluqueriaPage() {
  const [appointments, setAppointments] = useState<GroomingAppointment[]>([]);
  const [services, setServices] = useState<GroomingService[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<GroomingAppointment | null>(null);

  // New Appointment Form
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [basePrice, setBasePrice] = useState(20);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [notes, setNotes] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Collect Form
  const [collectAmount, setCollectAmount] = useState(0);
  const [collectMethod, setCollectMethod] = useState("EFECTIVO");
  const [collectNotes, setCollectNotes] = useState("");
  const [collectSaving, setCollectSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [appts, srvs] = await Promise.all([
        peluqueriaApi.getAppointments({ date: dateFilter }),
        peluqueriaApi.getServices(),
      ]);
      setAppointments(appts);
      setServices(srvs);
    } catch (err) {
      console.error("Error loading grooming data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateFilter]);

  // Load clients when opening new modal
  useEffect(() => {
    if (showNewModal) {
      clientsApi.list("?status=active").then(setClients).catch(console.error);
      const defaultTime = setMinutes(setHours(startOfToday(), 10), 0);
      setStartTime(fmtDateTimeLocalInput(defaultTime));
      if (services.length > 0 && !selectedServiceId) {
        setSelectedServiceId(services[0].id);
        setDurationMinutes(services[0].durationMinutes);
        setBasePrice(services[0].basePrice);
      }
    }
  }, [showNewModal, services]);

  const handleServiceChange = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    const s = services.find(x => x.id === serviceId);
    if (s) {
      setDurationMinutes(s.durationMinutes);
      setBasePrice(s.basePrice);
    }
  };

  const selectedClient = useMemo(() => clients.find(c => c.id === selectedClientId), [clients, selectedClientId]);

  const filteredClients = useMemo(() => {
    if (!clientSearch) return [];
    const s = clientSearch.toLowerCase();
    return clients.filter(c => 
      c.firstName.toLowerCase().includes(s) || 
      c.lastName.toLowerCase().includes(s)
    ).slice(0, 5);
  }, [clients, clientSearch]);

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) { setFormError("Selecciona un cliente"); return; }
    if (selectedPetIds.length === 0) { setFormError("Selecciona al menos una mascota"); return; }
    if (!startTime) { setFormError("Selecciona fecha y hora de inicio"); return; }

    setFormSaving(true);
    setFormError("");
    try {
      const matched = services.find(s => s.id === selectedServiceId);
      await peluqueriaApi.createAppointment({
        clientId: selectedClientId,
        petIds: selectedPetIds,
        serviceId: selectedServiceId,
        serviceName: matched?.name,
        startTime: new Date(startTime).toISOString(),
        durationMinutes,
        basePrice,
        advanceAmount,
        paymentMethod,
        notes,
      });
      setShowNewModal(false);
      resetNewForm();
      await loadData();
    } catch (err: any) {
      setFormError(err.message || "Error al agendar cita");
    } finally {
      setFormSaving(false);
    }
  };

  const resetNewForm = () => {
    setSelectedClientId("");
    setClientSearch("");
    setSelectedPetIds([]);
    setNotes("");
    setAdvanceAmount(0);
    setFormError("");
  };

  const handleUpdateStatus = async (id: string, status: any) => {
    try {
      await peluqueriaApi.updateStatus(id, { status });
      await loadData();
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const openCollect = (appt: GroomingAppointment) => {
    setSelectedAppt(appt);
    setCollectAmount(appt.pendingAmount > 0 ? appt.pendingAmount : appt.totalAmount);
    setCollectMethod(appt.paymentMethod || "EFECTIVO");
    setCollectNotes("");
    setShowCollectModal(true);
  };

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppt) return;
    setCollectSaving(true);
    try {
      await peluqueriaApi.completeAndCollect(selectedAppt.id, {
        paymentMethod: collectMethod,
        amount: collectAmount,
        notes: collectNotes,
      });
      setShowCollectModal(false);
      setSelectedAppt(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Error al cobrar cita");
    } finally {
      setCollectSaving(false);
    }
  };

  const filteredAppointments = useMemo(() => {
    return appointments.filter(a => {
      if (!search) return true;
      const s = search.toLowerCase();
      const clientName = `${a.client.firstName} ${a.client.lastName}`.toLowerCase();
      const petNames = a.pets.map(p => p.name.toLowerCase()).join(" ");
      const serviceName = a.service.toLowerCase();
      return clientName.includes(s) || petNames.includes(s) || serviceName.includes(s);
    });
  }, [appointments, search]);

  const stats = useMemo(() => {
    return {
      total: appointments.length,
      pendientes: appointments.filter(a => a.status === "PENDIENTE").length,
      enProceso: appointments.filter(a => ["RECEPCIONADA", "EN_PROCESO"].includes(a.status)).length,
      listos: appointments.filter(a => a.status === "LISTO").length,
      completadas: appointments.filter(a => a.status === "COMPLETADA").length,
      ingresosHoy: appointments.reduce((sum, a) => {
        const collected = a.incomes?.reduce((acc, inc) => acc + inc.total, 0) || 0;
        return sum + collected;
      }, 0),
    };
  }, [appointments]);

  if (loading && appointments.length === 0) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-violet-100 text-violet-700">
              <Scissors size={24} />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Agenda de Peluquería</h1>
              <p className="text-sm text-gray-500">Gestión de turnos por duración, flujo de estilismo y cobro directo</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="btn btn-secondary flex items-center gap-1.5"
            title="Refrescar"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="btn btn-primary flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700"
          >
            <Plus size={16} />
            <span>Nueva Cita</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500">Agendadas</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.pendientes}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500">En Salón / Baño</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.enProceso}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500">Listos p/ Entrega</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.listos}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500">Entregadas</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.completadas}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500">Facturado Hoy</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{fmtCurrency(stats.ingresosHoy)}</p>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="card p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <CalendarIcon size={18} className="text-gray-400" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="input text-sm py-1.5 px-3"
            />
          </div>
          <div className="relative flex-1 md:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar cliente, mascota, servicio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 text-sm py-1.5"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 self-end">
          <div className="bg-gray-100 p-1 rounded-lg flex text-xs font-medium">
            <button
              onClick={() => setViewMode("kanban")}
              className={`px-3 py-1 rounded-md transition ${viewMode === "kanban" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              Tablero de Flujo
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1 rounded-md transition ${viewMode === "list" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              Lista Detallada
            </button>
          </div>
        </div>
      </div>

      {/* Main View */}
      {viewMode === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
          {STATUS_COLUMNS.map(col => {
            const colAppts = filteredAppointments.filter(a => a.status === col.key);
            return (
              <div key={col.key} className="flex flex-col rounded-xl bg-gray-50 border border-gray-200 min-h-[500px]">
                <div className={`p-3 border-b border-gray-200 font-semibold text-xs flex items-center justify-between ${col.color}`}>
                  <span>{col.label}</span>
                  <span className="w-5 h-5 rounded-full bg-white/80 flex items-center justify-center text-xs font-bold">
                    {colAppts.length}
                  </span>
                </div>

                <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                  {colAppts.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 py-8">Sin citas</p>
                  ) : (
                    colAppts.map(appt => (
                      <div key={appt.id} className="card p-3 shadow-sm hover:shadow-md transition space-y-2.5 bg-white border border-gray-100">
                        {/* Header: Pet + Time */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {appt.pets[0]?.photoUrl ? (
                              <img src={appt.pets[0].photoUrl} alt={`Foto de ${appt.pets[0].name}`} loading="lazy" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">
                                <Scissors size={16} className="text-violet-700" />
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-sm text-gray-900 leading-tight">
                                {appt.pets.map(p => p.name).join(", ")}
                              </p>
                              <p className="text-xs text-gray-500 truncate">{appt.client.firstName} {appt.client.lastName}</p>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md">
                              <Clock size={11} />
                              {new Date(appt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <p className="text-[10px] text-gray-400 mt-0.5">{appt.durationMinutes} min</p>
                          </div>
                        </div>

                        {/* Service & Price */}
                        <div className="bg-gray-50 rounded-lg p-2 text-xs">
                          <p className="font-medium text-gray-800">{appt.service}</p>
                          <div className="flex justify-between items-center mt-1 text-[11px] text-gray-500">
                            <span>Total: <strong className="text-gray-900">{fmtCurrency(appt.totalAmount)}</strong></span>
                            {appt.pendingAmount > 0 ? (
                              <span className="text-amber-600 font-semibold">Pendiente: {fmtCurrency(appt.pendingAmount)}</span>
                            ) : (
                              <span className="text-emerald-600 font-semibold">Pagado</span>
                            )}
                          </div>
                        </div>

                        {appt.notes && (
                          <p className="text-[11px] text-gray-500 italic bg-amber-50/50 p-1.5 rounded border border-amber-100">
                            "{appt.notes}"
                          </p>
                        )}

                        {/* Actions per state */}
                        <div className="pt-1 border-t border-gray-100 flex items-center justify-between gap-1">
                          {appt.status === "PENDIENTE" && (
                            <button
                              onClick={() => handleUpdateStatus(appt.id, "RECEPCIONADA")}
                              className="w-full text-xs font-semibold py-1 px-2 rounded bg-amber-100 text-amber-800 hover:bg-amber-200 flex items-center justify-center gap-1"
                            >
                              <span>Recibir Mascota</span>
                              <ArrowRight size={12} />
                            </button>
                          )}

                          {appt.status === "RECEPCIONADA" && (
                            <button
                              onClick={() => handleUpdateStatus(appt.id, "EN_PROCESO")}
                              className="w-full text-xs font-semibold py-1 px-2 rounded bg-purple-100 text-purple-800 hover:bg-purple-200 flex items-center justify-center gap-1"
                            >
                              <span>Iniciar Servicio</span>
                              <ArrowRight size={12} />
                            </button>
                          )}

                          {appt.status === "EN_PROCESO" && (
                            <button
                              onClick={() => handleUpdateStatus(appt.id, "LISTO")}
                              className="w-full text-xs font-semibold py-1 px-2 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200 flex items-center justify-center gap-1"
                            >
                              <span>Marcar Listo</span>
                              <CheckCircle2 size={12} />
                            </button>
                          )}

                          {appt.status === "LISTO" && (
                            <button
                              onClick={() => openCollect(appt)}
                              className="w-full text-xs font-semibold py-1 px-2 rounded bg-violet-600 text-white hover:bg-violet-700 flex items-center justify-center gap-1 shadow-sm"
                            >
                              <DollarSign size={12} />
                              <span>Entregar y Cobrar</span>
                            </button>
                          )}

                          {appt.status === "COMPLETADA" && (
                            <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 w-full justify-center py-0.5">
                              <CheckCircle2 size={12} /> Entregado y Cobrado
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List Mode */
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3">Hora / Duración</th>
                  <th className="px-4 py-3">Mascota(s)</th>
                  <th className="px-4 py-3">Tutor / Cliente</th>
                  <th className="px-4 py-3">Servicio</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Total / Saldo</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-gray-400">
                      No hay citas para esta fecha
                    </td>
                  </tr>
                ) : (
                  filteredAppointments.map(appt => (
                    <tr key={appt.id} className="hover:bg-gray-50/80 transition">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-semibold text-gray-900">
                          {new Date(appt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-xs text-gray-400 block">{appt.durationMinutes} min</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {appt.pets.map(p => p.name).join(", ")}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {appt.client.firstName} {appt.client.lastName}
                        <span className="text-xs text-gray-400 block">{appt.client.phone}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium">
                        {appt.service}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge badge-gray text-xs">
                          {appt.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-gray-900">{fmtCurrency(appt.totalAmount)}</span>
                        {appt.pendingAmount > 0 && (
                          <span className="text-xs text-amber-600 block">Pendiente: {fmtCurrency(appt.pendingAmount)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {appt.status !== "COMPLETADA" ? (
                          <button
                            onClick={() => openCollect(appt)}
                            className="btn btn-secondary text-xs py-1 px-2.5 text-violet-700 hover:bg-violet-50"
                          >
                            Cobrar
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-600 font-medium">Listo</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Agendar Nueva Cita de Peluquería */}
      <Modal open={showNewModal} onClose={() => setShowNewModal(false)} title="Agendar Cita de Peluquería" size="lg">
        <form onSubmit={handleCreateAppointment} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. Cliente y Mascotas */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 uppercase">1. Cliente y Perrhijo</label>
            {!selectedClientId ? (
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="input pl-9"
                />
                {filteredClients.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {filteredClients.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedClientId(c.id);
                          setClientSearch(`${c.firstName} ${c.lastName}`);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-gray-900">{c.firstName} {c.lastName}</span>
                        <span className="text-xs text-gray-400">{c.phone || c.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-violet-50/60 border border-violet-100 rounded-xl">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-violet-600" />
                  <span className="font-semibold text-gray-900 text-sm">
                    {selectedClient?.firstName} {selectedClient?.lastName}
                  </span>
                  <span className="text-xs text-gray-500">({selectedClient?.phone})</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedClientId(""); setSelectedPetIds([]); }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Cambiar
                </button>
              </div>
            )}

            {/* Mascotas del cliente */}
            {selectedClient && (
              <div className="pt-2">
                <p className="text-xs text-gray-600 font-medium mb-1.5">Selecciona la(s) mascota(s) para la cita:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedClient.pets?.map((p: any) => {
                    const isSelected = selectedPetIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) setSelectedPetIds(prev => prev.filter(x => x !== p.id));
                          else setSelectedPetIds(prev => [...prev, p.id]);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                          isSelected 
                            ? "bg-violet-600 text-white shadow-sm" 
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        <PawPrint size={13} />
                        <span>{p.name}</span>
                        <span className="text-[10px] opacity-80">({p.breed || p.species})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <hr className="border-gray-100" />

          {/* 2. Servicio, Fecha y Duración */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-gray-700 uppercase">2. Servicio y Horario</label>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 font-medium block mb-1">Servicio de Peluquería</label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => handleServiceChange(e.target.value)}
                  className="input text-sm"
                >
                  {services.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes} min - {fmtCurrency(s.basePrice)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-600 font-medium block mb-1">Fecha y Hora de Cita</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="input text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-gray-600 font-medium block mb-1">Duración Estimada (minutos)</label>
                <input
                  type="number"
                  min={15}
                  max={300}
                  step={15}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="input text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-gray-600 font-medium block mb-1">Precio Base ($)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={basePrice}
                  onChange={(e) => setBasePrice(Number(e.target.value))}
                  className="input text-sm"
                />
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* 3. Anticipo y Notas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Anticipo Opcional ($)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                className="input text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Forma de Pago Anticipo</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="input text-sm"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="TARJETA">Tarjeta de Débito/Crédito</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-gray-600 font-medium block mb-1">Notas de Estilismo / Observaciones</label>
              <input
                type="text"
                placeholder="Ej. nudos en orejas, piel delicada, corte a tijera..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={formSaving}
              className="btn btn-primary bg-violet-600 hover:bg-violet-700 flex items-center gap-1.5"
            >
              {formSaving && <Spinner size={14} />}
              <span>Confirmar Cita</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Entregar y Cobrar Cita (independiente de la unidad de Peluquería) */}
      <Modal open={showCollectModal} onClose={() => setShowCollectModal(false)} title="Cobro y Entrega de Peluquería">
        <form onSubmit={handleCollect} className="space-y-4">
          <div className="p-3 bg-violet-50 border border-violet-100 rounded-xl space-y-1">
            <p className="text-xs text-violet-800 font-medium">Servicio: {selectedAppt?.service}</p>
            <p className="text-sm font-bold text-gray-900">
              Perrhijo: {selectedAppt?.pets.map(p => p.name).join(", ")}
            </p>
            <p className="text-xs text-gray-500">Tutor: {selectedAppt?.client.firstName} {selectedAppt?.client.lastName}</p>
          </div>

          <div>
            <label className="text-xs text-gray-600 font-medium block mb-1">Monto a Cobrar ($)</label>
            <input
              type="number"
              step={0.1}
              min={0}
              value={collectAmount}
              onChange={(e) => setCollectAmount(Number(e.target.value))}
              className="input text-base font-bold text-gray-900"
              required
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Se registrará un ingreso contable independiente a nombre de <strong>Peluquería</strong>.
            </p>
          </div>

          <div>
            <label className="text-xs text-gray-600 font-medium block mb-1">Forma de Pago</label>
            <select
              value={collectMethod}
              onChange={(e) => setCollectMethod(e.target.value)}
              className="input text-sm"
            >
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="TARJETA">Tarjeta</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-600 font-medium block mb-1">Notas de Cierre</label>
            <input
              type="text"
              placeholder="Ej. tutor satisfecho con el corte..."
              value={collectNotes}
              onChange={(e) => setCollectNotes(e.target.value)}
              className="input text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowCollectModal(false)}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={collectSaving}
              className="btn btn-primary bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5"
            >
              {collectSaving && <Spinner size={14} />}
              <span>Registrar Cobro y Entregar</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
