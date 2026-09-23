import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Phone } from "lucide-react";
import { api } from "../../lib/api";
import { fmtTime } from "../../lib/utils";
import { PageLoader } from "../../components/ui/Spinner";
import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";

interface TransportReservation {
  id: string;
  transportType: string;
  transportAddress?: string;
  checkIn?: string;
  checkOut?: string;
  service: string;
  client: { firstName: string; lastName: string; phone?: string; whatsapp?: string; address?: string; city?: string };
  pets: Array<{ pet: { name: string; species: string; breed?: string; sex: string } }>;
}
interface TransportData { pickups: TransportReservation[]; deliveries: TransportReservation[] }

function TransportCard({ r, type }: { r: TransportReservation; type: "pickup" | "delivery" }) {
  const time = type === "pickup" ? r.checkIn : r.checkOut;
  return (
    <div className="card p-4 flex gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${type === "pickup" ? "bg-blue-50" : "bg-green-50"}`}>
        {type === "pickup" ? "📦" : "🏠"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900">{r.client.firstName} {r.client.lastName}</p>
            <p className="text-sm text-gray-500">{r.pets.map(p => p.pet.name).join(", ")}</p>
          </div>
          {time && <span className="text-lg font-bold text-gray-700 shrink-0">{fmtTime(time)}</span>}
        </div>
        {(r.transportAddress || r.client.address) && (
          <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
            <MapPin size={13} className="text-gray-400" />
            {r.transportAddress ?? [r.client.address, r.client.city].filter(Boolean).join(", ")}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2">
          {r.client.phone && (
            <a href={`tel:${r.client.phone}`} className="text-xs text-indigo-600 flex items-center gap-1">
              <Phone size={11} /> {r.client.phone}
            </a>
          )}
          {r.client.whatsapp && (
            <a href={`https://wa.me/${r.client.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-xs text-green-600 flex items-center gap-1">
              💬 WhatsApp
            </a>
          )}
          <span className="text-xs text-gray-400">{r.service}</span>
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
    api.get<TransportData>(`/reports/transport?date=${d}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [date]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Transporte</h1>
          <p className="text-gray-500 text-sm mt-1">Recogidas y entregas del día</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => subDays(d, 1))} className="btn-secondary p-2"><ChevronLeft size={16} /></button>
          <span className="font-medium text-gray-800 min-w-44 text-center">{format(date, "EEEE d 'de' MMMM", { locale: es })}</span>
          <button onClick={() => setDate(d => addDays(d, 1))} className="btn-secondary p-2"><ChevronRight size={16} /></button>
          <button onClick={() => setDate(new Date())} className="btn-secondary text-xs">Hoy</button>
        </div>
      </div>

      {loading ? <PageLoader /> : (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📦</span>
              <h2 className="font-semibold text-gray-800 text-lg">Recogidas</h2>
              <span className="badge bg-blue-100 text-blue-700">{data.pickups.length}</span>
            </div>
            {data.pickups.length === 0 ? (
              <div className="card p-8 text-center text-gray-400">Sin recogidas programadas para hoy</div>
            ) : (
              data.pickups.map(r => <TransportCard key={r.id} r={r} type="pickup" />)
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏠</span>
              <h2 className="font-semibold text-gray-800 text-lg">Entregas</h2>
              <span className="badge bg-green-100 text-green-700">{data.deliveries.length}</span>
            </div>
            {data.deliveries.length === 0 ? (
              <div className="card p-8 text-center text-gray-400">Sin entregas programadas para hoy</div>
            ) : (
              data.deliveries.map(r => <TransportCard key={r.id} r={r} type="delivery" />)
            )}
          </div>
        </div>
      )}

      <div className="card p-4 bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-700 font-medium">Capacidad de transporte</p>
        <p className="text-sm text-blue-600 mt-1">
          Recogidas: <strong>{data.pickups.length}</strong> · Entregas: <strong>{data.deliveries.length}</strong> · Total viajes: <strong>{data.pickups.length + data.deliveries.length}</strong>
        </p>
      </div>
    </div>
  );
}
