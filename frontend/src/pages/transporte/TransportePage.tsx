import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  House,
  MapPin,
  MessageCircle,
  PackageOpen,
  Phone,
} from "lucide-react";
import { api } from "../../lib/api";
import { fmtTime } from "../../lib/utils";
import { PageLoader } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { PageHeader } from "../../components/layout/PageHeader";

interface TransportReservation {
  id: string;
  transportType: string;
  transportAddress?: string;
  checkIn?: string;
  checkOut?: string;
  service: string;
  client: {
    firstName: string;
    lastName: string;
    phone?: string;
    whatsapp?: string;
    address?: string;
    city?: string;
  };
  pets: Array<{ pet: { name: string; species: string; breed?: string; sex: string } }>;
}
interface TransportData {
  pickups: TransportReservation[];
  deliveries: TransportReservation[];
}

function TransportCard({ r, type }: { r: TransportReservation; type: "pickup" | "delivery" }) {
  const time = type === "pickup" ? r.checkIn : r.checkOut;
  return (
    <div className="card p-4 flex gap-4">
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${type === "pickup" ? "bg-info-soft text-info-ink" : "bg-success-soft text-success-ink"}`}
      >
        {type === "pickup" ? (
          <PackageOpen size={20} aria-hidden="true" />
        ) : (
          <House size={20} aria-hidden="true" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-ink">
              {r.client.firstName} {r.client.lastName}
            </p>
            <p className="text-sm text-muted">{r.pets.map((p) => p.pet.name).join(", ")}</p>
          </div>
          {time && (
            <span className="text-lg font-semibold tabular-nums text-ink shrink-0">
              {fmtTime(time)}
            </span>
          )}
        </div>
        {(r.transportAddress || r.client.address) && (
          <p className="text-sm text-muted flex items-center gap-1 mt-1">
            <MapPin size={13} className="text-faint" />
            {r.transportAddress ?? [r.client.address, r.client.city].filter(Boolean).join(", ")}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2">
          {r.client.phone && (
            <a
              href={`tel:${r.client.phone}`}
              className="text-xs text-action flex items-center gap-1"
            >
              <Phone size={11} /> {r.client.phone}
            </a>
          )}
          {r.client.whatsapp && (
            <a
              href={`https://wa.me/${r.client.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-success flex items-center gap-1"
            >
              <MessageCircle size={11} aria-hidden="true" /> WhatsApp
            </a>
          )}
          <span className="text-xs text-muted">{r.service}</span>
        </div>
      </div>
    </div>
  );
}

export function TransportePage() {
  const [date, setDate] = useState(new Date());
  const [data, setData] = useState<TransportData>({ pickups: [], deliveries: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const d = format(date, "yyyy-MM-dd");
    api
      .get<TransportData>(`/reports/transport?date=${d}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [date]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Transporte"
        subtitle="Recogidas y entregas del día"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setDate((d) => subDays(d, 1))} className="btn-secondary p-2">
              <ChevronLeft size={16} />
            </button>
            <span className="font-medium text-ink min-w-44 text-center">
              {format(date, "EEEE d 'de' MMMM", { locale: es })}
            </span>
            <button onClick={() => setDate((d) => addDays(d, 1))} className="btn-secondary p-2">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setDate(new Date())} className="btn-secondary text-xs">
              Hoy
            </button>
          </div>
        }
      />

      {loading ? (
        <PageLoader />
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <PackageOpen size={20} className="text-muted" aria-hidden="true" />
              <h2 className="section-title text-base">Recogidas</h2>
              <span className="badge bg-info-soft text-info-ink">{data.pickups.length}</span>
            </div>
            {data.pickups.length === 0 ? (
              <div className="card">
                <EmptyState title="Hoy no hay recogidas programadas." />
              </div>
            ) : (
              data.pickups.map((r) => <TransportCard key={r.id} r={r} type="pickup" />)
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <House size={20} className="text-muted" aria-hidden="true" />
              <h2 className="section-title text-base">Entregas</h2>
              <span className="badge bg-success-soft text-success-ink">
                {data.deliveries.length}
              </span>
            </div>
            {data.deliveries.length === 0 ? (
              <div className="card">
                <EmptyState title="Hoy no hay entregas programadas." />
              </div>
            ) : (
              data.deliveries.map((r) => <TransportCard key={r.id} r={r} type="delivery" />)
            )}
          </div>
        </div>
      )}

      <div className="card p-4 bg-info-soft border-info-line">
        <p className="text-sm text-info-ink font-medium">Capacidad de transporte</p>
        <p className="text-sm text-action mt-1">
          Recogidas: <strong>{data.pickups.length}</strong> · Entregas:{" "}
          <strong>{data.deliveries.length}</strong> · Total viajes:{" "}
          <strong>{data.pickups.length + data.deliveries.length}</strong>
        </p>
      </div>
    </div>
  );
}
