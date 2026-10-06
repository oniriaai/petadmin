import { useState } from "react";
import { Download } from "lucide-react";
import { downloadFile } from "../../lib/api";
import { SectionCard } from "../../components/ui/SectionCard";
import { Spinner } from "../../components/ui/Spinner";

const EXPORTS = [
  {
    key: "clients",
    label: "Clientes",
    detail: "Cada tutor con su contacto, su ciudad y sus mascotas.",
    path: "/export/clients",
    filename: "clientes.xlsx",
  },
  {
    key: "reservations",
    label: "Reservas",
    detail: "Servicio, sala, entrada y salida, estado, total y saldo pendiente.",
    path: "/export/reservations",
    filename: "reservas.xlsx",
  },
  {
    key: "incomes",
    label: "Ingresos",
    detail: "Cada cobro con su concepto, IVA, forma de pago y factura.",
    path: "/export/incomes",
    filename: "ingresos.xlsx",
  },
  {
    key: "expenses",
    label: "Gastos y compras",
    detail: "Proveedor, categoría, total, lo pagado, el saldo y su vencimiento.",
    path: "/export/expenses",
    filename: "gastos-compras.xlsx",
  },
] as const;

export function DatosTab() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function download(item: (typeof EXPORTS)[number]) {
    setDownloading(item.key);
    setFailed(null);
    try {
      await downloadFile(item.path, item.filename);
    } catch {
      setFailed(item.key);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <SectionCard title="Exportar a Excel" icon={<Download size={16} aria-hidden />}>
      <p className="px-4 pt-4 text-sm text-muted sm:px-5">
        Descarga tus datos para trabajarlos en Excel o llevarlos a Power BI.
      </p>
      <ul className="divide-y divide-line-subtle px-4 sm:px-5">
        {EXPORTS.map((item) => (
          <li key={item.key} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{item.label}</p>
                <p className="text-xs text-muted">{item.detail}</p>
              </div>
              <button
                type="button"
                className="btn-secondary btn-sm shrink-0"
                onClick={() => void download(item)}
                disabled={downloading !== null}
                aria-label={`Descargar ${item.label}`}
              >
                {downloading === item.key ? (
                  <Spinner size={14} />
                ) : (
                  <Download size={14} aria-hidden />
                )}
                Descargar
              </button>
            </div>
            {failed === item.key && (
              <p role="alert" className="mt-2 text-xs font-medium text-danger-ink">
                No pudimos descargar este archivo. Revisa tu conexión e inténtalo de nuevo.
              </p>
            )}
          </li>
        ))}
      </ul>
      <details className="border-t border-line-subtle px-4 py-3 text-sm sm:px-5">
        <summary className="cursor-pointer font-medium text-ink">
          Cómo cargar estos archivos en Power BI
        </summary>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-muted">
          <li>Descarga los archivos de arriba.</li>
          <li>Abre Power BI Desktop y elige «Obtener datos» → «Excel».</li>
          <li>Importa cada archivo: clientes, reservas, ingresos y gastos.</li>
          <li>Relaciona las tablas por sus columnas en común y arma tus gráficos.</li>
        </ol>
      </details>
    </SectionCard>
  );
}
