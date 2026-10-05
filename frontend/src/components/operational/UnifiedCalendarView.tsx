import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  LogOut,
  Truck,
  Clock,
  Calendar as CalendarIcon,
  Plus,
} from "lucide-react";
import { fmt, fmtTime } from "../../lib/utils";
import { Badge } from "../ui/Badge";
import type { OperationalEvent, OperationalEventStatus } from "./useOperacionesData";
import { ListSkeleton } from "../ui/Spinner";

interface UnifiedCalendarViewProps {
  events: OperationalEvent[];
  loading?: boolean;
  onCheckin?: (eventId: string) => void;
  onCheckout?: (eventId: string) => void;
  onViewDetail?: (event: OperationalEvent) => void;
}

function getStatusColor(status: OperationalEventStatus) {
  if (status === "CHECKED_IN") return "bg-success-soft text-success-ink";
  if (status === "CHECKED_OUT") return "bg-info-soft text-info-ink";
  return "bg-sunken text-muted";
}

function getStatusLabel(status: OperationalEventStatus) {
  const labels = {
    PENDING: "Pendiente",
    CHECKED_IN: "Ingresado",
    CHECKED_OUT: "Egresado",
  };
  return labels[status];
}

function getUnitConfig(unit: string) {
  if (unit === "DAYCARE") {
    return { label: "Guardería", color: "border-warning", bg: "bg-warning-soft" };
  }
  if (unit === "VETERINARY") {
    return { label: "Veterinaria", color: "border-veterinary-500", bg: "bg-veterinary-50" };
  }
  return { label: "Peluquería", color: "border-grooming-500", bg: "bg-grooming-50" };
}

