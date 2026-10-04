import { useState } from "react";
import { Modal } from "../ui/Modal";
import { fmtDateTimeLocalInput } from "../../lib/utils";

interface CheckInOutRecord {
  id: string;
  petName: string;
  clientName: string;
  roomName?: string;
  checkInTime?: string;
  checkOutTime?: string;
  status: "PENDING" | "CHECKED_IN" | "CHECKED_OUT";
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  record: CheckInOutRecord | null;
  users?: User[];
  onConfirm: (id: string, checkInTime: string, performedByUserId?: string) => Promise<void>;
}

export function CheckInModal({ open, onClose, record, users = [], onConfirm }: Props) {
  const [checkInTime, setCheckInTime] = useState(fmtDateTimeLocalInput(new Date()));
  const [performedByUserId, setPerformedByUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!record || !checkInTime) return;

    setError("");
    setLoading(true);
    try {
      // Convert local datetime to ISO string for backend
      const isoTime = new Date(checkInTime).toISOString();
      await onConfirm(record.id, isoTime, performedByUserId || undefined);
      setPerformedByUserId("");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos registrar la entrada. Inténtalo de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!record) return null;

  return (
    <Modal open={open} onClose={onClose} title="Registrar Entrada">
      <div className="space-y-4">
        <div className="bg-sunken p-4 rounded-lg space-y-2">
          <div>
            <p className="text-sm text-muted">Mascota</p>
            <p className="font-medium">{record.petName}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Cliente</p>
            <p className="font-medium">{record.clientName}</p>
          </div>
          {record.roomName && (
            <div>
              <p className="text-sm text-muted">Sala</p>
              <p className="font-medium">{record.roomName}</p>
            </div>
          )}
        </div>

        <div>
          <label className="label">Hora de Entrada</label>
          <input
            type="datetime-local"
            className="input"
            value={checkInTime}
            onChange={(e) => setCheckInTime(e.target.value)}
            required
          />
        </div>

        {users.length > 0 && (
          <div>
            <label className="label">Personal (Opcional)</label>
            <select
              className="input"
              value={performedByUserId}
              onChange={(e) => setPerformedByUserId(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2 pt-4">
          <button onClick={onClose} className="btn-ghost flex-1" disabled={loading}>
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="btn-primary flex-1"
            disabled={loading || !checkInTime}
          >
            {loading ? "Registrando..." : "Registrar Entrada"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
