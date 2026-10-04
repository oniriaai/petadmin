import { useState, useEffect, useMemo } from "react";
import {
  Home,
  Clock,
  AlertTriangle,
  RefreshCw,
  Truck,
  LogIn,
  Search,
  PawPrint,
  MapPin,
} from "lucide-react";
import { guarderiaApi, DaycareRoomOccupancy } from "../../lib/api";
import { clientsApi } from "../../modules/shared/api";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/layout/PageHeader";
import { Stat, StatStrip } from "../../components/ui/Stat";
import { Tabs } from "../../components/ui/Tabs";

export function ControlGuarderiaPage() {
  const [occupancy, setOccupancy] = useState<DaycareRoomOccupancy[]>([]);
  const [attendance, setAttendance] = useState<{ reservations: any[]; activeCheckIns: any[] }>({
    reservations: [],
    activeCheckIns: [],
  });
  const [transport, setTransport] = useState<{ total: number; recogidas: any[]; entregas: any[] }>({
    total: 0,
    recogidas: [],
    entregas: [],
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"salas" | "asistencia" | "transporte">("salas");

  // Modals
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<any | null>(null);

  // CheckIn Form
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedPetId, setSelectedPetId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [checkInNotes, setCheckInNotes] = useState("");
  const [checkInSaving, setCheckInSaving] = useState(false);
  const [checkInError, setCheckInError] = useState("");

  // CheckOut Form
  const [checkOutIncome, setCheckOutIncome] = useState(false);
  const [checkOutAmount, setCheckOutAmount] = useState(20);
  const [checkOutMethod, setCheckOutMethod] = useState("EFECTIVO");
  const [checkOutNotes, setCheckOutNotes] = useState("");
  const [checkOutSaving, setCheckOutSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [occ, att, trans] = await Promise.all([
        guarderiaApi.getOccupancy(),
        guarderiaApi.getTodayAttendance(),
        guarderiaApi.getTransport(),
      ]);
      setOccupancy(occ);
      setAttendance(att);
      setTransport(trans);
    } catch (err) {
      console.error("Error loading daycare data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (showCheckInModal) {
      clientsApi.list("?status=active").then(setClients).catch(console.error);
      if (occupancy.length > 0 && !selectedRoomId) {
        const availableRoom = occupancy.find((r) => !r.isFull) || occupancy[0];
        setSelectedRoomId(availableRoom.id);
      }
    }
  }, [showCheckInModal, occupancy]);

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

  const totalCapacity = useMemo(
    () => occupancy.reduce((sum, r) => sum + r.capacity, 0),
    [occupancy],
  );
  const totalOccupied = useMemo(
    () => occupancy.reduce((sum, r) => sum + r.currentOccupancy, 0),
    [occupancy],
  );
  const totalAvailable = Math.max(0, totalCapacity - totalOccupied);
  const overallRate = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      setCheckInError("Selecciona un cliente");
      return;
    }
    if (!selectedPetId) {
      setCheckInError("Selecciona una mascota");
      return;
    }
    if (!selectedRoomId) {
      setCheckInError("Selecciona una sala");
      return;
    }

    setCheckInSaving(true);
    setCheckInError("");
    try {
      await guarderiaApi.checkIn({
        clientId: selectedClientId,
        petId: selectedPetId,
        roomId: selectedRoomId,
        notes: checkInNotes,
      });
      setShowCheckInModal(false);
      resetCheckInForm();
      await loadData();
    } catch (err: any) {
      setCheckInError(err.message || "No pudimos registrar el check-in. Inténtalo de nuevo.");
    } finally {
      setCheckInSaving(false);
    }
  };

  const resetCheckInForm = () => {
    setSelectedClientId("");
    setClientSearch("");
    setSelectedPetId("");
    setCheckInNotes("");
    setCheckInError("");
  };

  const openCheckOut = (target: {
    checkInOutId: string;
    petName: string;
    clientName: string;
    amount?: number;
  }) => {
    setSelectedTarget(target);
    setCheckOutAmount(target.amount || 20);
    setCheckOutIncome(false);
    setCheckOutMethod("EFECTIVO");
    setCheckOutNotes("");
    setShowCheckOutModal(true);
  };

  const handleCheckOutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTarget) return;

    setCheckOutSaving(true);
    try {
      await guarderiaApi.checkOut({
        checkInOutId: selectedTarget.checkInOutId,
        createIncome: checkOutIncome,
        amount: checkOutAmount,
        paymentMethod: checkOutMethod,
        notes: checkOutNotes,
      });
      setShowCheckOutModal(false);
      setSelectedTarget(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || "No pudimos registrar el check-out. Inténtalo de nuevo.");
    } finally {
      setCheckOutSaving(false);
    }
  };

  if (loading && occupancy.length === 0) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        icon={
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-daycare-100 text-daycare-700">
            <Home size={20} aria-hidden="true" />
          </span>
        }
        title="Control de Guardería"
        subtitle="Ocupación de las salas, asistencia del día y rutas de transporte."
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
              onClick={() => setShowCheckInModal(true)}
              className="btn-primary bg-daycare-600 hover:bg-daycare-700"
            >
              <LogIn size={16} aria-hidden="true" />
              Registrar Check-In
            </button>
          </>
        }
      />

      <StatStrip>
        <Stat
          label="Capacidad del local"
          value={totalCapacity}
          hint={`${occupancy.length} ${occupancy.length === 1 ? "sala activa" : "salas activas"}`}
        />
        <Stat
          label="En estancia ahora"
          value={totalOccupied}
          hint={`${overallRate}% de ocupación`}
        />
        <Stat
          label="Cupos libres"
          value={totalAvailable}
          tone={totalAvailable === 0 ? "danger" : undefined}
          hint={totalAvailable === 0 ? "Todas las salas están completas" : "Disponibles para hoy"}
        />
        <Stat
          label="Transporte hoy"
          value={transport.total}
          hint={`${transport.recogidas.length} recogidas y ${transport.entregas.length} entregas`}
        />
      </StatStrip>

      <Tabs
        label="Control de Guardería"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { id: "salas", label: "Salas y ocupación", icon: Home, count: occupancy.length },
          {
            id: "asistencia",
            label: "Asistencia",
            icon: Clock,
            count: attendance.activeCheckIns.length,
          },
          { id: "transporte", label: "Transporte", icon: Truck, count: transport.total },
        ]}
      />

      {/* Tab: Salas y Ocupación */}
      {activeTab === "salas" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {occupancy.map((room) => {
            const isFull = room.isFull;
            const isNear = room.occupancyRate >= 75 && !isFull;
            const badgeColor = isFull
              ? "bg-danger-soft text-danger-ink border-danger-line"
              : isNear
                ? "bg-daycare-100 text-daycare-800 border-daycare-200"
                : "bg-success-soft text-success-ink border-success-line";

            return (
              <div key={room.id} className="card p-5 space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-base text-ink break-words">{room.name}</h3>
                      <p className="text-xs text-muted capitalize">Tipo: {room.type}</p>
                    </div>
                    <span className={`badge shrink-0 border tabular-nums ${badgeColor}`}>
                      {room.currentOccupancy} / {room.capacity}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3">
                    <div className="w-full bg-sunken rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${
                          isFull ? "bg-danger" : isNear ? "bg-daycare-500" : "bg-success"
                        }`}
                        style={{ width: `${Math.min(100, room.occupancyRate)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-muted mt-1">
                      <span>{room.occupancyRate}% ocupado</span>
                      <span>{room.availableSlots} cupos libres</span>
                    </div>
                  </div>
                </div>

                {/* List of Pets in Room */}
                <div className="space-y-2 pt-2 border-t border-line-subtle">
                  <p className="text-xs font-semibold text-muted">
                    Perrhijos en la sala ({room.currentPets.length}):
                  </p>
                  {room.currentPets.length === 0 ? (
                    <p className="text-xs text-muted italic py-2">Esta sala está libre ahora.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {room.currentPets.map((p) => (
                        <div
                          key={p.checkInOutId}
                          className="flex items-center justify-between p-2 rounded-lg bg-sunken border border-line-subtle text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {p.petPhoto ? (
                              <img
                                src={p.petPhoto}
                                alt={`Foto de ${p.petName}`}
                                loading="lazy"
                                className="w-6 h-6 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <span className="w-6 h-6 rounded-full bg-daycare-100 text-daycare-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                                <PawPrint size={14} className="text-daycare-700" />
                              </span>
                            )}
                            <div className="truncate">
                              <p className="font-bold text-ink truncate">{p.petName}</p>
                              <p className="text-[10px] text-muted truncate">{p.clientName}</p>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              openCheckOut({
                                checkInOutId: p.checkInOutId,
                                petName: p.petName,
                                clientName: p.clientName,
                              })
                            }
                            className="text-[11px] text-danger hover:text-danger-ink font-semibold px-2 py-0.5 rounded bg-danger-soft hover:bg-danger-soft shrink-0"
                          >
                            Salida
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    disabled={room.isFull}
                    onClick={() => {
                      setSelectedRoomId(room.id);
                      setShowCheckInModal(true);
                    }}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                      room.isFull
                        ? "bg-sunken text-muted cursor-not-allowed"
                        : "bg-daycare-50 text-daycare-800 hover:bg-daycare-100"
                    }`}
                  >
                    <LogIn size={13} />
                    <span>{room.isFull ? "Sala Llena" : "Ingresar a esta sala"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Asistencia Diaria */}
      {activeTab === "asistencia" && (
        <div className="card overflow-hidden">
          <div className="p-4 bg-sunken border-b border-line-subtle flex items-center justify-between">
            <h2 className="section-title">Perrhijos con estancia activa en el local</h2>
            <span className="badge badge-amber text-xs font-bold">
              {attendance.activeCheckIns.length} activos
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-sunken text-muted text-xs uppercase border-b border-line-subtle">
                <tr>
                  <th className="px-4 py-3">Mascota</th>
                  <th className="px-4 py-3">Tutor</th>
                  <th className="px-4 py-3">Sala Asignada</th>
                  <th className="px-4 py-3">Hora de Entrada</th>
                  <th className="px-4 py-3">Notas</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {attendance.activeCheckIns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-muted">
                      Ahora mismo no hay perrhijos en estancia.
                    </td>
                  </tr>
                ) : (
                  attendance.activeCheckIns.map((item: any) => (
                    <tr key={item.id} className="hover:bg-sunken transition">
                      <td className="px-4 py-3 font-semibold text-ink flex items-center gap-2">
                        {item.pet?.photoUrl ? (
                          <img
                            src={item.pet.photoUrl}
                            alt={`Foto de ${item.pet.name}`}
                            loading="lazy"
                            className="w-7 h-7 rounded-full object-cover"
                          />
                        ) : (
                          <span className="w-7 h-7 rounded-full bg-daycare-100 text-daycare-800 flex items-center justify-center text-xs">
                            <PawPrint size={14} />
                          </span>
                        )}
                        <span>{item.pet?.name}</span>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {item.client?.firstName} {item.client?.lastName}
                        <span className="text-xs text-muted block">{item.client?.phone}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-daycare-800">
                        {item.room?.name || "Sin sala"}
                      </td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {item.checkInTime
                          ? new Date(item.checkInTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted italic">{item.notes || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() =>
                            openCheckOut({
                              checkInOutId: item.id,
                              petName: item.pet?.name,
                              clientName: `${item.client?.firstName} ${item.client?.lastName}`,
                            })
                          }
                          className="btn btn-secondary text-xs py-1 px-3 text-danger hover:bg-danger-soft"
                        >
                          Check-Out
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Rutas de Transporte */}
      {activeTab === "transporte" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Recogidas */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-line-subtle pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-info-soft text-info-ink">
                  <Truck size={16} />
                </span>
                <h3 className="section-title">Ruta de Recogidas</h3>
              </div>
              <span className="badge badge-blue text-xs font-bold">
                {transport.recogidas.length}
              </span>
            </div>

            {transport.recogidas.length === 0 ? (
              <p className="text-center py-8 text-xs text-muted">
                Hoy no hay recogidas programadas.
              </p>
            ) : (
              <div className="space-y-2">
                {transport.recogidas.map((r: any) => (
                  <div
                    key={r.id}
                    className="p-3 bg-sunken rounded-xl border border-line-subtle text-xs space-y-1"
                  >
                    <div className="flex justify-between items-center font-bold text-ink">
                      <span>{r.pets?.map((p: any) => p.pet?.name).join(", ")}</span>
                      <span className="text-action">
                        {r.checkIn
                          ? new Date(r.checkIn).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Hora pte"}
                      </span>
                    </div>
                    <p className="text-muted">
                      {r.client?.firstName} {r.client?.lastName} ({r.client?.phone})
                    </p>
                    <p className="text-muted text-[11px] truncate">
                      <MapPin size={11} className="inline-block mr-1" />
                      {r.transportAddress || r.client?.address || "Dirección del cliente"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Entregas */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-line-subtle pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-success-soft text-success-ink">
                  <Truck size={16} />
                </span>
                <h3 className="section-title">Ruta de Entregas</h3>
              </div>
              <span className="badge badge-green text-xs font-bold">
                {transport.entregas.length}
              </span>
            </div>

            {transport.entregas.length === 0 ? (
              <p className="text-center py-8 text-xs text-muted">
                Hoy no hay entregas programadas.
              </p>
            ) : (
              <div className="space-y-2">
                {transport.entregas.map((r: any) => (
                  <div
                    key={r.id}
                    className="p-3 bg-sunken rounded-xl border border-line-subtle text-xs space-y-1"
                  >
                    <div className="flex justify-between items-center font-bold text-ink">
                      <span>{r.pets?.map((p: any) => p.pet?.name).join(", ")}</span>
                      <span className="text-success">
                        {r.checkOut
                          ? new Date(r.checkOut).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Hora pte"}
                      </span>
                    </div>
                    <p className="text-muted">
                      {r.client?.firstName} {r.client?.lastName} ({r.client?.phone})
                    </p>
                    <p className="text-muted text-[11px] truncate">
                      <MapPin size={11} className="inline-block mr-1" />
                      {r.transportAddress || r.client?.address || "Dirección del cliente"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Check-In Guardería */}
      <Modal
        open={showCheckInModal}
        onClose={() => setShowCheckInModal(false)}
        title="Registrar Entrada a Guardería (Check-In)"
      >
        <form onSubmit={handleCheckInSubmit} className="space-y-4">
          {checkInError && (
            <div className="p-3 bg-danger-soft text-danger-ink text-sm rounded-lg flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>{checkInError}</span>
            </div>
          )}

          {/* Tutor */}
          <div>
            <label className="label">Tutor / Cliente</label>
            {!selectedClientId ? (
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Buscar tutor por nombre..."
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
                        className="w-full text-left px-3 py-2 text-sm hover:bg-daycare-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-ink">
                          {c.firstName} {c.lastName}
                        </span>
                        <span className="text-xs text-muted">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-2.5 bg-daycare-50 border border-daycare-200 rounded-lg">
                <span className="font-medium text-sm text-ink">
                  {selectedClient?.firstName} {selectedClient?.lastName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClientId("");
                    setSelectedPetId("");
                  }}
                  className="text-xs text-danger hover:text-danger-ink"
                >
                  Cambiar
                </button>
              </div>
            )}
          </div>

          {/* Mascota */}
          {selectedClient && (
            <div>
              <label className="label">Selecciona el Perrhijo</label>
              <div className="grid grid-cols-2 gap-2">
                {selectedClient.pets?.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPetId(p.id)}
                    className={`p-2.5 rounded-lg border text-left text-xs font-semibold flex items-center gap-2 transition ${
                      selectedPetId === p.id
                        ? "border-daycare-600 bg-daycare-50 text-daycare-900"
                        : "border-line-subtle hover:bg-sunken text-muted"
                    }`}
                  >
                    <PawPrint size={14} />
                    <span>
                      {p.name} ({p.breed || p.species})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sala con validación de capacidad */}
          <div>
            <label className="label">Sala de Estancia (Capacidad)</label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="input text-sm"
              required
            >
              {occupancy.map((r) => (
                <option key={r.id} value={r.id} disabled={r.isFull}>
                  {r.name} · {r.currentOccupancy}/{r.capacity} ocupados{" "}
                  {r.isFull ? "(LLENA)" : `(${r.availableSlots} cupos)`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Notas de Entrada</label>
            <input
              type="text"
              placeholder="Ej. trae su propia comida, medicación a las 14:00..."
              value={checkInNotes}
              onChange={(e) => setCheckInNotes(e.target.value)}
              className="input text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line-subtle">
            <button
              type="button"
              onClick={() => setShowCheckInModal(false)}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={checkInSaving}
              className="btn btn-primary bg-daycare-600 hover:bg-daycare-700 flex items-center gap-1.5"
            >
              {checkInSaving && <Spinner size={14} />}
              <span>Confirmar Check-In</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Check-Out Guardería con cobro de la unidad de Guardería */}
      <Modal
        open={showCheckOutModal}
        onClose={() => setShowCheckOutModal(false)}
        title="Registrar Salida de Guardería (Check-Out)"
      >
        <form onSubmit={handleCheckOutSubmit} className="space-y-4">
          <div className="p-3 bg-daycare-50 border border-daycare-200 rounded-xl space-y-1">
            <p className="text-sm font-bold text-ink">Perrhijo: {selectedTarget?.petName}</p>
            <p className="text-xs text-muted">Tutor: {selectedTarget?.clientName}</p>
          </div>

          <div className="p-3 bg-sunken rounded-xl border border-line-subtle space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checkOutIncome}
                onChange={(e) => setCheckOutIncome(e.target.checked)}
                className="w-4 h-4 text-daycare-600 rounded border-line"
              />
              <span className="text-xs font-bold text-ink">
                Registrar cobro independiente para Guardería
              </span>
            </label>

            {checkOutIncome && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs text-muted block mb-1">Monto a Cobrar ($)</label>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={checkOutAmount}
                    onChange={(e) => setCheckOutAmount(Number(e.target.value))}
                    className="input text-sm font-bold text-ink"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Medio de Pago</label>
                  <select
                    value={checkOutMethod}
                    onChange={(e) => setCheckOutMethod(e.target.value)}
                    className="input text-sm"
                  >
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="TARJETA">Tarjeta</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Notas de Salida</label>
            <input
              type="text"
              placeholder="Ej. día excelente, comió todo..."
              value={checkOutNotes}
              onChange={(e) => setCheckOutNotes(e.target.value)}
              className="input text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line-subtle">
            <button
              type="button"
              onClick={() => setShowCheckOutModal(false)}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={checkOutSaving}
              className="btn btn-primary bg-daycare-600 hover:bg-daycare-700 flex items-center gap-1.5"
            >
              {checkOutSaving && <Spinner size={14} />}
              <span>Registrar Salida</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