export function UnifiedCalendarView({
  events,
  loading = false,
  onCheckin,
  onCheckout,
  onViewDetail,
}: UnifiedCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  // Get days in month
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  // Get first day of month (0 = Sunday)
  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  // Format date YYYY-MM-DD
  const formatDateKey = (date: Date) => {
    return date.toISOString().split("T")[0];
  };

  // Get events for a specific date
  const getEventsForDate = (dateStr: string) => {
    return events.filter((e) => {
      if (!e.scheduledCheckIn) return false;
      const eventDate = e.scheduledCheckIn.split("T")[0];
      return eventDate === dateStr;
    });
  };

  // Calendar data for month view
  const monthDays = useMemo(() => {
    const days = [];
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);

    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
    }

    return days;
  }, [currentDate]);

  // Week days for week view
  const weekStart = useMemo(() => {
    const date = new Date(currentDate);
    const day = date.getDay();
    const diff = date.getDate() - day;
    return new Date(date.setDate(diff));
  }, [currentDate]);

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStart]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const handlePrevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };

  const handleNextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const monthName = currentDate.toLocaleString("es-ES", {
    month: "long",
    year: "numeric",
  });

  const weekRange = `${fmt(weekStart)} - ${fmt(
    new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
  )}`;

  const EventCard = ({
    event,
    compact = false,
  }: {
    event: OperationalEvent;
    compact?: boolean;
  }) => {
    const statusColor = getStatusColor(event.status);
    const unit = getUnitConfig(event.businessUnit);
    return (
      <div
        className="text-[10px] sm:text-xs bg-surface border border-line-subtle rounded-lg shadow-xs p-1 sm:p-1.5 space-y-0.5 sm:space-y-1 cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => onViewDetail?.(event)}
        title={`${event.clientName} - ${event.petNames}`}
      >
        <div className="flex justify-between items-start gap-1">
          <div className="font-bold text-ink truncate">{event.clientName}</div>
          <div className="flex gap-0.5 sm:gap-1 shrink-0">
            {event.needsTransport && <Truck size={10} className="text-action sm:w-3 sm:h-3" />}
            {event.type === "RESERVATION" ? (
              <CalendarIcon size={10} className="text-action sm:w-3 sm:h-3" />
            ) : (
              <Plus size={10} className="text-grooming-500 sm:w-3 sm:h-3" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 text-muted font-medium truncate">
          <span>{event.petNames}</span>
        </div>

        {!compact && (
          <div className="flex items-center justify-between gap-1">
            <span
              className={`text-[8px] sm:text-[10px] px-1 rounded-sm ${unit.bg} border border-current opacity-70`}
            >
              {unit.label}
            </span>
            <div className="flex items-center gap-0.5 text-muted">
              <Clock size={8} className="sm:w-2.5 sm:h-2.5" />
              <span>{fmtTime(event.scheduledCheckIn)}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-0.5">
          <Badge color={statusColor} className="text-[8px] sm:text-[10px] py-0 px-1 leading-tight">
            {getStatusLabel(event.status)}
          </Badge>
          <div className="flex gap-0.5 sm:gap-1">
            {event.status === "PENDING" && onCheckin && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckin(event.id);
                }}
                className="btn-success icon-button rounded-sm"
                disabled={loading}
                aria-label="Registrar check-in"
                title="Check In"
              >
                <CheckCircle size={10} className="sm:w-3 sm:h-3" />
              </button>
            )}
            {event.status === "CHECKED_IN" && onCheckout && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckout(event.id);
                }}
                className="btn-warning icon-button rounded-sm"
                disabled={loading}
                aria-label="Registrar check-out"
                title="Check Out"
              >
                <LogOut size={10} className="sm:w-3 sm:h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <ListSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-sunken rounded-lg p-1">
            <button
              onClick={viewMode === "month" ? handlePrevMonth : handlePrevWeek}
              className="p-1 sm:p-1.5 hover:bg-surface hover:shadow-xs rounded-md transition"
              title="Anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={handleToday}
              className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium hover:bg-surface hover:shadow-xs rounded-md transition"
            >
              Hoy
            </button>
            <button
              onClick={viewMode === "month" ? handleNextMonth : handleNextWeek}
              className="p-1 sm:p-1.5 hover:bg-surface hover:shadow-xs rounded-md transition"
              title="Siguiente"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <h2 className="font-bold text-sm sm:text-lg px-1 sm:px-2 min-w-[100px] sm:min-w-[140px]">
            {viewMode === "month" ? monthName : weekRange}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-sunken rounded-lg p-1">
            <button
              onClick={() => setViewMode("month")}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition ${
                viewMode === "month" ? "bg-surface shadow-xs text-action" : "text-muted"
              }`}
            >
              Mes
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition ${
                viewMode === "week" ? "bg-surface shadow-xs text-action" : "text-muted"
              }`}
            >
              Semana
            </button>
          </div>
        </div>
      </div>

      {/* Month View */}
      {viewMode === "month" && (
        <div className="card overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 bg-sunken border-b border-line-subtle">
            {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day) => (
              <div
                key={day}
                className="py-2 text-center font-bold text-[10px] sm:text-xs text-muted uppercase tracking-wider"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-px bg-line-subtle">
            {monthDays.map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="bg-sunken p-1 h-24 sm:h-32" />;
              }

              const dateStr = formatDateKey(date);
              const dayEvents = getEventsForDate(dateStr);
              const isToday = new Date().toDateString() === date.toDateString();
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;

              return (
                <div
                  key={dateStr}
                  className={`bg-surface p-1 h-24 sm:h-32 border-transparent transition-colors ${
                    isToday ? "ring-2 ring-inset ring-action z-10" : ""
                  } ${isWeekend ? "bg-sunken" : ""}`}
                >
                  <div className="flex justify-between items-center mb-1 px-1">
                    <span
                      className={`text-[10px] sm:text-xs font-bold ${
                        isToday
                          ? "bg-action text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full"
                          : "text-muted"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[8px] sm:text-[10px] text-muted font-medium">
                        {dayEvents.length} op.
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5 sm:space-y-1 overflow-y-auto max-h-[60px] sm:max-h-[88px] pr-0.5 custom-scrollbar">
                    {dayEvents.map((event) => (
                      <EventCard key={event.id} event={event} compact />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {viewMode === "week" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              <div
                className="grid bg-sunken border-b border-line-subtle"
                style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}
              >
                {/* Time column header */}
                <div className="p-2 border-r border-line-subtle" />

                {/* Day headers */}
                {weekDays.map((date) => {
                  const isToday = new Date().toDateString() === date.toDateString();
                  return (
                    <div
                      key={formatDateKey(date)}
                      className={`p-2 text-center border-r border-line-subtle last:border-r-0 ${
                        isToday ? "bg-info-soft" : ""
                      }`}
                    >
                      <div className="text-[10px] font-bold text-muted uppercase">
                        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][date.getDay()]}
                      </div>
                      <div
                        className={`text-base sm:text-lg font-bold ${isToday ? "text-action" : "text-ink"}`}
                      >
                        {date.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hour rows */}
              <div className="max-h-[600px] overflow-y-auto">
                {Array.from({ length: 14 }).map((_, hourIdx) => {
                  const hour = 7 + hourIdx;
                  return (
                    <div
                      key={`hour-${hour}`}
                      className="grid border-b border-line-subtle last:border-b-0"
                      style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}
                    >
                      {/* Hour label */}
                      <div className="p-2 text-[10px] text-muted font-bold border-r border-line-subtle bg-sunken flex items-center justify-center">
                        {String(hour).padStart(2, "0")}:00
                      </div>

                      {/* Hour cells for each day */}
                      {weekDays.map((date) => {
                        const dateStr = formatDateKey(date);
                        const dayEvents = getEventsForDate(dateStr);
                        const relevantEvents = dayEvents.filter((e) => {
                          if (!e.scheduledCheckIn) return false;
                          const eHour = new Date(e.scheduledCheckIn).getHours();
                          return eHour === hour;
                        });

                        return (
                          <div
                            key={`${dateStr}-${hour}`}
                            className="p-1 border-r border-line-subtle last:border-r-0 min-h-[60px] space-y-1"
                          >
                            {relevantEvents.map((event) => (
                              <EventCard key={event.id} event={event} />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="card p-3 sm:p-4 flex flex-wrap items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-3 sm:gap-4 border-r border-line-subtle pr-4 sm:pr-6">
          <span className="text-[8px] sm:text-[10px] font-bold text-muted uppercase tracking-wider">
            Estados:
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-sunken rounded-sm border border-line-subtle" />
              <span className="text-[10px] sm:text-xs text-muted">Pendiente</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-success-soft rounded-sm border border-success-line" />
              <span className="text-[10px] sm:text-xs text-muted">Ingresado</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-info-soft rounded-sm border border-info-line" />
              <span className="text-[10px] sm:text-xs text-muted">Egresado</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 border-r border-line-subtle pr-4 sm:pr-6">
          <span className="text-[8px] sm:text-[10px] font-bold text-muted uppercase tracking-wider">
            Tipos:
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <CalendarIcon size={12} className="text-action sm:w-3.5 sm:h-3.5" />
              <span className="text-[10px] sm:text-xs text-muted">Reserva</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Plus size={12} className="text-grooming-500 sm:w-3.5 sm:h-3.5" />
              <span className="text-[10px] sm:text-xs text-muted">Ad-hoc</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <span className="text-[8px] sm:text-[10px] font-bold text-muted uppercase tracking-wider">
            Unidades:
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-xs bg-warning" />
              <span className="text-[10px] sm:text-xs text-muted">Guardería (Ambar)</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-xs bg-grooming-500" />
              <span className="text-[10px] sm:text-xs text-muted">Peluquería (Violeta)</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-xs bg-veterinary-500" />
              <span className="text-[10px] sm:text-xs text-muted">Veterinaria (Turquesa)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
