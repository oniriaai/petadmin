import { useState, useMemo } from "react";
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Plus,
  Search,
  RefreshCw,
} from "lucide-react";
import { addDays, addMonths, isSameMonth, startOfWeek } from "date-fns";
import { Tabs } from "../../components/ui/Tabs";
import { api, reservationsApi, checkInOutApi } from "../../lib/api";
import { fmt, fmtDateTime } from "../../lib/utils";
import { PageLoader } from "../../components/ui/Spinner";
import { Badge } from "../../components/ui/Badge";
import {
  useOperacionesData,
  OperationalEvent,
  OperationalEventStatus,
  OPERATIONAL_STATUS,
  WALK_IN_LABEL,
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

type View = "month" | "week" | "list";

const toRecord = (event: OperationalEvent | null) =>
  event && {
    id: event.originalId,
    petName: event.petNames,
    clientName: event.clientName,
    roomName: event.roomName,
    status: event.status,
  };

export function OperacionesPage() {
  const [view, setView] = useState<View>("month");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const { events, loading, error, refresh } = useOperacionesData(currentDate);
  const [statusFilter, setStatusFilter] = useState<"all" | OperationalEventStatus>("all");
  const [search, setSearch] = useState("");
  const [checkinTarget, setCheckinTarget] = useState<OperationalEvent | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<OperationalEvent | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);
  const [walkInDetail, setWalkInDetail] = useState<OperationalEvent | null>(null);
  const [detailError, setDetailError] = useState("");
  const [showNewReserva, setShowNewReserva] = useState(false);
  const [showWalkIn, setShowWalkIn] = useState(false);

  // The modals show the failure and close themselves on success; this only does the work.
  const handleCheckin = async (id: string, checkInTime: string) => {
    if (checkinTarget?.isReservation) {
      await reservationsApi.checkIn(id, { time: checkInTime });
    } else {
      await checkInOutApi.checkIn(id, { checkInTime });
    }
    await refresh();
  };

  const handleCheckout = async (
    id: string,
    checkOutTime: string,
    createIncome?: boolean,
    paymentMethod?: string,
  ) => {
    if (checkoutTarget?.isReservation) {
      await reservationsApi.checkOut(id, {
        time: checkOutTime,
        createIncome: createIncome ?? false,
        paymentMethod,
      });
    } else {
      await checkInOutApi.checkOut(id, { checkOutTime });
    }
    await refresh();
  };

  const handleViewDetail = async (event: OperationalEvent) => {
    setDetailError("");
    if (!event.isReservation) {
      setWalkInDetail(event);
      return;
    }
    try {
      setSelectedDetail(await api.get<any>(`/reservations/${event.originalId}`));
    } catch {
      setDetailError("No pudimos abrir la reserva. Inténtalo de nuevo.");
    }
  };

  const filteredEvents = useMemo(() => {
    const searchLower = search.toLowerCase();
    return events.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      return (
        !searchLower ||
        e.clientName.toLowerCase().includes(searchLower) ||
        e.petNames.toLowerCase().includes(searchLower) ||
        e.roomName.toLowerCase().includes(searchLower)
      );
    });
  }, [events, statusFilter, search]);

  // The data covers a week either side of the month; the list is the month itself.
  const monthEvents = useMemo(
    () => filteredEvents.filter((e) => isSameMonth(new Date(e.scheduledCheckIn), currentDate)),
    [filteredEvents, currentDate],
  );

  const step = (direction: 1 | -1) =>
    setCurrentDate((d) => (view === "week" ? addDays(d, 7 * direction) : addMonths(d, direction)));

  const weekStart = startOfWeek(currentDate);
  const periodLabel =
    view === "week"
      ? `${fmt(weekStart)} - ${fmt(addDays(weekStart, 6))}`
      : fmt(currentDate, "MMMM yyyy");

  const byId = (id: string) => filteredEvents.find((e) => e.id === id) ?? null;
  const viewProps = {
    onCheckin: (id: string) => setCheckinTarget(byId(id)),
    onCheckout: (id: string) => setCheckoutTarget(byId(id)),
    onViewDetail: handleViewDetail,
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Operaciones"
        subtitle="Reservas y entradas sin reserva"
        actions={
          <div className="flex gap-2">
            <button onClick={refresh} className="btn-ghost">
              <RefreshCw size={16} /> Actualizar
            </button>
            <button onClick={() => setShowWalkIn(true)} className="btn-secondary">
              <Plus size={16} /> {WALK_IN_LABEL}
            </button>
            <button onClick={() => setShowNewReserva(true)} className="btn-primary">
              <Plus size={16} /> Nueva Reserva
            </button>
          </div>
        }
      />

      {/* Controls */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center bg-sunken rounded-lg p-1">
          <button
            onClick={() => step(-1)}
            className="p-1.5 hover:bg-surface hover:shadow-xs rounded-md transition"
            aria-label="Periodo anterior"
            title="Anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 text-sm font-medium hover:bg-surface hover:shadow-xs rounded-md transition"
          >
            Hoy
          </button>
          <button
            onClick={() => step(1)}
            className="p-1.5 hover:bg-surface hover:shadow-xs rounded-md transition"
            aria-label="Periodo siguiente"
            title="Siguiente"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <h2 className="font-bold text-sm sm:text-lg min-w-[140px] first-letter:uppercase">
          {periodLabel}
        </h2>
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            className="input pl-9"
            placeholder="Buscar por cliente, mascota o sala…"
            aria-label="Buscar por cliente, mascota o sala"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          aria-label="Estado"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | OperationalEventStatus)}
        >
          <option value="all">Todos los estados</option>
          {Object.entries(OPERATIONAL_STATUS).map(([id, { label }]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {(error || detailError) && (
        <div className="notice notice-danger" role="alert">
          {error || detailError}
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : (
        <>
          <Tabs
            label="Vista de operaciones"
            value={view}
            onChange={setView}
            items={[
              { id: "month", label: "Mes", icon: Calendar },
              { id: "week", label: "Semana", icon: CalendarDays },
              { id: "list", label: "Lista", icon: List },
            ]}
          />

          {view === "list" ? (
            <UnifiedListView events={monthEvents} {...viewProps} />
          ) : (
            <UnifiedCalendarView
              events={filteredEvents}
              date={currentDate}
              mode={view}
              {...viewProps}
            />
          )}
        </>
      )}

      <CheckInModal
        open={!!checkinTarget}
        onClose={() => setCheckinTarget(null)}
        record={toRecord(checkinTarget)}
        onConfirm={handleCheckin}
      />

      <CheckOutModal
        open={!!checkoutTarget}
        onClose={() => setCheckoutTarget(null)}
        record={toRecord(checkoutTarget)}
        isReservation={checkoutTarget?.isReservation}
        onConfirm={handleCheckout}
      />

      <NuevaReservaModal
        open={showNewReserva}
        onClose={() => setShowNewReserva(false)}
        onSaved={refresh}
      />

      <ReservationDetailModal
        open={!!selectedDetail}
        onClose={() => setSelectedDetail(null)}
        reservation={selectedDetail}
        onSaved={refresh}
      />

      <Modal open={showWalkIn} onClose={() => setShowWalkIn(false)} title="Entrada sin reserva">
        <CheckInOutForm
          onSuccess={() => {
            setShowWalkIn(false);
            refresh();
          }}
        />
      </Modal>

      <Modal
        open={!!walkInDetail}
        onClose={() => setWalkInDetail(null)}
        title="Entrada sin reserva"
      >
        {walkInDetail && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {(
              [
                ["Cliente", walkInDetail.clientName],
                ["Mascota", walkInDetail.petNames],
                ["Sala", walkInDetail.roomName],
                [
                  "Estado",
                  <Badge key="status" color={OPERATIONAL_STATUS[walkInDetail.status].color}>
                    {OPERATIONAL_STATUS[walkInDetail.status].label}
                  </Badge>,
                ],
                ["Entrada", fmtDateTime(walkInDetail.actualCheckIn)],
                ["Salida", fmtDateTime(walkInDetail.actualCheckOut)],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium text-ink">{value}</dd>
              </div>
            ))}
            {walkInDetail.notes && (
              <div className="col-span-2">
                <dt className="text-muted">Notas</dt>
                <dd className="text-ink">{walkInDetail.notes}</dd>
              </div>
            )}
          </dl>
        )}
      </Modal>
    </div>
  );
}
