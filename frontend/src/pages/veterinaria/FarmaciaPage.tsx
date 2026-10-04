import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pill, Printer } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { fmt, fmtDateTime } from "../../lib/utils";
import {
  errorMessage,
  veterinariaApi,
  type ExpiringLot,
  type PharmacyLine,
  type StockItem,
} from "./api";
import { Tabs } from "../../components/ui/Tabs";
import { EmptyState } from "../../components/ui/EmptyState";

type Tab = "queue" | "controlled" | "expiring";

const TABS: Array<[Tab, string]> = [
  ["queue", "Por dispensar"],
  ["controlled", "Libro de controlados"],
  ["expiring", "Caducidades"],
];

/** The pharmacy desk: what is waiting to be handed over, the controlled register, and expiries. */
export function FarmaciaPage() {
  const [tab, setTab] = useState<Tab>("queue");
  const [queue, setQueue] = useState<PharmacyLine[]>([]);
  const [controlled, setControlled] = useState<PharmacyLine[]>([]);
  const [expiring, setExpiring] = useState<ExpiringLot[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dispensing, setDispensing] = useState<PharmacyLine | null>(null);

  const load = useCallback(async () => {
    try {
      const [loadedQueue, loadedControlled, loadedExpiring, loadedStock] = await Promise.all([
        veterinariaApi.pharmacyQueue(),
        veterinariaApi.controlledLog({}),
        veterinariaApi.expiringLots(),
        veterinariaApi.pharmacyItems(),
      ]);
      setQueue(loadedQueue);
      setControlled(loadedControlled);
      setExpiring(loadedExpiring);
      setStock(loadedStock);
      setError("");
    } catch (e) {
      setError(errorMessage(e, "No se pudo cargar la farmacia"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts: Record<Tab, number> = {
    queue: queue.length,
    controlled: controlled.length,
    expiring: expiring.length,
  };
  const today = new Date();

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Farmacia"
        subtitle="Recetas por dispensar, medicamentos controlados y lotes por caducar"
        actions={
          tab === "controlled" ? (
            <button className="btn-secondary print:hidden" onClick={() => window.print()}>
              <Printer size={16} /> Imprimir libro
            </button>
          ) : undefined
        }
      />

      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}

      <Tabs
        className="print:hidden"
        label="Farmacia"
        value={tab}
        onChange={setTab}
        items={TABS.map(([key, label]) => ({ id: key, label, count: counts[key] }))}
      />

      {loading ? (
        <PageLoader />
      ) : tab === "queue" ? (
        queue.length === 0 ? (
          <Empty text="No hay medicamentos recetados pendientes de entrega." />
        ) : (
          <Table head={["Recetado", "Paciente", "Medicamento", "Pauta", ""]}>
            {queue.map((line) => (
              <tr key={line.id} className="table-tr">
                <td className="table-td whitespace-nowrap">
                  {fmtDateTime(line.prescription.issuedAt)}
                </td>
                <td className="table-td">
                  <Link
                    to={`/veterinaria/consultas/${line.prescription.visitId}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {line.prescription.pet.name}
                  </Link>
                  <span className="block text-xs text-muted">
                    {line.prescription.pet.client.firstName} {line.prescription.pet.client.lastName}
                  </span>
                </td>
                <td className="table-td">
                  {line.drug}
                  {line.inventoryItem ? (
                    <span className="block text-xs text-muted">
                      De inventario: {line.inventoryItem.name}
                      {line.inventoryItem.isControlled ? " · controlado" : ""}
                    </span>
                  ) : (
                    <span className="block text-xs text-muted">Sin artículo asignado</span>
                  )}
                </td>
                <td className="table-td">
                  {line.dose}, {line.frequency}
                  {line.durationDays ? `, ${line.durationDays} días` : ""}
                </td>
                <td className="table-td text-right">
                  <button className="btn-primary btn-sm" onClick={() => setDispensing(line)}>
                    Dispensar
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )
      ) : tab === "controlled" ? (
        controlled.length === 0 ? (
          <Empty text="Todavía no se ha dispensado ningún medicamento controlado." />
        ) : (
          <Table
            head={["Fecha", "Medicamento", "Cantidad", "Lote", "Paciente y tutor", "Prescribe"]}
          >
            {controlled.map((line) => (
              <tr key={line.id} className="table-tr">
                <td className="table-td whitespace-nowrap">{fmtDateTime(line.dispensedAt)}</td>
                <td className="table-td">{line.inventoryItem?.name ?? line.drug}</td>
                <td className="table-td tabular-nums">
                  {line.quantityDispensed} {line.inventoryItem?.unit}
                </td>
                <td className="table-td">{line.lotNumber || "—"}</td>
                <td className="table-td">
                  {line.prescription.pet.name}
                  <span className="block text-xs text-muted">
                    {line.prescription.pet.client.firstName} {line.prescription.pet.client.lastName}
                    {line.prescription.pet.client.idNumber
                      ? ` · ${line.prescription.pet.client.idNumber}`
                      : ""}
                  </span>
                </td>
                <td className="table-td">
                  {line.prescription.veterinarian?.name ?? "—"}
                  {line.prescription.veterinarian?.licenseNumber && (
                    <span className="block text-xs text-muted">
                      {line.prescription.veterinarian.licenseNumber}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )
      ) : expiring.length === 0 ? (
        <Empty text="Ningún lote recibido caduca en los próximos 90 días." />
      ) : (
        <>
          <p className="text-xs text-muted">
            Lotes recibidos con fecha de caducidad, de artículos que aún tienen stock. El inventario
            no se lleva por lote, así que conviene comprobar el estante.
          </p>
          <Table head={["Artículo", "Lote", "Caduca", "Recibido", "Stock actual"]}>
            {expiring.map((lot) => {
              const expired = new Date(lot.expiresAt) < today;
              return (
                <tr key={lot.id} className="table-tr">
                  <td className="table-td font-medium text-ink">{lot.item.name}</td>
                  <td className="table-td">{lot.lotNumber || "—"}</td>
                  <td className="table-td">
                    {fmt(lot.expiresAt)}{" "}
                    {expired && <Badge color="bg-danger-soft text-danger-ink">Caducado</Badge>}
                  </td>
                  <td className="table-td tabular-nums">
                    {lot.quantity} {lot.item.unit}
                  </td>
                  <td className="table-td tabular-nums">
                    {lot.item.currentStock} {lot.item.unit}
                  </td>
                </tr>
              );
            })}
          </Table>
        </>
      )}

      <DispenseModal
        line={dispensing}
        stock={stock}
        onClose={() => setDispensing(null)}
        onDone={() => {
          setDispensing(null);
          load();
        }}
      />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card">
      <EmptyState icon={Pill} title={text} />
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {head.map((title, index) => (
                <th key={index} className="table-th">
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function DispenseModal({
  line,
  stock,
  onClose,
  onDone,
}: {
  line: PharmacyLine | null;
  stock: StockItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [lotNumber, setLotNumber] = useState("");
  const [bill, setBill] = useState(false);
  const [unitPrice, setUnitPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!line) return;
    setInventoryItemId(line.inventoryItemId ?? "");
    setQuantity("1");
    setLotNumber("");
    setBill(false);
    setUnitPrice("");
    setError("");
  }, [line]);

  const item = stock.find((s) => s.id === inventoryItemId);
  const amount = Number(quantity) || 0;
  const short = item?.currentStock !== undefined && amount > item.currentStock;

  const submit = async () => {
    if (!line) return;
    if (!inventoryItemId) {
      setError("Elige de qué artículo del inventario se entrega.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await veterinariaApi.dispense(line.id, {
        inventoryItemId,
        quantity: amount,
        ...(lotNumber.trim() ? { lotNumber: lotNumber.trim() } : {}),
        ...(bill ? { unitPrice: Number(unitPrice) || 0 } : {}),
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e, "No se pudo dispensar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={line !== null}
      onClose={onClose}
      title="Dispensar medicamento"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={saving || short || amount <= 0}
          >
            {saving ? <Spinner size={16} /> : "Entregar y descontar"}
          </button>
        </>
      }
    >
      {line && (
        <div className="space-y-4 text-sm">
          {error && (
            <div className="notice notice-danger" role="alert">
              {error}
            </div>
          )}
          <p>
            <span className="font-medium text-ink">{line.drug}</span> para{" "}
            {line.prescription.pet.name}: {line.dose}, {line.frequency}
            {line.durationDays ? `, ${line.durationDays} días` : ""}.
          </p>
          {stock.length === 0 ? (
            <p className="text-muted">
              La clínica no tiene artículos en inventario. Regístralos en Inventario, con la unidad
              Veterinaria seleccionada, para poder dispensar desde aquí.
            </p>
          ) : (
            <>
              <div>
                <label className="label" htmlFor="ds-item">
                  Artículo de inventario
                </label>
                <select
                  id="ds-item"
                  className="input"
                  value={inventoryItemId}
                  onChange={(e) => setInventoryItemId(e.target.value)}
                >
                  <option value="">Selecciona</option>
                  {stock.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.currentStock} {s.unit}
                      {s.isControlled ? " · controlado" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="ds-quantity">
                    Cantidad {item ? `(${item.unit})` : ""}
                  </label>
                  <input
                    id="ds-quantity"
                    type="number"
                    min={0}
                    step="0.5"
                    className="input"
                    aria-invalid={short}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="ds-lot">
                    Lote
                  </label>
                  <input
                    id="ds-lot"
                    className="input"
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                  />
                </div>
              </div>
              {short && (
                <p className="text-danger">
                  Solo hay {item?.currentStock} {item?.unit} en stock.
                </p>
              )}
              {item?.isControlled && (
                <p className="text-warning-ink">
                  Medicamento controlado: esta entrega quedará en el libro de controlados.
                </p>
              )}
              <label className="flex items-center gap-2 text-muted">
                <input type="checkbox" checked={bill} onChange={(e) => setBill(e.target.checked)} />
                Añadir el cargo a la consulta (solo si sigue abierta)
              </label>
              {bill && (
                <div>
                  <label className="label" htmlFor="ds-price">
                    Precio por unidad, sin IVA
                  </label>
                  <input
                    id="ds-price"
                    type="number"
                    min={0}
                    step="0.01"
                    className="input w-40"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
