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
  ArrowRight,
} from "lucide-react";
import { peluqueriaApi, GroomingAppointment, GroomingService } from "../../lib/api";
import { clientsApi } from "../../modules/shared/api";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/layout/PageHeader";
import { Stat, StatStrip } from "../../components/ui/Stat";

import { fmtCurrency, fmtDateTimeLocalInput, fmtTime } from "../../lib/utils";
import { setHours, setMinutes, startOfToday } from "date-fns";

const STATUS_COLUMNS = [
  { key: "PENDIENTE", label: "Agendadas", color: "bg-info-soft border-info-line text-info-ink" },
  {
    key: "RECEPCIONADA",
    label: "En Salón",
    color: "bg-warning-soft border-warning-line text-warning-ink",
  },
  {
    key: "EN_PROCESO",
    label: "En Baño / Corte",
    color: "bg-grooming-50 border-grooming-200 text-grooming-800",
  },
  {
    key: "LISTO",
    label: "Listo para Entrega",
    color: "bg-success-soft border-success-line text-success-ink",
  },
  {
    key: "COMPLETADA",
    label: "Entregadas / Cobradas",
    color: "bg-sunken border-line-subtle text-muted",
  },
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
    const s = services.find((x) => x.id === serviceId);
    if (s) {
      setDurationMinutes(s.durationMinutes);
      setBasePrice(s.basePrice);
    }
  };

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId),
    [clients, selectedClientId],
  );

  const filteredClients = useMemo(() => {
    if (!clientSearch) return [];
    const s = clientSearch.toLowerCase();
    return clients
      .filter((c) => c.firstName.toLowerCase().includes(s) || c.lastName.toLowerCase().includes(s))
      .slice(0, 5);
  }, [clients, clientSearch]);

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      setFormError("Selecciona un cliente");
      return;
    }
    if (selectedPetIds.length === 0) {
      setFormError("Selecciona al menos una mascota");
      return;
    }
    if (!startTime) {
      setFormError("Selecciona fecha y hora de inicio");
      return;
    }

    setFormSaving(true);
    setFormError("");
    try {
      const matched = services.find((s) => s.id === selectedServiceId);
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
      setFormError(err.message || "No pudimos agendar la cita. Inténtalo de nuevo.");
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
      alert(err.message || "No pudimos registrar el cobro. Inténtalo de nuevo.");
    } finally {
      setCollectSaving(false);
    }
  };

  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (!search) return true;
      const s = search.toLowerCase();
      const clientName = `${a.client.firstName} ${a.client.lastName}`.toLowerCase();
      const petNames = a.pets.map((p) => p.name.toLowerCase()).join(" ");
      const serviceName = a.service.toLowerCase();
      return clientName.includes(s) || petNames.includes(s) || serviceName.includes(s);
    });
  }, [appointments, search]);

  const stats = useMemo(() => {
    return {
      total: appointments.length,
      pendientes: appointments.filter((a) => a.status === "PENDIENTE").length,
      enProceso: appointments.filter((a) => ["RECEPCIONADA", "EN_PROCESO"].includes(a.status))
        .length,
      listos: appointments.filter((a) => a.status === "LISTO").length,
      completadas: appointments.filter((a) => a.status === "COMPLETADA").length,
      ingresosHoy: appointments.reduce((sum, a) => {
        const collected = a.incomes?.reduce((acc, inc) => acc + inc.total, 0) || 0;
        return sum + collected;
      }, 0),
    };
  }, [appointments]);

  if (loading && appointments.length === 0) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        icon={
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-grooming-100 text-grooming-700">
            <Scissors size={20} aria-hidden="true" />
          </span>
        }
        title="Agenda de Peluquería"
        subtitle="Turnos por duración, flujo de estilismo y cobro directo."
        actions={
          <>
            <button
              onClick={() => loadData()}
              className="btn-secondary"
              aria-label="Actualizar"
              title="Actualizar"
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="btn-primary bg-grooming-600 hover:bg-grooming-700"
            >
              <Plus size={16} aria-hidden="true" />
              Nueva Cita
            </button>
          </>
        }
      />

      <StatStrip>
        <Stat label="Agendadas" value={stats.pendientes} />
        <Stat label="En salón o baño" value={stats.enProceso} />
        <Stat label="Listos para entrega" value={stats.listos} />
        <Stat label="Entregadas" value={stats.completadas} />
        <Stat label="Facturado hoy" value={fmtCurrency(stats.ingresosHoy)} />
      </StatStrip>

      {/* Controls Bar */}
      <div className="card p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <CalendarIcon size={18} className="text-faint" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="input text-sm py-1.5 px-3"
            />
          </div>
          <div className="relative flex-1 md:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="text"
              placeholder="Buscar cliente, mascota o servicio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 text-sm py-1.5"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 self-end">
          <div className="bg-sunken p-1 rounded-lg flex text-xs font-medium">
            <button
              onClick={() => setViewMode("kanban")}
              className={`px-3 py-1 rounded-md transition ${viewMode === "kanban" ? "bg-surface text-ink shadow-xs" : "text-muted"}`}
            >
              Tablero de Flujo
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1 rounded-md transition ${viewMode === "list" ? "bg-surface text-ink shadow-xs" : "text-muted"}`}
            >
              Lista Detallada
            </button>
          </div>
        </div>
      </div>

      {/* Main View */}
      {viewMode === "kanban" ? (
        <div className="flex snap-x gap-3 overflow-x-auto pb-4 md:grid md:grid-cols-5 md:overflow-visible">
          {STATUS_COLUMNS.map((col) => {
            const colAppts = filteredAppointments.filter((a) => a.status === col.key);
            return (
              <div
                key={col.key}
                className="flex w-[82vw] max-w-xs shrink-0 snap-start flex-col rounded-xl border border-line-subtle bg-sunken md:w-auto md:max-w-none md:min-h-[24rem]"
              >
                <div className="sticky top-0 flex items-center justify-between rounded-t-xl border-b border-line-subtle bg-sunken px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
                  <span>{col.label}</span>
                  <span className={`badge px-2 tabular-nums ${col.color}`}>{colAppts.length}</span>
                </div>

                <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                  {colAppts.length === 0 ? (
                    <p className="text-center text-xs text-muted py-8">Nada por aquí todavía</p>
                  ) : (
                    colAppts.map((appt) => (
                      <div key={appt.id} className="card space-y-2.5 p-3">
                        {/* Header: Pet + Time */}
                        <div className="flex items-start gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            {appt.pets[0]?.photoUrl ? (
                              <img
                                src={appt.pets[0].photoUrl}
                                alt={`Foto de ${appt.pets[0].name}`}
                                loading="lazy"
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 shrink-0 rounded-full bg-grooming-100 text-grooming-700 flex items-center justify-center">
                                <Scissors size={16} className="text-grooming-700" />
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-sm text-ink leading-tight">
                                {appt.pets.map((p) => p.name).join(", ")}
                              </p>
                              <p className="text-xs text-muted truncate">
                                {appt.client.firstName} {appt.client.lastName}
                              </p>
                            </div>
                          </div>
                        </div>
                        <p className="flex items-center gap-1.5 text-xs text-muted tabular-nums">
                          <Clock size={12} className="text-grooming-600" aria-hidden="true" />
                          <span className="font-semibold text-grooming-700">
                            {fmtTime(appt.startTime)}
                          </span>
                          · {appt.durationMinutes} min
                        </p>

                        {/* Service & Price */}
                        <div className="bg-sunken rounded-lg p-2 text-xs">
                          <p className="font-medium text-ink">{appt.service}</p>
                          <div className="flex justify-between items-center mt-1 text-[11px] text-muted">
                            <span>
                              Total:{" "}
                              <strong className="text-ink">{fmtCurrency(appt.totalAmount)}</strong>
                            </span>
                            {appt.pendingAmount > 0 ? (
                              <span className="text-warning-ink font-semibold">
                                Pendiente: {fmtCurrency(appt.pendingAmount)}
                              </span>
                            ) : (
                              <span className="text-success font-semibold">Pagado</span>
                            )}
                          </div>
                        </div>

                        {appt.notes && (
                          <p className="text-[11px] text-muted italic bg-warning-soft p-1.5 rounded-sm border border-warning-line">
                            "{appt.notes}"
                          </p>
                        )}

                        {/* Actions per state */}
                        <div className="pt-1 border-t border-line-subtle flex items-center justify-between gap-1">
                          {appt.status === "PENDIENTE" && (
                            <button
                              onClick={() => handleUpdateStatus(appt.id, "RECEPCIONADA")}
                              className="btn-secondary btn-sm w-full justify-center"
                            >
                              <span>Recibir mascota</span>
                              <ArrowRight size={12} />
                            </button>
                          )}

                          {appt.status === "RECEPCIONADA" && (
                            <button
                              onClick={() => handleUpdateStatus(appt.id, "EN_PROCESO")}
                              className="btn-secondary btn-sm w-full justify-center"
                            >
                              <span>Iniciar Servicio</span>
                              <ArrowRight size={12} />
                            </button>
                          )}

                          {appt.status === "EN_PROCESO" && (
                            <button
                              onClick={() => handleUpdateStatus(appt.id, "LISTO")}
                              className="btn-secondary btn-sm w-full justify-center"
                            >
                              <span>Marcar Listo</span>
                              <CheckCircle2 size={12} />
                            </button>
                          )}

                          {appt.status === "LISTO" && (
                            <button
                              onClick={() => openCollect(appt)}
                              className="btn-primary btn-sm w-full justify-center bg-grooming-600 hover:bg-grooming-700"
                            >
                              <DollarSign size={12} />
                              <span>Entregar y Cobrar</span>
                            </button>
                          )}

                          {appt.status === "COMPLETADA" && (
                            <span className="text-[11px] text-success font-medium flex items-center gap-1 w-full justify-center py-0.5">
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
              <thead className="bg-sunken text-muted text-xs uppercase border-b border-line-subtle">
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
              <tbody className="divide-y divide-line-subtle">
                {filteredAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-muted">
                      Este día todavía no tiene citas. ¿Agendamos la primera?
                    </td>
                  </tr>
                ) : (
                  filteredAppointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-sunken transition">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-semibold text-ink">
                          {new Date(appt.startTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="text-xs text-muted block">{appt.durationMinutes} min</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        {appt.pets.map((p) => p.name).join(", ")}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {appt.client.firstName} {appt.client.lastName}
                        <span className="text-xs text-muted block">{appt.client.phone}</span>
                      </td>
                      <td className="px-4 py-3 text-ink font-medium">{appt.service}</td>
                      <td className="px-4 py-3">
                        <span className="badge badge-gray text-xs">{appt.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-ink">{fmtCurrency(appt.totalAmount)}</span>
                        {appt.pendingAmount > 0 && (
                          <span className="text-xs text-warning-ink block">
                            Pendiente: {fmtCurrency(appt.pendingAmount)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {appt.status !== "COMPLETADA" ? (
                          <button
                            onClick={() => openCollect(appt)}
                            className="btn btn-secondary text-xs py-1 px-2.5 text-grooming-700 hover:bg-grooming-50"
                          >
                            Cobrar
                          </button>
                        ) : (
                          <span className="text-xs text-success font-medium">Listo</span>
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
      <Modal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Agendar Cita de Peluquería"
        size="lg"
      >
        <form onSubmit={handleCreateAppointment} className="space-y-4">
          {formError && (
            <div className="p-3 bg-danger-soft text-danger-ink text-sm rounded-lg flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. Cliente y Mascotas */}
          <fieldset className="space-y-2">
            <legend className="section-title mb-2">Cliente y mascota</legend>
            {!selectedClientId ? (
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="input pl-9"
                />
                {filteredClients.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-surface border border-line-subtle rounded-lg shadow-lg overflow-hidden">
                    {filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedClientId(c.id);
                          setClientSearch(`${c.firstName} ${c.lastName}`);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-grooming-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-ink">
                          {c.firstName} {c.lastName}
                        </span>
                        <span className="text-xs text-muted">{c.phone || c.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-grooming-50 border border-grooming-100 rounded-xl">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-grooming-600" />
                  <span className="font-semibold text-ink text-sm">
                    {selectedClient?.firstName} {selectedClient?.lastName}
                  </span>
                  <span className="text-xs text-muted">({selectedClient?.phone})</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClientId("");
                    setSelectedPetIds([]);
                  }}
                  className="text-xs text-danger hover:text-danger-ink"
                >
                  Cambiar
                </button>
              </div>
            )}

            {/* Mascotas del cliente */}
            {selectedClient && (
              <div className="pt-2">
                <p className="text-xs text-muted font-medium mb-1.5">
                  Elige las mascotas de esta cita:
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedClient.pets?.map((p: any) => {
                    const isSelected = selectedPetIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (isSelected)
                            setSelectedPetIds((prev) => prev.filter((x) => x !== p.id));
                          else setSelectedPetIds((prev) => [...prev, p.id]);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                          isSelected
                            ? "bg-grooming-600 text-white shadow-xs"
                            : "bg-sunken text-muted hover:bg-line-subtle"
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
          </fieldset>

          <hr className="border-line-subtle" />

          {/* 2. Servicio, Fecha y Duración */}
          <fieldset className="space-y-3">
            <legend className="section-title mb-2">Servicio y horario</legend>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Servicio de Peluquería</label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => handleServiceChange(e.target.value)}
                  className="input text-sm"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes} min - {fmtCurrency(s.basePrice)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Fecha y Hora de Cita</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="input text-sm"
                  required
                />
              </div>

              <div>
                <label className="label">Duración Estimada (minutos)</label>
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
                <label className="label">Precio Base ($)</label>
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
          </fieldset>

          <hr className="border-line-subtle" />

          {/* 3. Anticipo y Notas */}
          <fieldset>
            <legend className="section-title mb-2">Anticipo y notas</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Anticipo Opcional ($)</label>
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
                <label className="label">Forma de Pago Anticipo</label>
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
                <label className="label">Notas de Estilismo / Observaciones</label>
                <input
                  type="text"
                  placeholder="Ej. nudos en orejas, piel delicada, corte a tijera..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input text-sm"
                />
              </div>
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-2 border-t border-line-subtle">
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
              className="btn btn-primary bg-grooming-600 hover:bg-grooming-700 flex items-center gap-1.5"
            >
              {formSaving && <Spinner size={14} />}
              <span>Confirmar Cita</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Entregar y Cobrar Cita (independiente de la unidad de Peluquería) */}
      <Modal
        open={showCollectModal}
        onClose={() => setShowCollectModal(false)}
        title="Cobro y Entrega de Peluquería"
      >
        <form onSubmit={handleCollect} className="space-y-4">
          <div className="p-3 bg-grooming-50 border border-grooming-100 rounded-xl space-y-1">
            <p className="text-xs text-grooming-800 font-medium">
              Servicio: {selectedAppt?.service}
            </p>
            <p className="text-sm font-bold text-ink">
              Mascota: {selectedAppt?.pets.map((p) => p.name).join(", ")}
            </p>
            <p className="text-xs text-muted">
              Tutor: {selectedAppt?.client.firstName} {selectedAppt?.client.lastName}
            </p>
          </div>

          <div>
            <label className="label">Monto a Cobrar ($)</label>
            <input
              type="number"
              step={0.1}
              min={0}
              value={collectAmount}
              onChange={(e) => setCollectAmount(Number(e.target.value))}
              className="input text-base font-bold text-ink"
              required
            />
            <p className="text-[11px] text-muted mt-1">
              Se registrará un ingreso contable independiente a nombre de{" "}
              <strong>Peluquería</strong>.
            </p>
          </div>

          <div>
            <label className="label">Forma de Pago</label>
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
            <label className="label">Notas de Cierre</label>
            <input
              type="text"
              placeholder="Ej. tutor satisfecho con el corte..."
              value={collectNotes}
              onChange={(e) => setCollectNotes(e.target.value)}
              className="input text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line-subtle">
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
              className="btn btn-primary bg-success hover:bg-success flex items-center gap-1.5"
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
