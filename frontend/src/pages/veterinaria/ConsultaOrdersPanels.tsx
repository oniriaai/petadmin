import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Printer, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { fmt } from "../../lib/utils";
import {
  PREVENTIVE_KINDS,
  errorMessage,
  veterinariaApi,
  type StockItem,
  type VisitDetail,
} from "./api";

type Run = (action: () => Promise<unknown>, failure: string) => Promise<void>;

const isoAtNoon = (day: string) => new Date(`${day}T12:00:00`).toISOString();

/** Vaccines and antiparasitics applied in this visit, each with its next due date. */
export function PreventivePanel({
  visit,
  locked,
  run,
}: {
  visit: VisitDetail;
  locked: boolean;
  run: Run;
}) {
  const [kind, setKind] = useState("VACUNA");
  const [name, setName] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [nextDue, setNextDue] = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    const due = nextDue ? { nextDue: isoAtNoon(nextDue) } : {};
    await run(
      () =>
        kind === "VACUNA"
          ? veterinariaApi.addVaccination(visit.id, {
              name: name.trim(),
              ...(lotNumber.trim() ? { lotNumber: lotNumber.trim() } : {}),
              ...due,
            })
          : veterinariaApi.addPreventive(visit.id, {
              kind,
              product: name.trim(),
              ...(visit.pet.weight ? { weightKg: visit.pet.weight } : {}),
              ...due,
            }),
      "No se pudo registrar la aplicación",
    );
    setName("");
    setLotNumber("");
    setNextDue("");
  };

  const empty = visit.vaccinations.length === 0 && visit.preventives.length === 0;

  return (
    <section className="card p-4 space-y-3" aria-label="Vacunas y preventivos">
      <h2 className="font-semibold text-gray-900">Vacunas y preventivos</h2>
      {empty ? (
        <p className="text-sm text-muted">Nada aplicado en esta consulta.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {visit.vaccinations.map((vaccination) => (
            <li key={vaccination.id} className="flex items-start justify-between gap-2">
              <div>
                <p className="text-gray-800">
                  {vaccination.name} <Badge>Vacuna</Badge>
                </p>
                <p className="text-xs text-muted">
                  {vaccination.lotNumber ? `Lote ${vaccination.lotNumber}` : "Sin lote"}
                  {vaccination.nextDue ? ` · refuerzo ${fmt(vaccination.nextDue)}` : ""}
                </p>
              </div>
              {!locked && (
                <button
                  className="text-gray-400 hover:text-red-600 p-1"
                  aria-label={`Quitar vacuna ${vaccination.name}`}
                  onClick={() =>
                    run(
                      () => veterinariaApi.removeChild(visit.id, "vaccinations", vaccination.id),
                      "No se pudo quitar la vacuna",
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
          {visit.preventives.map((preventive) => (
            <li key={preventive.id} className="flex items-start justify-between gap-2">
              <div>
                <p className="text-gray-800">{preventive.product}</p>
                <p className="text-xs text-muted">
                  {PREVENTIVE_KINDS[preventive.kind] ?? preventive.kind}
                  {preventive.nextDue ? ` · próxima ${fmt(preventive.nextDue)}` : ""}
                </p>
              </div>
              {!locked && (
                <button
                  className="text-gray-400 hover:text-red-600 p-1"
                  aria-label={`Quitar ${preventive.product}`}
                  onClick={() =>
                    run(
                      () => veterinariaApi.removePreventive(visit.pet.id, preventive.id),
                      "No se pudo quitar el preventivo",
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <>
          <select
            className="input"
            aria-label="Tipo de aplicación"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="VACUNA">Vacuna</option>
            {Object.entries(PREVENTIVE_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder={kind === "VACUNA" ? "Vacuna aplicada" : "Producto aplicado"}
            aria-label={kind === "VACUNA" ? "Vacuna aplicada" : "Producto aplicado"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            {kind === "VACUNA" && (
              <div>
                <label className="label" htmlFor="pv-lot">
                  Lote
                </label>
                <input
                  id="pv-lot"
                  className="input"
                  value={lotNumber}
                  onChange={(e) => setLotNumber(e.target.value)}
                />
              </div>
            )}
            <div className={kind === "VACUNA" ? "" : "col-span-2"}>
              <label className="label" htmlFor="pv-next">
                Próxima dosis
              </label>
              <input
                id="pv-next"
                type="date"
                className="input"
                value={nextDue}
                onChange={(e) => setNextDue(e.target.value)}
              />
            </div>
          </div>
          <button className="btn-secondary btn-sm w-full" onClick={submit}>
            <Plus size={15} /> Registrar aplicación
          </button>
        </>
      )}
    </section>
  );
}

interface DraftLine {
  drug: string;
  dose: string;
  frequency: string;
  durationDays: string;
  instructions: string;
  inventoryItemId: string;
}

const emptyLine: DraftLine = {
  drug: "",
  dose: "",
  frequency: "",
  durationDays: "",
  instructions: "",
  inventoryItemId: "",
};

/** Prescriptions issued in this visit, and the editor for a new one. */
export function PrescriptionPanel({
  visit,
  locked,
  run,
}: {
  visit: VisitDetail;
  locked: boolean;
  run: Run;
}) {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (locked) return;
    // An empty list is a normal answer: the clinic may not keep its own stock.
    veterinariaApi
      .pharmacyItems()
      .then(setStock)
      .catch((e) => setError(errorMessage(e, "No se pudo cargar el inventario de la clínica")));
  }, [locked]);

  const setLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const pickStock = (index: number, inventoryItemId: string) => {
    const item = stock.find((s) => s.id === inventoryItemId);
    setLine(index, {
      inventoryItemId,
      ...(item && !lines[index].drug.trim() ? { drug: item.name } : {}),
    });
  };

  const submit = async () => {
    const complete = lines.filter((l) => l.drug.trim() && l.dose.trim() && l.frequency.trim());
    if (complete.length !== lines.length || complete.length === 0) {
      setError("Cada medicamento necesita nombre, dosis y frecuencia.");
      return;
    }
    setError("");
    await run(
      () =>
        veterinariaApi.addPrescription(visit.id, {
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          items: complete.map((line) => ({
            drug: line.drug.trim(),
            dose: line.dose.trim(),
            frequency: line.frequency.trim(),
            ...(line.durationDays ? { durationDays: Number(line.durationDays) } : {}),
            ...(line.instructions.trim() ? { instructions: line.instructions.trim() } : {}),
            ...(line.inventoryItemId ? { inventoryItemId: line.inventoryItemId } : {}),
          })),
        }),
      "No se pudo emitir la receta",
    );
    setLines([]);
    setNotes("");
  };

  return (
    <section className="card p-4 space-y-4" aria-label="Recetas">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Recetas</h2>
        {!locked && lines.length === 0 && (
          <button className="btn-secondary btn-sm" onClick={() => setLines([{ ...emptyLine }])}>
            <Plus size={15} /> Nueva receta
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {visit.prescriptions.length === 0 && lines.length === 0 && (
        <p className="text-sm text-muted">Sin recetas en esta consulta.</p>
      )}

      {visit.prescriptions.map((prescription) => (
        <div key={prescription.id} className="rounded-lg border border-gray-200 p-3 text-sm">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs text-muted">Emitida {fmt(prescription.issuedAt, "HH:mm")}</p>
            <span className="flex items-center gap-1">
              <Link to={`/veterinaria/recetas/${prescription.id}`} className="btn-ghost btn-sm">
                <Printer size={15} /> Imprimir
              </Link>
              {!locked && (
                <button
                  className="text-gray-400 hover:text-red-600 p-1"
                  aria-label="Eliminar receta"
                  onClick={() =>
                    run(
                      () => veterinariaApi.removeChild(visit.id, "prescriptions", prescription.id),
                      "No se pudo eliminar la receta",
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              )}
            </span>
          </div>
          <ul className="space-y-1.5">
            {prescription.items.map((item) => (
              <li key={item.id}>
                <span className="font-medium text-gray-900">{item.drug}</span>: {item.dose},{" "}
                {item.frequency}
                {item.durationDays ? `, ${item.durationDays} días` : ""}
                {item.dispensedAt && (
                  <Badge color="bg-emerald-100 text-emerald-800" className="ml-2">
                    Dispensado
                  </Badge>
                )}
                {item.instructions && <p className="text-muted">{item.instructions}</p>}
              </li>
            ))}
          </ul>
          {prescription.notes && <p className="text-muted mt-2">{prescription.notes}</p>}
        </div>
      ))}

      {lines.length > 0 && (
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-12 items-end">
              {stock.length > 0 && (
                <div className="sm:col-span-12">
                  <select
                    className="input"
                    aria-label={`Artículo de inventario del medicamento ${index + 1}`}
                    value={line.inventoryItemId}
                    onChange={(e) => pickStock(index, e.target.value)}
                  >
                    <option value="">Se compra fuera de la clínica</option>
                    {stock.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.currentStock} {item.unit}
                        {item.isControlled ? " · controlado" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <input
                className="input sm:col-span-4"
                placeholder="Medicamento y concentración"
                aria-label={`Medicamento ${index + 1}`}
                value={line.drug}
                onChange={(e) => setLine(index, { drug: e.target.value })}
              />
              <input
                className="input sm:col-span-3"
                placeholder="Dosis"
                aria-label={`Dosis del medicamento ${index + 1}`}
                value={line.dose}
                onChange={(e) => setLine(index, { dose: e.target.value })}
              />
              <input
                className="input sm:col-span-3"
                placeholder="Cada cuánto"
                aria-label={`Frecuencia del medicamento ${index + 1}`}
                value={line.frequency}
                onChange={(e) => setLine(index, { frequency: e.target.value })}
              />
              <input
                className="input sm:col-span-1"
                type="number"
                min={1}
                placeholder="Días"
                aria-label={`Días de tratamiento del medicamento ${index + 1}`}
                value={line.durationDays}
                onChange={(e) => setLine(index, { durationDays: e.target.value })}
              />
              <button
                className="text-gray-400 hover:text-red-600 p-2 sm:col-span-1 justify-self-end"
                aria-label={`Quitar medicamento ${index + 1}`}
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
              >
                <Trash2 size={15} />
              </button>
              <input
                className="input sm:col-span-12"
                placeholder="Indicaciones (con comida, no suspender…)"
                aria-label={`Indicaciones del medicamento ${index + 1}`}
                value={line.instructions}
                onChange={(e) => setLine(index, { instructions: e.target.value })}
              />
            </div>
          ))}
          <textarea
            className="input"
            rows={2}
            placeholder="Indicaciones generales para el tutor"
            aria-label="Indicaciones generales"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex flex-wrap justify-between gap-2">
            <button
              className="btn-secondary btn-sm"
              onClick={() => setLines((current) => [...current, { ...emptyLine }])}
            >
              <Plus size={15} /> Otro medicamento
            </button>
            <span className="flex gap-2">
              <button className="btn-ghost btn-sm" onClick={() => setLines([])}>
                Descartar
              </button>
              <button className="btn-primary btn-sm" onClick={submit}>
                Emitir receta
              </button>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
