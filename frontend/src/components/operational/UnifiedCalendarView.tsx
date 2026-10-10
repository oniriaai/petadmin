import { useMemo } from "react";
import { CheckCircle, LogOut, Truck, Clock, Calendar as CalendarIcon, Plus } from "lucide-react";
import { addDays, startOfWeek } from "date-fns";
import { fmt, fmtTime } from "../../lib/utils";
import { Badge } from "../ui/Badge";
import { UnitBadge } from "../ui/UnitBadge";
import { normalizeBusinessUnit } from "../../modules/shared/contracts";
import { OPERATIONAL_STATUS, WALK_IN_LABEL } from "./useOperacionesData";
import type { OperationalEvent } from "./useOperacionesData";

interface UnifiedCalendarViewProps {
  events: OperationalEvent[];
  /** Any day inside the month or week to show. */
  date: Date;
  mode: "month" | "week";
  onCheckin?: (eventId: string) => void;
  onCheckout?: (eventId: string) => void;
  onViewDetail?: (event: OperationalEvent) => void;
}

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// The day as the person at the desk sees it. A UTC date would move an evening visit to tomorrow.
const dayKey = (date: Date | string) => fmt(date, "yyyy-MM-dd");

export function UnifiedCalendarView({
  events,
  date,
  mode,
  onCheckin,
  onCheckout,
  onViewDetail,
}: UnifiedCalendarViewProps) {
  const eventsByDay = useMemo(() => {
    const byDay = new Map<string, OperationalEvent[]>();
    for (const event of events) {
      if (!event.scheduledCheckIn) continue;
      const key = dayKey(event.scheduledCheckIn);
      byDay.set(key, [...(byDay.get(key) ?? []), event]);
    }
    return byDay;
  }, [events]);

  const monthDays = useMemo(() => {
    const days: Array<Date | null> = [];
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(date.getFullYear(), date.getMonth(), i));
    }
    return days;
  }, [date]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(date);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [date]);

  const today = dayKey(new Date());

  const EventCard = ({
    event,
    compact = false,
  }: {
    event: OperationalEvent;
    compact?: boolean;
  }) => {
    const status = OPERATIONAL_STATUS[event.status];
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
            <UnitBadge
              unit={normalizeBusinessUnit(event.businessUnit)}
              className="text-[8px] sm:text-[10px] py-0 px-1 leading-tight"
            />
            <div className="flex items-center gap-0.5 text-muted">
              <Clock size={8} className="sm:w-2.5 sm:h-2.5" />
              <span>{fmtTime(event.scheduledCheckIn)}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-0.5">
          <Badge color={status.color} className="text-[8px] sm:text-[10px] py-0 px-1 leading-tight">
            {status.label}
          </Badge>
          <div className="flex gap-0.5 sm:gap-1">
            {event.status === "PENDING" && onCheckin && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckin(event.id);
                }}
                className="btn-success icon-button rounded-sm"
                aria-label="Registrar entrada"
                title="Registrar entrada"
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
                aria-label="Registrar salida"
                title="Registrar salida"
              >
                <LogOut size={10} className="sm:w-3 sm:h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Month View */}
      {mode === "month" && (
        <div className="card overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 bg-sunken border-b border-line-subtle">
            {WEEKDAYS.map((day) => (
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
            {monthDays.map((day, idx) => {
              if (!day) {
                return <div key={`empty-${idx}`} className="bg-sunken p-1 h-24 sm:h-32" />;
              }

              const key = dayKey(day);
              const dayEvents = eventsByDay.get(key) ?? [];
              const isToday = key === today;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;

              return (
                <div
                  key={key}
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
                      {day.getDate()}
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
      {mode === "week" && (
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
                {weekDays.map((day) => {
                  const isToday = dayKey(day) === today;
                  return (
                    <div
                      key={dayKey(day)}
                      className={`p-2 text-center border-r border-line-subtle last:border-r-0 ${
                        isToday ? "bg-info-soft" : ""
                      }`}
                    >
                      <div className="text-[10px] font-bold text-muted uppercase">
                        {WEEKDAYS[day.getDay()]}
                      </div>
                      <div
                        className={`text-base sm:text-lg font-bold ${isToday ? "text-action" : "text-ink"}`}
                      >
                        {day.getDate()}
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
                      {weekDays.map((day) => {
                        const key = dayKey(day);
                        const hourEvents = (eventsByDay.get(key) ?? []).filter(
                          (e) => new Date(e.scheduledCheckIn).getHours() === hour,
                        );

                        return (
                          <div
                            key={`${key}-${hour}`}
                            className="p-1 border-r border-line-subtle last:border-r-0 min-h-[60px] space-y-1"
                          >
                            {hourEvents.map((event) => (
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
            {Object.values(OPERATIONAL_STATUS).map(({ label, color }) => (
              <Badge key={label} color={color} className="text-[10px] sm:text-xs">
                {label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
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
              <span className="text-[10px] sm:text-xs text-muted">{WALK_IN_LABEL}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
