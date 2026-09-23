import { useState } from "react";
import { Download, BarChart3, Settings, Check } from "lucide-react";
import { downloadFile } from "../../lib/api";
import { Spinner } from "../../components/ui/Spinner";

export function ConfiguracionPage() {
  const [vatPercent, setVatPercent] = useState(15);
  const [language, setLanguage] = useState("es");
  const [saved, setSaved] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function download(path: string, filename: string, key: string) {
    setDownloading(key);
    try { await downloadFile(path, filename); }
    catch { alert("Error al descargar"); }
    finally { setDownloading(null); }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="page-title">Configuración</h1>
        <p className="text-gray-500 text-sm mt-1">Parámetros del sistema</p>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 border-b border-gray-100 pb-3 flex items-center gap-2"><Settings size={17} /> General</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">IVA Ecuador (%)</label>
            <input className="input" type="number" min="0" max="100" step="0.1" value={vatPercent} onChange={e => setVatPercent(+e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Actualmente: {vatPercent}%</p>
          </div>
          <div>
            <label className="label">Idioma del sistema</label>
            <select className="input" value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        <button onClick={save} className={`btn-primary ${saved ? "bg-green-600" : ""}`}>
          {saved ? <><Check size={15} className="inline-block mr-1" />Guardado</> : "Guardar configuración"}
        </button>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 border-b border-gray-100 pb-3 flex items-center gap-2"><Download size={17} /> Exportar datos</h2>
        <p className="text-sm text-gray-500">Descarga tus datos en formato Excel para análisis externo o Power BI.</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Clientes", path: "/export/clients", filename: "clientes.xlsx", key: "clients" },
            { label: "Reservas", path: "/export/reservations", filename: "reservas.xlsx", key: "reservations" },
            { label: "Ingresos", path: "/export/incomes", filename: "ingresos.xlsx", key: "incomes" },
            { label: "Gastos y Compras", path: "/export/expenses", filename: "gastos-compras.xlsx", key: "expenses" },
          ].map(({ label, path, filename, key }) => (
            <button key={key} onClick={() => download(path, filename, key)} disabled={!!downloading} className="btn-secondary justify-center">
              {downloading === key ? <Spinner size={14} /> : <Download size={14} />}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-gray-800 border-b border-gray-100 pb-3 flex items-center gap-2"><BarChart3 size={17} /> Power BI</h2>
        <div className="p-4 bg-blue-50 rounded-xl text-sm text-blue-700 space-y-2">
          <p className="font-medium">Instrucciones para cargar en Power BI:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-600">
            <li>Descarga los archivos Excel de la sección anterior</li>
            <li>Abre Power BI Desktop</li>
            <li>Selecciona "Obtener datos" → "Excel"</li>
            <li>Importa cada archivo (clientes, reservas, ingresos, gastos)</li>
            <li>Crea relaciones entre tablas usando los IDs</li>
            <li>Construye visualizaciones con los datos</li>
          </ol>
        </div>
      </div>

    </div>
  );
}
