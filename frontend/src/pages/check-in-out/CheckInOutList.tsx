import React from "react";
import { CheckCircle, LogOut, Eye, XCircle, Clock } from "lucide-react";
import { fmt, fmtTime, fmtRelativeTime } from "../../lib/utils";
import { Badge } from "../../components/ui/Badge";
import { PageLoader } from "../../components/ui/Spinner";

interface CheckInOutRecord {
  id: string;
  petName: string;
  clientName: string;
  roomName?: string;
  checkInTime?: string;
  checkOutTime?: string;
  status: "PENDING" | "CHECKED_IN" | "CHECKED_OUT";
  notes?: string;
}

interface Props {
  records: CheckInOutRecord[];
  loading?: boolean;
  onCheckin?: (record: CheckInOutRecord) => void;
  onCheckout?: (record: CheckInOutRecord) => void;
  onUpdateNotes?: (id: string) => void;
  onViewDetail?: (record: CheckInOutRecord) => void;
}

export function CheckInOutList(props: Props) {
  const { records, loading = false, onCheckin, onCheckout, onUpdateNotes, onViewDetail } = props;

  const statusConfig = {
    PENDING: { label: "Pendiente", color: "bg-yellow-100 text-yellow-700" },
    CHECKED_IN: { label: "Ingresado", color: "bg-blue-100 text-blue-700" },
    CHECKED_OUT: { label: "Egresado", color: "bg-green-100 text-green-700" },
  };

  return (
    <div className="card overflow-hidden">
      {loading ? (
        <PageLoader />
      ) : records.length === 0 ? (
        <p className="text-center text-gray-400 py-16">Sin registros. ¡Crea el primero!</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Mascota</th>
              <th className="table-th">Cliente</th>
              <th className="table-th">Sala</th>
              <th className="table-th">Entrada</th>
              <th className="table-th">Salida</th>
              <th className="table-th">Estado</th>
              <th className="table-th">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const st = statusConfig[record.status];
              return (
                <tr key={record.id} className="table-tr">
                  <td className="table-td">
                    <div className="font-bold text-gray-900">{record.petName}</div>
                    {record.status === "CHECKED_IN" && record.checkInTime && (
                      <div className="flex items-center gap-1 text-[10px] text-blue-500 font-medium uppercase tracking-tight mt-1">
                        <Clock size={10} /> {fmtRelativeTime(record.checkInTime)}
                      </div>
                    )}
                  </td>
                  <td className="table-td text-sm">{record.clientName}</td>
                  <td className="table-td text-xs">{record.roomName ?? "—"}</td>
                  <td className="table-td text-xs">
                    {record.checkInTime ? (
                      <>
                        <div>{fmt(record.checkInTime)}</div>
                        <div className="text-gray-400">{fmtTime(record.checkInTime)}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="table-td text-xs">
                    {record.checkOutTime ? (
                      <>
                        <div>{fmt(record.checkOutTime)}</div>
                        <div className="text-gray-400">{fmtTime(record.checkOutTime)}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="table-td">
                    <Badge color={st.color}>{st.label}</Badge>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      {onViewDetail && (
                        <button onClick={() => onViewDetail(record)} className="btn-ghost btn-sm p-2 bg-gray-50 hover:bg-gray-100" title="Ver detalle">
                          <Eye size={16} />
                        </button>
                      )}
                      {record.status === "PENDING" && onCheckin && (
                        <button onClick={() => onCheckin(record)} className="btn-primary btn-sm flex items-center gap-1.5 px-3 py-1.5" title="Hacer entrada">
                          <CheckCircle size={14} /> <span className="text-xs font-bold">Entrada</span>
                        </button>
                      )}
                      {record.status === "CHECKED_IN" && onCheckout && (
                        <button onClick={() => onCheckout(record)} className="btn-warning btn-sm flex items-center gap-1.5 px-3 py-1.5" title="Hacer salida">
                          <LogOut size={14} /> <span className="text-xs font-bold">Salida</span>
                        </button>
                      )}
                      {record.status === "PENDING" && (
                        <button onClick={() => onUpdateNotes?.(record.id)} className="btn-ghost btn-sm p-2 text-red-500 hover:bg-red-50" title="Eliminar">
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
