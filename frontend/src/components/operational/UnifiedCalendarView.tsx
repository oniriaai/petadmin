import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, CheckCircle, LogOut, Truck, Clock, Calendar as CalendarIcon, Plus } from "lucide-react";
import { fmt, fmtTime } from "../../lib/utils";
import { Badge } from "../ui/Badge";
import type { OperationalEvent, OperationalEventStatus } from "./useOperacionesData";

interface UnifiedCalendarViewProps {
  events: OperationalEvent[];
  loading?: boolean;
  onCheckin?: (eventId: string) => void;
  onCheckout?: (eventId: string) => void;
  onViewDetail?: (event: OperationalEvent) => void;
}

function getStatusColor(status: OperationalEventStatus) {
  if (status === "CHECKED_IN") return "bg-green-100 text-green-700";
  if (status === "CHECKED_OUT") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
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
    return { label: "Guardería", color: "border-amber-500", bg: "bg-amber-50" };
  }
  return { label: "Peluquería", color: "border-violet-500", bg: "bg-violet-50" };
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
    new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
  )}`;

  const EventCard = ({ event, compact = false }: { event: OperationalEvent; compact?: boolean }) => {
    const statusColor = getStatusColor(event.status);
    const unit = getUnitConfig(event.businessUnit);
    return (
      <div
        className="text-[10px] sm:text-xs bg-white border border-gray-200 rounded-lg shadow-sm p-1 sm:p-1.5 space-y-0.5 sm:space-y-1 cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => onViewDetail?.(event)}
        title={`${event.clientName} - ${event.petNames}`}
      >
        <div className="flex justify-between items-start gap-1">
          <div className="font-bold text-gray-900 truncate">
            {event.clientName}
          </div>
          <div className="flex gap-0.5 sm:gap-1 shrink-0">
            {event.needsTransport && <Truck size={10} className="text-blue-600 sm:w-3 sm:h-3" />}
            {event.type === "RESERVATION" ? (
              <CalendarIcon size={10} className="text-blue-500 sm:w-3 sm:h-3" />
            ) : (
              <Plus size={10} className="text-purple-500 sm:w-3 sm:h-3" />
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1 text-gray-600 font-medium truncate">
          <span>{event.petNames}</span>
        </div>

        {!compact && (
          <div className="flex items-center justify-between gap-1">
            <span className={`text-[8px] sm:text-[10px] px-1 rounded ${unit.bg} border border-current opacity-70`}>
              {unit.label}
            </span>
            <div className="flex items-center gap-0.5 text-gray-400">
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
                className="btn-success icon-button rounded"
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
                className="btn-warning icon-button rounded"
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
    return (
      <div className="card p-8 text-center">
        <div className="inline-block animate-spin">
          <div className="h-8 w-8 border-4 border-gray-300 border-t-blue-600 rounded-full" />
        </div>
        <p className="text-gray-500 mt-3">Cargando operaciones...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={viewMode === "month" ? handlePrevMonth : handlePrevWeek}
              className="p-1 sm:p-1.5 hover:bg-white hover:shadow-sm rounded-md transition"
              title="Anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={handleToday}
              className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium hover:bg-white hover:shadow-sm rounded-md transition"
            >
              Hoy
            </button>
            <button
              onClick={viewMode === "month" ? handleNextMonth : handleNextWeek}
              className="p-1 sm:p-1.5 hover:bg-white hover:shadow-sm rounded-md transition"
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
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("month")}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition ${
                viewMode === "month" ? "bg-white shadow-sm text-blue-600" : "text-gray-600"
              }`}
            >
              Mes
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition ${
                viewMode === "week" ? "bg-white shadow-sm text-blue-600" : "text-gray-600"
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
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
            {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day) => (
              <div key={day} className="py-2 text-center font-bold text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-px bg-gray-200">
            {monthDays.map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="bg-gray-50/50 p-1 h-24 sm:h-32" />;
              }

              const dateStr = formatDateKey(date);
              const dayEvents = getEventsForDate(dateStr);
              const isToday = new Date().toDateString() === date.toDateString();
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;

              return (
                <div
                  key={dateStr}
                  className={`bg-white p-1 h-24 sm:h-32 border-transparent transition-colors ${
                    isToday ? "ring-2 ring-inset ring-blue-500 z-10" : ""
                  } ${isWeekend ? "bg-gray-50/30" : ""}`}
                >
                  <div className="flex justify-between items-center mb-1 px-1">
                    <span
                      className={`text-[10px] sm:text-xs font-bold ${
                        isToday ? "bg-blue-600 text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full" : "text-gray-700"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[8px] sm:text-[10px] text-gray-400 font-medium">
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
              <div className="grid bg-gray-50 border-b border-gray-200" style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}>
                {/* Time column header */}
                <div className="p-2 border-r border-gray-200" />

                {/* Day headers */}
                {weekDays.map((date) => {
                  const isToday = new Date().toDateString() === date.toDateString();
                  return (
                    <div
                      key={formatDateKey(date)}
                      className={`p-2 text-center border-r border-gray-200 last:border-r-0 ${
                        isToday ? "bg-blue-50" : ""
                      }`}
                    >
                      <div className="text-[10px] font-bold text-gray-500 uppercase">
                        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][date.getDay()]}
                      </div>
                      <div className={`text-base sm:text-lg font-bold ${isToday ? "text-blue-600" : "text-gray-900"}`}>
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
                    <div key={`hour-${hour}`} className="grid border-b border-gray-100 last:border-b-0" style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}>
                      {/* Hour label */}
                      <div className="p-2 text-[10px] text-gray-400 font-bold border-r border-gray-200 bg-gray-50/50 flex items-center justify-center">
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
                            className="p-1 border-r border-gray-100 last:border-r-0 min-h-[60px] space-y-1"
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
        <div className="flex items-center gap-3 sm:gap-4 border-r border-gray-200 pr-4 sm:pr-6">
          <span className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider">Estados:</span>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-gray-100 rounded border border-gray-200" />
              <span className="text-[10px] sm:text-xs text-gray-600">Pendiente</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-100 rounded border border-green-200" />
              <span className="text-[10px] sm:text-xs text-gray-600">Ingresado</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-blue-100 rounded border border-blue-200" />
              <span className="text-[10px] sm:text-xs text-gray-600">Egresado</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 border-r border-gray-200 pr-4 sm:pr-6">
          <span className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tipos:</span>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <CalendarIcon size={12} className="text-blue-500 sm:w-3.5 sm:h-3.5" />
              <span className="text-[10px] sm:text-xs text-gray-600">Reserva</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Plus size={12} className="text-purple-500 sm:w-3.5 sm:h-3.5" />
              <span className="text-[10px] sm:text-xs text-gray-600">Ad-hoc</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider">Unidades:</span>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-amber-500" />
              <span className="text-[10px] sm:text-xs text-gray-600">Guardería (Ambar)</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-violet-500" />
              <span className="text-[10px] sm:text-xs text-gray-600">Peluquería (Violeta)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
