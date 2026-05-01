import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Eye, Plus } from "lucide-react";
import { fmt, STATUSES } from "../../lib/utils";

interface Reservation {
  id: string;
  clientId: string;
  client: { id: string; firstName: string; lastName: string };
  pets: Array<{ id: string; pet: { id: string; name: string } }>;
  room?: { id: string; name: string };
  roomId?: string;
  service: string;
  status: string;
  checkIn?: string;
  checkOut?: string;
  needsTransport: boolean;
  transportType?: string;
  transportAddress?: string;
  basePrice: number;
  vatPercent: number;
  discountAmount: number;
  advanceAmount: number;
  vatAmount: number;
  totalAmount: number;
  pendingAmount: number;
  paymentMethod?: string;
  concept?: string;
  notes?: string;
}

interface ReservationCalendarProps {
  reservations: Reservation[];
  onViewDetail: (reservation: Reservation) => void;
  onCreateNew: () => void;
  selectedRoom?: string;
  view?: "month" | "week";
}

export function ReservationCalendar({
  reservations,
  onViewDetail,
  onCreateNew,
  selectedRoom,
  view = "month",
}: ReservationCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">(view);

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

  // Get reservations for a specific date
  const getReservationsForDate = (dateStr: string) => {
    return reservations.filter((res) => {
      if (selectedRoom && res.roomId !== selectedRoom) return false;
      if (!res.checkIn) return false;
      const resDate = res.checkIn.split("T")[0];
      return resDate === dateStr;
    });
  };

  // Calendar data for month view
  const monthDays = useMemo(() => {
    const days = [];
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);

    // Empty cells for previous month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Days of current month
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

  // Status color mapping
  const getStatusColor = (status: string) => {
    const statusInfo = STATUSES[status];
    if (!statusInfo) return "bg-gray-200 text-gray-700";
    return statusInfo.color;
  };

  const handlePrevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
    );
  };

  const handleNextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
    );
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

  const monthName = currentDate.toLocaleString("es-ES", {
    month: "long",
    year: "numeric",
  });

  const weekRange = `${fmt(weekStart)} - ${fmt(
    new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
  )}`;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={viewMode === "month" ? handlePrevMonth : handlePrevWeek}
            className="btn-ghost"
            title="Anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="font-medium text-lg w-40">
            {viewMode === "month" ? monthName : weekRange}
          </h2>
          <button
            onClick={viewMode === "month" ? handleNextMonth : handleNextWeek}
            className="btn-ghost"
            title="Siguiente"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as "month" | "week")}
            className="input text-sm"
          >
            <option value="month">Vista Mensual</option>
            <option value="week">Vista Semanal</option>
          </select>
          <button onClick={onCreateNew} className="btn-primary text-sm">
            <Plus size={16} /> Nueva
          </button>
        </div>
      </div>

      {/* Month View */}
      {viewMode === "month" && (
        <div className="card p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 mb-px">
            {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day) => (
              <div key={day} className="bg-gray-100 p-2 text-center font-medium text-xs">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 p-px">
            {monthDays.map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="bg-gray-50 p-2 h-24" />;
              }

              const dateStr = formatDateKey(date);
              const dayResv = getReservationsForDate(dateStr);
              const isToday =
                new Date().toDateString() === date.toDateString();

              return (
                <div
                  key={dateStr}
                  className={`bg-white p-2 h-24 border border-gray-200 ${
                    isToday ? "bg-blue-50" : ""
                  }`}
                >
                  <div
                    className={`text-xs font-medium mb-1 ${
                      isToday ? "text-blue-700" : "text-gray-700"
                    }`}
                  >
                    {date.getDate()}
                  </div>
                  <div className="space-y-0.5 overflow-y-auto h-16">
                    {dayResv.map((res) => {
                      const st =
                        STATUSES[res.status] ??
                        { label: res.status, color: "bg-gray-100 text-gray-700" };
                      return (
                        <div
                          key={res.id}
                          onClick={() => onViewDetail(res)}
                          className={`${st.color} px-1.5 py-0.5 rounded text-xs cursor-pointer hover:opacity-80 transition truncate`}
                          title={`${res.client.firstName} ${res.client.lastName} - ${res.pets.map((p) => p.pet.name).join(", ")}`}
                        >
                          <span className="font-medium">
                            {res.room?.name || "Sin sala"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {viewMode === "week" && (
        <div className="card p-4 overflow-x-auto">
          <div className="grid gap-px bg-gray-200" style={{ gridTemplateColumns: "120px repeat(7, 1fr)" }}>
            {/* Time column header */}
            <div className="bg-gray-100 p-2 font-medium text-xs text-center sticky left-0 z-10">
              Hora
            </div>

            {/* Day headers */}
            {weekDays.map((date) => (
              <div
                key={formatDateKey(date)}
                className="bg-gray-100 p-2 text-center font-medium text-xs"
              >
                <div>{["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][date.getDay()]}</div>
                <div className="text-gray-600">{date.getDate()}</div>
              </div>
            ))}

            {/* Hour rows */}
            {Array.from({ length: 12 }).map((_, hourIdx) => {
              const hour = 8 + hourIdx; // 8 AM to 8 PM
              return (
                <React.Fragment key={`hour-${hour}`}>
                  {/* Hour label */}
                  <div className="bg-gray-50 p-2 text-xs text-gray-600 font-medium sticky left-0 z-10">
                    {String(hour).padStart(2, "0")}:00
                  </div>

                  {/* Hour cells for each day */}
                  {weekDays.map((date) => {
                    const dateStr = formatDateKey(date);
                    const dayResv = getReservationsForDate(dateStr);
                    const relevantResv = dayResv.filter((res) => {
                      if (!res.checkIn) return false;
                      const resHour = new Date(res.checkIn).getHours();
                      return resHour === hour;
                    });

                    return (
                      <div
                        key={`${dateStr}-${hour}`}
                        className="bg-white border border-gray-200 p-1 min-h-12 text-xs space-y-0.5"
                      >
                        {relevantResv.map((res) => {
                          const st =
                            STATUSES[res.status] ??
                            { label: res.status, color: "bg-gray-100 text-gray-700" };
                          return (
                            <div
                              key={res.id}
                              onClick={() => onViewDetail(res)}
                              className={`${st.color} px-1 py-0.5 rounded cursor-pointer hover:opacity-80 transition`}
                              title={`${res.client.firstName} - ${res.pets.map((p) => p.pet.name).join(", ")}`}
                            >
                              <div className="font-medium truncate">
                                {res.room?.name || "Sin"}
                              </div>
                              <div className="truncate text-gray-600">
                                {res.client.firstName}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="card p-3 flex flex-wrap gap-3 text-xs">
        {Object.entries(STATUSES).map(([status, { label, color }]) => (
          <div key={status} className="flex items-center gap-2">
            <div className={`${color} px-2 py-1 rounded`}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
