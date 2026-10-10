import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, CheckCircle, LogOut, Calendar, Plus } from "lucide-react";
import { fmt, fmtTime } from "../../lib/utils";
import { Badge } from "../ui/Badge";
import { OPERATIONAL_STATUS, WALK_IN_LABEL } from "./useOperacionesData";
import type { OperationalEvent } from "./useOperacionesData";
import { EmptyState } from "../ui/EmptyState";
import { Pager } from "../ui/Pager";

interface UnifiedListViewProps {
  events: OperationalEvent[];
  onCheckin?: (eventId: string) => void;
  onCheckout?: (eventId: string) => void;
  onViewDetail?: (event: OperationalEvent) => void;
}

type SortField = "scheduledCheckIn" | "client" | "pets" | "room" | "status" | "type";
type SortOrder = "asc" | "desc";

const PAGE_SIZE = 25;

export function UnifiedListView({
  events,
  onCheckin,
  onCheckout,
  onViewDetail,
}: UnifiedListViewProps) {
  const [sortField, setSortField] = useState<SortField>("scheduledCheckIn");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // Sort
  const sortedEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case "scheduledCheckIn":
          aVal = a.scheduledCheckIn || "";
          bVal = b.scheduledCheckIn || "";
          break;
        case "client":
          aVal = a.clientName;
          bVal = b.clientName;
          break;
        case "pets":
          aVal = a.petNames;
          bVal = b.petNames;
          break;
        case "room":
          aVal = a.roomName;
          bVal = b.roomName;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "type":
          aVal = a.type;
          bVal = b.type;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [events, sortField, sortOrder]);

  // The page's filters and month change what is listed, so the page number is clamped, not kept.
  const pageCount = Math.max(1, Math.ceil(sortedEvents.length / PAGE_SIZE));
  const page = Math.min(currentPage, pageCount);
  const paginatedEvents = sortedEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortField }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 font-medium hover:text-action transition"
    >
      {label}
      {sortField === field &&
        (sortOrder === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="card overflow-hidden">
        {events.length === 0 ? (
          <EmptyState title="No hay operaciones en este periodo. ¿Agendamos la primera?" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-th">
                      <SortHeader label="Tipo" field="type" />
                    </th>
                    <th className="table-th">
                      <SortHeader label="Fecha/Hora" field="scheduledCheckIn" />
                    </th>
                    <th className="table-th">
                      <SortHeader label="Cliente" field="client" />
                    </th>
                    <th className="table-th">
                      <SortHeader label="Mascotas" field="pets" />
                    </th>
                    <th className="table-th">
                      <SortHeader label="Sala" field="room" />
                    </th>
                    <th className="table-th">
                      <SortHeader label="Estado" field="status" />
                    </th>
                    <th className="table-th">Entrada</th>
                    <th className="table-th">Salida</th>
                    <th className="table-th">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEvents.map((event) => {
                    const status = OPERATIONAL_STATUS[event.status];

                    return (
                      <tr
                        key={event.id}
                        className="table-tr cursor-pointer hover:bg-sunken transition"
                      >
                        <td className="table-td" onClick={() => onViewDetail?.(event)}>
                          {event.type === "RESERVATION" ? (
                            <div className="flex items-center gap-1.5 text-action">
                              <Calendar size={16} />
                              <span className="text-[10px] font-bold uppercase tracking-wider">
                                Reserva
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-grooming-600">
                              <Plus size={16} />
                              <span className="text-[10px] font-bold uppercase tracking-wider">
                                {WALK_IN_LABEL}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="table-td text-sm" onClick={() => onViewDetail?.(event)}>
                          <div>{fmt(event.scheduledCheckIn)}</div>
                          <div className="text-muted text-xs">
                            {fmtTime(event.scheduledCheckIn)}
                          </div>
                        </td>
                        <td className="table-td" onClick={() => onViewDetail?.(event)}>
                          <p className="font-medium text-ink">{event.clientName}</p>
                        </td>
                        <td
                          className="table-td text-sm text-muted"
                          onClick={() => onViewDetail?.(event)}
                        >
                          {event.petNames}
                        </td>
                        <td className="table-td text-sm" onClick={() => onViewDetail?.(event)}>
                          {event.roomName}
                        </td>
                        <td className="table-td" onClick={() => onViewDetail?.(event)}>
                          <Badge color={status.color}>{status.label}</Badge>
                        </td>
                        <td className="table-td text-sm">
                          {event.actualCheckIn ? (
                            <>
                              <div>{fmt(event.actualCheckIn)}</div>
                              <div className="text-muted text-xs">
                                {fmtTime(event.actualCheckIn)}
                              </div>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="table-td text-sm">
                          {event.actualCheckOut ? (
                            <>
                              <div>{fmt(event.actualCheckOut)}</div>
                              <div className="text-muted text-xs">
                                {fmtTime(event.actualCheckOut)}
                              </div>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="table-td">
                          <div className="flex items-center gap-1">
                            {event.status === "PENDING" && onCheckin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCheckin(event.id);
                                }}
                                className="btn-success btn-sm"
                                aria-label="Registrar entrada"
                                title="Registrar entrada"
                              >
                                <CheckCircle size={14} />
                              </button>
                            )}
                            {event.status === "CHECKED_IN" && onCheckout && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCheckout(event.id);
                                }}
                                className="btn-warning btn-sm"
                                aria-label="Registrar salida"
                                title="Registrar salida"
                              >
                                <LogOut size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pager
              page={page}
              pageCount={pageCount}
              total={sortedEvents.length}
              onChange={setCurrentPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
