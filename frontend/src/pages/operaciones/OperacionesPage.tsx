import { useState, useMemo } from "react";
import { Calendar, List, Plus, Search, RefreshCw } from "lucide-react";
import { Tabs } from "../../components/ui/Tabs";
import { api, reservationsApi, checkInOutApi } from "../../lib/api";
import { PageLoader } from "../../components/ui/Spinner";
import {
  useOperacionesData,
  OperationalEvent,
  UnifiedCalendarView,
  UnifiedListView,
  CheckInModal,
  CheckOutModal,
  CheckInOutForm,
} from "../../components/operational";
import { NuevaReservaModal } from "../reservas/NuevaReservaModal";
import { ReservationDetailModal } from "../reservas/ReservationDetailModal";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/layout/PageHeader";

export function OperacionesPage() {
  const { events, loading, error, refresh } = useOperacionesData();
  const [selectedTab, setSelectedTab] = useState<"calendar" | "list">("calendar");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "PENDING" | "CHECKED_IN" | "CHECKED_OUT"
  >("all");
  const [search, setSearch] = useState("");
  const [checkinTarget, setCheckinTarget] = useState<OperationalEvent | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<OperationalEvent | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showNewReserva, setShowNewReserva] = useState(false);
  const [showAdHocModal, setShowAdHocModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleCheckin = async (id: string, checkInTime: string, performedByUserId?: string) => {
    if (!checkinTarget) return;
    setActionLoading(true);
    try {
      if (checkinTarget.isReservation) {
        await reservationsApi.checkIn(id, { time: checkInTime });
      } else {
        await checkInOutApi.checkIn(id, { checkInTime, performedByUserId });
      }
      setShowCheckinModal(false);
      setCheckinTarget(null);
      await refresh();
    } catch (err) {
      console.error("Error during check-in:", err);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckout = async (
    id: string,
    checkOutTime: string,
    performedByUserId?: string,
    createIncome?: boolean,
    paymentMethod?: string,
  ) => {
    if (!checkoutTarget) return;
    setActionLoading(true);
    try {
      if (checkoutTarget.isReservation) {
        await reservationsApi.checkOut(id, {
          time: checkOutTime,
          createIncome: createIncome ?? false,
          paymentMethod,
        });
      } else {
        await checkInOutApi.checkOut(id, { checkOutTime, performedByUserId });
      }
      setShowCheckoutModal(false);
      setCheckoutTarget(null);
      await refresh();
    } catch (err) {
      console.error("Error during check-out:", err);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewDetail = async (event: OperationalEvent) => {
    if (event.isReservation) {
      try {
        const res = await api.get<any>(`/reservations/${event.originalId}`);
        setSelectedDetail(res);
      } catch (err) {
        console.error("Error fetching reservation detail:", err);
      }
    } else {
      // For Ad-hoc, we could show a different modal or the same one if compatible
      // For now, let's just log it or show a simple alert
      console.log("Ad-hoc detail viewing not fully implemented yet", event);
    }
  };

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      // Filter by status
      if (statusFilter !== "all" && e.status !== statusFilter) return false;

      // Filter by search
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          e.clientName.toLowerCase().includes(searchLower) ||
          e.petNames.toLowerCase().includes(searchLower) ||
          e.roomName.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });
  }, [events, statusFilter, search]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <PageHeader
        title="Operaciones"
        subtitle="Gestión Unificada de Reservas y Visitas Ad-hoc"
        actions={
          <div className="flex gap-2">
            <button onClick={refresh} disabled={loading || actionLoading} className="btn-ghost">
              <RefreshCw size={16} /> Actualizar
            </button>
            <button onClick={() => setShowAdHocModal(true)} className="btn-secondary">
              <Plus size={16} /> Ad-hoc
            </button>
            <button onClick={() => setShowNewReserva(true)} className="btn-primary">
              <Plus size={16} /> Nueva Reserva
            </button>
          </div>
        }
      />

      {/* Controls */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            className="input pl-9"
            placeholder="Buscar por cliente, mascota o sala…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="all">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="CHECKED_IN">Ingresado</option>
          <option value="CHECKED_OUT">Completado</option>
        </select>
      </div>

      {/* Error Display */}
      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && <PageLoader />}

      {/* Tab Navigation */}
      {!loading && (
        <>
          <Tabs
            label="Vista de operaciones"
            value={selectedTab}
            onChange={setSelectedTab}
            items={[
              { id: "calendar", label: "Calendario", icon: Calendar },
              { id: "list", label: "Lista", icon: List },
            ]}
          />

          {/* Tab Content */}
          {selectedTab === "calendar" && (
            <UnifiedCalendarView
              events={filteredEvents}
              onCheckin={(id) => {
                const event = filteredEvents.find((e) => e.id === id);
                if (event) {
                  setCheckinTarget(event);
                  setShowCheckinModal(true);
                }
              }}
              onCheckout={(id) => {
                const event = filteredEvents.find((e) => e.id === id);
                if (event) {
                  setCheckoutTarget(event);
                  setShowCheckoutModal(true);
                }
              }}
              onViewDetail={handleViewDetail}
            />
          )}

          {selectedTab === "list" && (
            <UnifiedListView
              events={filteredEvents}
              onCheckin={(id) => {
                const event = filteredEvents.find((e) => e.id === id);
                if (event) {
                  setCheckinTarget(event);
                  setShowCheckinModal(true);
                }
              }}
              onCheckout={(id) => {
                const event = filteredEvents.find((e) => e.id === id);
                if (event) {
                  setCheckoutTarget(event);
                  setShowCheckoutModal(true);
                }
              }}
              onViewDetail={handleViewDetail}
            />
          )}

          {/* Check-In Modal */}
          <CheckInModal
            open={showCheckinModal}
            onClose={() => {
              setShowCheckinModal(false);
              setCheckinTarget(null);
            }}
            record={
              checkinTarget
                ? {
                    id: checkinTarget.originalId,
                    petName: checkinTarget.petNames,
                    clientName: checkinTarget.clientName,
                    roomName: checkinTarget.roomName,
                    status: checkinTarget.status,
                  }
                : null
            }
            onConfirm={handleCheckin}
          />

          {/* Check-Out Modal */}
          <CheckOutModal
            open={showCheckoutModal}
            onClose={() => {
              setShowCheckoutModal(false);
              setCheckoutTarget(null);
            }}
            record={
              checkoutTarget
                ? {
                    id: checkoutTarget.originalId,
                    petName: checkoutTarget.petNames,
                    clientName: checkoutTarget.clientName,
                    roomName: checkoutTarget.roomName,
                    status: checkoutTarget.status,
                  }
                : null
            }
            isReservation={checkoutTarget?.isReservation}
            onConfirm={handleCheckout}
          />

          {/* Nueva Reserva Modal */}
          <NuevaReservaModal
            open={showNewReserva}
            onClose={() => setShowNewReserva(false)}
            onSaved={refresh}
          />

          {/* Reservation Detail Modal */}
          <ReservationDetailModal
            open={!!selectedDetail}
            onClose={() => setSelectedDetail(null)}
            reservation={selectedDetail}
            onSaved={refresh}
          />

          {/* Ad-hoc Registration Modal */}
          <Modal
            open={showAdHocModal}
            onClose={() => setShowAdHocModal(false)}
            title="Nuevo Registro Ad-hoc"
          >
            <CheckInOutForm
              onSuccess={() => {
                setShowAdHocModal(false);
                refresh();
              }}
            />
          </Modal>
        </>
      )}
    </div>
  );
}
