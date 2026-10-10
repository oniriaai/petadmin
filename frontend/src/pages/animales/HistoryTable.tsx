import { Link } from "react-router-dom";
import { fmt, SERVICES, STATUSES } from "../../lib/utils";
import { Badge } from "../../components/ui/Badge";
import { UnitBadge } from "../../components/ui/UnitBadge";
import { normalizeBusinessUnit } from "../../modules/shared/contracts";
import { VISIT_STATUS, VISIT_TYPES } from "../veterinaria/api";

/** One thing a pet did at the facility: a reservation of any unit, or a walk-in daycare stay. */
export interface HistoryEntry {
  id: string;
  businessUnit: string;
  service?: string | null;
  status?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  createdAt?: string | null;
  room?: { name: string } | null;
  vetVisit?: { id: string; type: string; reason?: string | null; status: string } | null;
  /** Only where a row may cover several pets (a client's activity). */
  pets?: string;
}

function serviceLabel(entry: HistoryEntry) {
  if (entry.vetVisit) {
    const type = VISIT_TYPES[entry.vetVisit.type] ?? entry.vetVisit.type;
    return entry.vetVisit.reason ? `${type} · ${entry.vetVisit.reason}` : type;
  }
  return SERVICES.find((s) => s.value === entry.service)?.label ?? entry.service ?? "—";
}

function statusOf(entry: HistoryEntry) {
  const vet = entry.vetVisit && VISIT_STATUS[entry.vetVisit.status as keyof typeof VISIT_STATUS];
  return vet ?? (entry.status ? STATUSES[entry.status] : undefined);
}

export function HistoryTable({
  entries,
  vetHref,
}: {
  entries: HistoryEntry[];
  /** Where a vet row leads, for a user who may open the clinical record. */
  vetHref?: string;
}) {
  const showPets = entries.some((e) => e.pets);
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="table-th">Fecha</th>
            <th className="table-th">Unidad</th>
            <th className="table-th">Servicio</th>
            {showPets && <th className="table-th">Mascotas</th>}
            <th className="table-th">Sala</th>
            <th className="table-th">Estado</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const status = statusOf(e);
            return (
              <tr key={e.id} className="table-tr">
                <td className="table-td text-sm whitespace-nowrap">
                  {fmt(e.checkIn ?? e.createdAt)}
                  {e.checkOut && fmt(e.checkOut) !== fmt(e.checkIn) && ` – ${fmt(e.checkOut)}`}
                </td>
                <td className="table-td">
                  <UnitBadge unit={normalizeBusinessUnit(e.businessUnit)} />
                </td>
                <td className="table-td text-sm">
                  {e.vetVisit && vetHref ? (
                    <Link to={vetHref} className="text-action hover:underline">
                      {serviceLabel(e)}
                    </Link>
                  ) : (
                    serviceLabel(e)
                  )}
                </td>
                {showPets && <td className="table-td text-sm">{e.pets || "—"}</td>}
                <td className="table-td text-sm">{e.room?.name ?? "—"}</td>
                <td className="table-td">
                  {status ? <Badge color={status.color}>{status.label}</Badge> : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
