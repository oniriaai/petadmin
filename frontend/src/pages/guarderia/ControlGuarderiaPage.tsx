import { useState, useEffect, useMemo } from "react";
import { 
  Home, 
  Users, 
  Clock, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Truck, 
  ArrowRight,
  LogOut,
  LogIn,
  Search,
  PawPrint, MapPin
} from "lucide-react";
import { 
  guarderiaApi, 
  DaycareRoomOccupancy, 
  api 
} from "../../lib/api";
import { clientsApi } from "../../modules/shared/api";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { Modal } from "../../components/ui/Modal";
import { fmtCurrency } from "../../lib/utils";

export function ControlGuarderiaPage() {
  const [occupancy, setOccupancy] = useState<DaycareRoomOccupancy[]>([]);
  const [attendance, setAttendance] = useState<{ reservations: any[]; activeCheckIns: any[] }>({ reservations: [], activeCheckIns: [] });
  const [transport, setTransport] = useState<{ total: number; recogidas: any[]; entregas: any[] }>({ total: 0, recogidas: [], entregas: [] });
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
        const availableRoom = occupancy.find(r => !r.isFull) || occupancy[0];
        setSelectedRoomId(availableRoom.id);
      }
    }
  }, [showCheckInModal, occupancy]);

  const selectedClient = useMemo(() => clients.find(c => c.id === selectedClientId), [clients, selectedClientId]);

  const filteredClients = useMemo(() => {
    if (!clientSearch) return [];
    const s = clientSearch.toLowerCase();
    return clients.filter(c => 
      c.firstName.toLowerCase().includes(s) || 
      c.lastName.toLowerCase().includes(s)
    ).slice(0, 5);
  }, [clients, clientSearch]);

  const totalCapacity = useMemo(() => occupancy.reduce((sum, r) => sum + r.capacity, 0), [occupancy]);
  const totalOccupied = useMemo(() => occupancy.reduce((sum, r) => sum + r.currentOccupancy, 0), [occupancy]);
  const totalAvailable = Math.max(0, totalCapacity - totalOccupied);
  const overallRate = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) { setCheckInError("Selecciona un cliente"); return; }
    if (!selectedPetId) { setCheckInError("Selecciona una mascota"); return; }
    if (!selectedRoomId) { setCheckInError("Selecciona una sala"); return; }

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
      setCheckInError(err.message || "Error al registrar check-in");
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

  const openCheckOut = (target: { checkInOutId: string; petName: string; clientName: string; amount?: number }) => {
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
      alert(err.message || "Error al registrar check-out");
    } finally {
      setCheckOutSaving(false);
    }
  };

  if (loading && occupancy.length === 0) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-100 text-amber-800">
              <Home size={24} />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Control de Guardería</h1>
              <p className="text-sm text-gray-500">Ocupación física de salas, asistencia diaria y rutas de transporte</p>
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
            onClick={() => setShowCheckInModal(true)}
            className="btn btn-primary flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700"
          >
            <LogIn size={16} />
            <span>Registrar Check-In</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500">Capacidad Total Local</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalCapacity} perrhijos</p>
          <p className="text-xs text-gray-400 mt-0.5">{occupancy.length} salas activas</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500">Ocupación Actual</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{totalOccupied} en estancia</p>
          <p className="text-xs text-gray-400 mt-0.5">{overallRate}% de ocupación total</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500">Cupos Disponibles</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{totalAvailable} libres</p>
          <p className="text-xs text-gray-400 mt-0.5">Espacio garantizado</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500">Transporte Hoy</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{transport.total} traslados</p>
          <p className="text-xs text-gray-400 mt-0.5">{transport.recogidas.length} recogidas / {transport.entregas.length} entregas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("salas")}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === "salas"
              ? "border-amber-600 text-amber-800"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Home size={16} />
          <span>Salas y Ocupación en Vivo ({occupancy.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("asistencia")}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === "asistencia"
              ? "border-amber-600 text-amber-800"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Clock size={16} />
          <span>Lista de Asistencia ({attendance.activeCheckIns.length} activos)</span>
        </button>
        <button
          onClick={() => setActiveTab("transporte")}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === "transporte"
              ? "border-amber-600 text-amber-800"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Truck size={16} />
          <span>Rutas de Transporte ({transport.total})</span>
        </button>
      </div>

      {/* Tab: Salas y Ocupación */}
      {activeTab === "salas" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {occupancy.map(room => {
            const isFull = room.isFull;
            const isNear = room.occupancyRate >= 75 && !isFull;
            const badgeColor = isFull 
              ? "bg-red-100 text-red-800 border-red-200" 
              : isNear 
                ? "bg-amber-100 text-amber-800 border-amber-200" 
                : "bg-emerald-100 text-emerald-800 border-emerald-200";

            return (
              <div key={room.id} className="card p-5 space-y-4 border border-gray-200 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-base text-gray-900">{room.name}</h3>
                      <p className="text-xs text-gray-400 capitalize">Tipo: {room.type}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${badgeColor}`}>
                      {room.currentOccupancy} / {room.capacity}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3">
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className={`h-2.5 rounded-full transition-all duration-500 ${
                          isFull ? "bg-red-500" : isNear ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, room.occupancyRate)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                      <span>{room.occupancyRate}% ocupado</span>
                      <span>{room.availableSlots} cupos libres</span>
                    </div>
                  </div>
                </div>

                {/* List of Pets in Room */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-600">Perrhijos en la sala ({room.currentPets.length}):</p>
                  {room.currentPets.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-2">Sala vacía actualmente</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {room.currentPets.map(p => (
                        <div key={p.checkInOutId} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                          <div className="flex items-center gap-2 truncate">
                            {p.petPhoto ? (
                              <img src={p.petPhoto} alt={`Foto de ${p.petName}`} loading="lazy" className="w-6 h-6 rounded-full object-cover shrink-0" />
                            ) : (
                              <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                                <PawPrint size={14} className="text-amber-700" />
                              </span>
                            )}
                            <div className="truncate">
                              <p className="font-bold text-gray-900 truncate">{p.petName}</p>
                              <p className="text-[10px] text-gray-400 truncate">{p.clientName}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => openCheckOut({ checkInOutId: p.checkInOutId, petName: p.petName, clientName: p.clientName })}
                            className="text-[11px] text-red-600 hover:text-red-800 font-semibold px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 shrink-0"
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
                    onClick={() => { setSelectedRoomId(room.id); setShowCheckInModal(true); }}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                      room.isFull 
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                        : "bg-amber-50 text-amber-800 hover:bg-amber-100"
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
          <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-sm">Perrhijos con estancia activa en el local</h2>
            <span className="badge badge-amber text-xs font-bold">{attendance.activeCheckIns.length} activos</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3">Mascota</th>
                  <th className="px-4 py-3">Tutor</th>
                  <th className="px-4 py-3">Sala Asignada</th>
                  <th className="px-4 py-3">Hora de Entrada</th>
                  <th className="px-4 py-3">Notas</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attendance.activeCheckIns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-400">
                      No hay perrhijos con check-in activo en este momento
                    </td>
                  </tr>
                ) : (
                  attendance.activeCheckIns.map((item: any) => (
                    <tr key={item.id} className="hover:bg-gray-50/80 transition">
                      <td className="px-4 py-3 font-semibold text-gray-900 flex items-center gap-2">
                        {item.pet?.photoUrl ? (
                          <img src={item.pet.photoUrl} alt={`Foto de ${item.pet.name}`} loading="lazy" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs"><PawPrint size={14} /></span>
                        )}
                        <span>{item.pet?.name}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {item.client?.firstName} {item.client?.lastName}
                        <span className="text-xs text-gray-400 block">{item.client?.phone}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-amber-800">
                        {item.room?.name || "Sin sala"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {item.checkInTime ? new Date(item.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 italic">
                        {item.notes || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openCheckOut({ checkInOutId: item.id, petName: item.pet?.name, clientName: `${item.client?.firstName} ${item.client?.lastName}` })}
                          className="btn btn-secondary text-xs py-1 px-3 text-red-600 hover:bg-red-50"
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
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700"><Truck size={16} /></span>
                <h3 className="font-bold text-gray-900 text-sm">Ruta de Recogidas</h3>
              </div>
              <span className="badge badge-blue text-xs font-bold">{transport.recogidas.length}</span>
            </div>

            {transport.recogidas.length === 0 ? (
              <p className="text-center py-8 text-xs text-gray-400">Sin recogidas programadas para hoy</p>
            ) : (
              <div className="space-y-2">
                {transport.recogidas.map((r: any) => (
                  <div key={r.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs space-y-1">
                    <div className="flex justify-between items-center font-bold text-gray-900">
                      <span>{r.pets?.map((p: any) => p.pet?.name).join(", ")}</span>
                      <span className="text-blue-600">
                        {r.checkIn ? new Date(r.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Hora pte"}
                      </span>
                    </div>
                    <p className="text-gray-600">{r.client?.firstName} {r.client?.lastName} ({r.client?.phone})</p>
                    <p className="text-gray-400 text-[11px] truncate"><MapPin size={11} className="inline-block mr-1" />{r.transportAddress || r.client?.address || "Dirección del cliente"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Entregas */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-green-100 text-green-700"><Truck size={16} /></span>
                <h3 className="font-bold text-gray-900 text-sm">Ruta de Entregas</h3>
              </div>
              <span className="badge badge-green text-xs font-bold">{transport.entregas.length}</span>
            </div>

            {transport.entregas.length === 0 ? (
              <p className="text-center py-8 text-xs text-gray-400">Sin entregas programadas para hoy</p>
            ) : (
              <div className="space-y-2">
                {transport.entregas.map((r: any) => (
                  <div key={r.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs space-y-1">
                    <div className="flex justify-between items-center font-bold text-gray-900">
                      <span>{r.pets?.map((p: any) => p.pet?.name).join(", ")}</span>
                      <span className="text-green-600">
                        {r.checkOut ? new Date(r.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Hora pte"}
                      </span>
                    </div>
                    <p className="text-gray-600">{r.client?.firstName} {r.client?.lastName} ({r.client?.phone})</p>
                    <p className="text-gray-400 text-[11px] truncate"><MapPin size={11} className="inline-block mr-1" />{r.transportAddress || r.client?.address || "Dirección del cliente"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Check-In Guardería */}
      <Modal open={showCheckInModal} onClose={() => setShowCheckInModal(false)} title="Registrar Entrada a Guardería (Check-In)">
        <form onSubmit={handleCheckInSubmit} className="space-y-4">
          {checkInError && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>{checkInError}</span>
            </div>
          )}

          {/* Tutor */}
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Tutor / Cliente</label>
            {!selectedClientId ? (
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar tutor por nombre..."
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
                        className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-gray-900">{c.firstName} {c.lastName}</span>
                        <span className="text-xs text-gray-400">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg">
                <span className="font-medium text-sm text-gray-900">{selectedClient?.firstName} {selectedClient?.lastName}</span>
                <button
                  type="button"
                  onClick={() => { setSelectedClientId(""); setSelectedPetId(""); }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Cambiar
                </button>
              </div>
            )}
          </div>

          {/* Mascota */}
          {selectedClient && (
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Selecciona el Perrhijo</label>
              <div className="grid grid-cols-2 gap-2">
                {selectedClient.pets?.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPetId(p.id)}
                    className={`p-2.5 rounded-lg border text-left text-xs font-semibold flex items-center gap-2 transition ${
                      selectedPetId === p.id 
                        ? "border-amber-600 bg-amber-50 text-amber-900" 
                        : "border-gray-200 hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    <PawPrint size={14} />
                    <span>{p.name} ({p.breed || p.species})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sala con validación de capacidad */}
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Sala de Estancia (Capacidad)</label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="input text-sm"
              required
            >
              {occupancy.map(r => (
                <option key={r.id} value={r.id} disabled={r.isFull}>
                  {r.name} — {r.currentOccupancy}/{r.capacity} ocupados {r.isFull ? "(LLENA)" : `(${r.availableSlots} cupos)`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Notas de Entrada</label>
            <input
              type="text"
              placeholder="Ej. trae su propia comida, medicación a las 14:00..."
              value={checkInNotes}
              onChange={(e) => setCheckInNotes(e.target.value)}
              className="input text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
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
              className="btn btn-primary bg-amber-600 hover:bg-amber-700 flex items-center gap-1.5"
            >
              {checkInSaving && <Spinner size={14} />}
              <span>Confirmar Check-In</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Check-Out Guardería con cobro de la unidad de Guardería */}
      <Modal open={showCheckOutModal} onClose={() => setShowCheckOutModal(false)} title="Registrar Salida de Guardería (Check-Out)">
        <form onSubmit={handleCheckOutSubmit} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
            <p className="text-sm font-bold text-gray-900">Perrhijo: {selectedTarget?.petName}</p>
            <p className="text-xs text-gray-600">Tutor: {selectedTarget?.clientName}</p>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checkOutIncome}
                onChange={(e) => setCheckOutIncome(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded border-gray-300"
              />
              <span className="text-xs font-bold text-gray-800">Registrar cobro independiente para Guardería</span>
            </label>

            {checkOutIncome && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Monto a Cobrar ($)</label>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={checkOutAmount}
                    onChange={(e) => setCheckOutAmount(Number(e.target.value))}
                    className="input text-sm font-bold text-gray-900"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Medio de Pago</label>
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
            <label className="text-xs text-gray-600 block mb-1">Notas de Salida</label>
            <input
              type="text"
              placeholder="Ej. día excelente, comió todo..."
              value={checkOutNotes}
              onChange={(e) => setCheckOutNotes(e.target.value)}
              className="input text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
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
              className="btn btn-primary bg-amber-600 hover:bg-amber-700 flex items-center gap-1.5"
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
