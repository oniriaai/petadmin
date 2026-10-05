import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, Search, CheckCircle, LogOut, Calendar, Plus } from "lucide-react";
import { fmt, fmtTime } from "../../lib/utils";
import { Badge } from "../ui/Badge";
import type { OperationalEvent, OperationalEventStatus } from "./useOperacionesData";
import { EmptyState } from "../ui/EmptyState";
import { ListSkeleton } from "../ui/Spinner";

interface UnifiedListViewProps {
  events: OperationalEvent[];
  loading?: boolean;
  onCheckin?: (eventId: string) => void;
  onCheckout?: (eventId: string) => void;
  onViewDetail?: (event: OperationalEvent) => void;
}

type SortField = "scheduledCheckIn" | "client" | "pets" | "room" | "status" | "type";
type SortOrder = "asc" | "desc";

function getStatusColor(status: OperationalEventStatus) {
  const colors = {
    PENDING: "bg-sunken text-muted",
    CHECKED_IN: "bg-success-soft text-success-ink",
    CHECKED_OUT: "bg-info-soft text-info-ink",
  };
  return colors[status];
}

function getStatusLabel(status: OperationalEventStatus) {
  const labels = {
    PENDING: "Pendiente",
    CHECKED_IN: "Ingresado",
    CHECKED_OUT: "Egresado",
  };
  return labels[status];
}

export function UnifiedListView({
  events,
  loading = false,
  onCheckin,
  onCheckout,
  onViewDetail,
}: UnifiedListViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OperationalEventStatus | "all">("all");
  const [sortField, setSortField] = useState<SortField>("scheduledCheckIn");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Filter and search
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      // Search filter
      const searchLower = search.toLowerCase();
      const matchesSearch =
        e.clientName.toLowerCase().includes(searchLower) ||
        e.petNames.toLowerCase().includes(searchLower) ||
        e.roomName.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      // Status filter
      if (statusFilter !== "all" && e.status !== statusFilter) return false;

      return true;
    });
  }, [events, search, statusFilter]);

  // Sort
  const sortedEvents = useMemo(() => {
    const sorted = [...filteredEvents].sort((a, b) => {
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
  }, [filteredEvents, sortField, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(sortedEvents.length / pageSize);
  const paginatedEvents = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return sortedEvents.slice(startIdx, startIdx + pageSize);
  }, [sortedEvents, currentPage, pageSize]);

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

  if (loading) {
    return <ListSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            className="input pl-9"
            placeholder="Buscar por cliente, mascota o sala…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as any);
            setCurrentPage(1);
          }}
          className="input"
        >
          <option value="all">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="CHECKED_IN">Ingresado</option>
          <option value="CHECKED_OUT">Egresado</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {filteredEvents.length === 0 ? (
          <EmptyState title="Aquí todavía no hay operaciones. ¿Agendamos la primera?" />
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
                    const statusColor = getStatusColor(event.status);

                    return (
                      <tr
                        key={event.id}
                        className="table-tr cursor-pointer hover:bg-sunken transition"
                      >
                        <td className="table-td" onClick={() => onViewDetail?.(event)}>
                          {event.type === "RESERVATION" ? (
                            <div className="flex items-center gap-1.5 text-action" title="Reserva">
                              <Calendar size={16} />
                              <span className="text-[10px] font-bold uppercase tracking-wider">
                                Res
                              </span>
                            </div>
                          ) : (
                            <div
                              className="flex items-center gap-1.5 text-grooming-600"
                              title="Ad-hoc"
                            >
                              <Plus size={16} />
                              <span className="text-[10px] font-bold uppercase tracking-wider">
                                AdH
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
                          <Badge color={statusColor}>{getStatusLabel(event.status)}</Badge>
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
                                disabled={loading}
                                title="Check In"
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
                                disabled={loading}
                                title="Check Out"
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

            {/* Pagination */}
            <div className="border-t border-line-subtle p-4 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="text-muted">
                  Mostrando {paginatedEvents.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} a{" "}
                  {Math.min(currentPage * pageSize, sortedEvents.length)} de {sortedEvents.length}{" "}
                  operaciones
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="input text-sm"
                >
                  <option value={10}>10 por página</option>
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                  <option value={100}>100 por página</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="btn-ghost"
                >
                  Anterior
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const page = i + 1;
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1 rounded-sm text-sm font-medium transition ${
                            page === currentPage
                              ? "bg-action text-white"
                              : "bg-sunken text-muted hover:bg-line-subtle"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                      return (
                        <span key={page} className="px-2 text-muted">
                          …
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="btn-ghost"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
