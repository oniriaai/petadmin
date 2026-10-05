import { useCallback, useEffect, useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { clientsApi } from "../../modules/shared/api";
import type { ClientSummary } from "../../modules/shared/contracts";
import { Modal } from "../../components/ui/Modal";
import { PageLoader, Spinner } from "../../components/ui/Spinner";
import { Badge } from "../../components/ui/Badge";
import { fmt } from "../../lib/utils";

/**
 * Contracts.
 *
 * The `cumplimiento` product module grants `contracts` and `alerts`. Alerts had a tab here;
 * contracts had an API and no screen at all, so half of what a daycare bought was unreachable.
 */

const STATUSES = ["PENDIENTE_FIRMA", "FIRMADO", "VENCIDO", "CANCELADO"] as const;
type ContractStatus = (typeof STATUSES)[number];

const STATUS_LABELS: Record<ContractStatus, string> = {
  PENDIENTE_FIRMA: "Pendiente de firma",
  FIRMADO: "Firmado",
  VENCIDO: "Vencido",
  CANCELADO: "Cancelado",
};

const STATUS_COLORS: Record<ContractStatus, string> = {
  PENDIENTE_FIRMA: "bg-warning-soft text-warning-ink",
  FIRMADO: "bg-success-soft text-success-ink",
  VENCIDO: "bg-danger-soft text-danger-ink",
  CANCELADO: "bg-sunken text-muted",
};

interface Contract {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  client?: { id: string; firstName: string; lastName: string };
  pet?: { id: string; name: string } | null;
}

export function ContratosTab() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setContracts(await api.get<Contract[]>("/contracts"));
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "No pudimos cargar los contratos. Inténtalo de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(contract: Contract, status: ContractStatus) {
    try {
      await api.patch(`/contracts/${contract.id}/status`, { status });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "No pudimos cambiar el estado. Inténtalo de nuevo.",
      );
    }
  }

  async function remove(contract: Contract) {
    if (
      !window.confirm(
        `¿Eliminamos el contrato "${contract.name}"? Esta acción no se puede deshacer.`,
      )
    )
      return;
    try {
      await api.del(`/contracts/${contract.id}`);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "No pudimos eliminarlo. Inténtalo de nuevo.",
      );
    }
  }

  const visible = statusFilter ? contracts.filter((c) => c.status === statusFilter) : contracts;

  return (
    <div className="space-y-4">
      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input w-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <button className="btn-primary ml-auto" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Nuevo contrato
        </button>
      </div>

      {loading ? (
        <PageLoader />
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center">
          <FileText size={28} className="mx-auto mb-2 text-faint" />
          <p className="text-sm text-muted">
            {contracts.length === 0
              ? "Todavía no hay contratos registrados."
              : "Ningún contrato con ese estado."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((contract) => {
            const status = (STATUSES as readonly string[]).includes(contract.status)
              ? (contract.status as ContractStatus)
              : "PENDIENTE_FIRMA";
            return (
              <div key={contract.id} className="card p-4 flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{contract.name}</p>
                    <Badge color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
                  </div>
                  <p className="text-sm text-muted mt-0.5">
                    {contract.client
                      ? `${contract.client.firstName} ${contract.client.lastName}`
                      : "Sin tutor"}
                    {contract.pet ? ` · ${contract.pet.name}` : ""}
                  </p>
                  {(contract.startDate || contract.endDate) && (
                    <p className="text-xs text-muted mt-1">
                      {contract.startDate ? fmt(contract.startDate) : "—"} →{" "}
                      {contract.endDate ? fmt(contract.endDate) : "—"}
                    </p>
                  )}
                  {contract.notes && <p className="text-xs text-muted mt-1">{contract.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="input w-auto text-xs py-1.5"
                    value={status}
                    onChange={(e) => void changeStatus(contract, e.target.value as ContractStatus)}
                    aria-label={`Estado de ${contract.name}`}
                  >
                    {STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {STATUS_LABELS[option]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-ghost btn-sm text-danger"
                    onClick={() => void remove(contract)}
                    aria-label={`Eliminar ${contract.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <ContractForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ContractForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientId, setClientId] = useState("");
  const [pets, setPets] = useState<Array<{ id: string; name: string }>>([]);
  const [petId, setPetId] = useState("");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clientsApi
      .list()
      .then(setClients)
      .catch(() => setClients([]));
  }, []);

  // The pet list depends on the tutor: a contract must not pair a pet with someone else's owner.
  useEffect(() => {
    if (!clientId) {
      setPets([]);
      setPetId("");
      return;
    }
    clientsApi
      .get(clientId)
      .then((client) => setPets(client.pets ?? []))
      .catch(() => setPets([]));
    setPetId("");
  }, [clientId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/contracts", {
        clientId,
        petId: petId || undefined,
        name: name.trim(),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        notes: notes.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "No pudimos guardar los cambios. Inténtalo de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Nuevo contrato">
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="notice notice-danger" role="alert">
            {error}
          </div>
        )}
        <div>
          <label className="label" htmlFor="ct-name">
            Nombre del contrato
          </label>
          <input
            id="ct-name"
            className="input"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contrato de estancia 2026"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="ct-client">
              Tutor
            </label>
            <select
              id="ct-client"
              className="input"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Selecciona un tutor</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.firstName} {client.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ct-pet">
              Mascota (opcional)
            </label>
            <select
              id="ct-pet"
              className="input"
              value={petId}
              onChange={(e) => setPetId(e.target.value)}
              disabled={!clientId}
            >
              <option value="">Todos / no aplica</option>
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ct-start">
              Inicio
            </label>
            <input
              id="ct-start"
              className="input"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="ct-end">
              Fin
            </label>
            <input
              id="ct-end"
              className="input"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ct-notes">
            Notas
          </label>
          <textarea
            id="ct-notes"
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={saving || !clientId}>
            {saving ? <Spinner size={14} /> : null} Crear contrato
          </button>
        </div>
      </form>
    </Modal>
  );
}
