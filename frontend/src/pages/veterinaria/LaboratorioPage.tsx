import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { fmtDateTime } from "../../lib/utils";
import {
  LAB_FLAGS,
  LAB_KINDS,
  LAB_STATUS,
  errorMessage,
  veterinariaApi,
  type LabDeskOrder,
} from "./api";
import { Tabs } from "../../components/ui/Tabs";

type Tab = "pending" | "done";

/** The laboratory desk: what has been requested, and where results are recorded. */
export function LaboratorioPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<LabDeskOrder[]>([]);
  const [done, setDone] = useState<LabDeskOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState<LabDeskOrder | null>(null);

  const load = useCallback(async () => {
    try {
      const [loadedPending, loadedDone] = await Promise.all([
        veterinariaApi.labOrders("PENDIENTE"),
        veterinariaApi.labOrders("RESULTADO"),
      ]);
      setPending(loadedPending);
      setDone(loadedDone);
      setError("");
    } catch (e) {
      setError(errorMessage(e, "No se pudo cargar el laboratorio"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markInProcess = async (order: LabDeskOrder) => {
    try {
      await veterinariaApi.setLabStatus(order.id, "EN_PROCESO");
      await load();
    } catch (e) {
      setError(errorMessage(e, "No se pudo actualizar la orden"));
    }
  };

  const orders = tab === "pending" ? pending : done;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Laboratorio e imagen"
        subtitle="Exámenes solicitados en consulta y sus resultados"
      />

      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}

      <Tabs
        label="Laboratorio"
        value={tab}
        onChange={setTab}
        items={[
          { id: "pending", label: "Pendientes", count: pending.length },
          { id: "done", label: "Con resultado", count: done.length },
        ]}
      />

      {loading ? (
        <PageLoader />
      ) : orders.length === 0 ? (
        <div className="card p-10 text-center">
          <FlaskConical size={28} className="mx-auto mb-2 text-faint" />
          <p className="text-sm text-muted">
            {tab === "pending"
              ? "No hay exámenes pendientes. Se solicitan desde la consulta."
              : "Todavía no hay resultados registrados."}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {["Solicitado", "Paciente", "Examen", "Estado", ""].map((title, index) => (
                    <th key={index} className="table-th">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const status = LAB_STATUS[order.status];
                  return (
                    <tr key={order.id} className="table-tr align-top">
                      <td className="table-td whitespace-nowrap">
                        {fmtDateTime(order.requestedAt)}
                      </td>
                      <td className="table-td">
                        <Link
                          to={`/veterinaria/consultas/${order.visit.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {order.pet.name}
                        </Link>
                        <span className="block text-xs text-muted">
                          {order.visit.client.firstName} {order.visit.client.lastName}
                        </span>
                      </td>
                      <td className="table-td">
                        {order.test}
                        <span className="block text-xs text-muted">
                          {LAB_KINDS[order.kind] ?? order.kind}
                          {order.externalLab ? ` · ${order.externalLab}` : ""}
                        </span>
                        {order.resultSummary && (
                          <span className="block text-muted mt-1">{order.resultSummary}</span>
                        )}
                        {order.values.map((value) => (
                          <span key={value.id} className="block text-xs text-muted">
                            {value.analyte}: {value.value} {value.unit}
                            {value.flag && value.flag !== "NORMAL"
                              ? ` · ${LAB_FLAGS[value.flag]?.label ?? value.flag}`
                              : ""}
                          </span>
                        ))}
                      </td>
                      <td className="table-td">
                        <Badge color={status?.color}>{status?.label ?? order.status}</Badge>
                      </td>
                      <td className="table-td text-right whitespace-nowrap">
                        {order.status === "SOLICITADO" && (
                          <button className="btn-ghost btn-sm" onClick={() => markInProcess(order)}>
                            En proceso
                          </button>
                        )}
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => setRecording(order)}
                        >
                          {order.status === "RESULTADO" ? "Corregir" : "Registrar resultado"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ResultModal
        order={recording}
        onClose={() => setRecording(null)}
        onDone={async () => {
          setRecording(null);
          await load();
        }}
      />
    </div>
  );
}

interface DraftValue {
  analyte: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: string;
}

const emptyValue: DraftValue = { analyte: "", value: "", unit: "", referenceRange: "", flag: "" };

function ResultModal({
  order,
  onClose,
  onDone,
}: {
  order: LabDeskOrder | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [summary, setSummary] = useState("");
  const [values, setValues] = useState<DraftValue[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const orderId = order?.id;
  useEffect(() => {
    setSummary(order?.resultSummary ?? "");
    setValues(
      (order?.values ?? []).map((value) => ({
        analyte: value.analyte,
        value: value.value,
        unit: value.unit ?? "",
        referenceRange: value.referenceRange ?? "",
        flag: value.flag ?? "",
      })),
    );
    setError("");
    // Reset only when a different order is opened, not on every reload of the list behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const setValue = (index: number, patch: Partial<DraftValue>) =>
    setValues((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = async () => {
    if (!order) return;
    const complete = values.filter((row) => row.analyte.trim() && row.value.trim());
    if (complete.length !== values.length) {
      setError("Cada valor necesita analito y resultado.");
      return;
    }
    if (!summary.trim() && complete.length === 0) {
      setError("Registra un resumen o al menos un valor.");
      return;
    }
    setSaving(true);
    try {
      await veterinariaApi.recordLabResult(order.id, {
        ...(summary.trim() ? { resultSummary: summary.trim() } : {}),
        values: complete.map((row) => ({
          analyte: row.analyte.trim(),
          value: row.value.trim(),
          ...(row.unit.trim() ? { unit: row.unit.trim() } : {}),
          ...(row.referenceRange.trim() ? { referenceRange: row.referenceRange.trim() } : {}),
          ...(row.flag ? { flag: row.flag } : {}),
        })),
      });
      await onDone();
    } catch (e) {
      setError(errorMessage(e, "No se pudo registrar el resultado"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={order !== null}
      onClose={onClose}
      title={order ? `Resultado: ${order.test}` : "Resultado"}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? <Spinner size={16} /> : "Guardar resultado"}
          </button>
        </>
      }
    >
      {order && (
        <div className="space-y-3 text-sm">
          {error && (
            <p className="text-danger" role="alert">
              {error}
            </p>
          )}
          <p className="text-muted">
            {order.pet.name} · {order.visit.client.firstName} {order.visit.client.lastName}
          </p>
          <div>
            <label className="label" htmlFor="lab-summary">
              Informe o interpretación
            </label>
            <textarea
              id="lab-summary"
              className="input"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          {values.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-12 items-center">
              <input
                className="input sm:col-span-3"
                placeholder="Analito"
                aria-label={`Analito ${index + 1}`}
                value={row.analyte}
                onChange={(e) => setValue(index, { analyte: e.target.value })}
              />
              <input
                className="input sm:col-span-2"
                placeholder="Valor"
                aria-label={`Valor ${index + 1}`}
                value={row.value}
                onChange={(e) => setValue(index, { value: e.target.value })}
              />
              <input
                className="input sm:col-span-2"
                placeholder="Unidad"
                aria-label={`Unidad ${index + 1}`}
                value={row.unit}
                onChange={(e) => setValue(index, { unit: e.target.value })}
              />
              <input
                className="input sm:col-span-2"
                placeholder="Referencia"
                aria-label={`Rango de referencia ${index + 1}`}
                value={row.referenceRange}
                onChange={(e) => setValue(index, { referenceRange: e.target.value })}
              />
              <select
                className="input sm:col-span-2"
                aria-label={`Interpretación ${index + 1}`}
                value={row.flag}
                onChange={(e) => setValue(index, { flag: e.target.value })}
              >
                <option value="">—</option>
                {Object.entries(LAB_FLAGS).map(([value, flag]) => (
                  <option key={value} value={value}>
                    {flag.label}
                  </option>
                ))}
              </select>
              <button
                className="text-muted hover:text-danger p-2 sm:col-span-1 justify-self-end"
                aria-label={`Quitar valor ${index + 1}`}
                onClick={() => setValues((current) => current.filter((_, i) => i !== index))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            className="btn-secondary btn-sm"
            onClick={() => setValues((current) => [...current, { ...emptyValue }])}
          >
            <Plus size={15} /> Añadir valor
          </button>
        </div>
      )}
    </Modal>
  );
}
