import { useState } from "react";
import { Modal } from "../ui/Modal";
import { fmt, fmtTime, PAYMENT_METHODS, fmtDateTimeLocalInput } from "../../lib/utils";

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
  isReservation?: boolean;
  onConfirm: (
    id: string,
    checkOutTime: string,
    performedByUserId?: string,
    createIncome?: boolean,
    paymentMethod?: string,
  ) => Promise<void>;
}

export function CheckOutModal({
  open,
  onClose,
  record,
  users = [],
  isReservation = false,
  onConfirm,
}: Props) {
  const [checkOutTime, setCheckOutTime] = useState(fmtDateTimeLocalInput(new Date()));
  const [performedByUserId, setPerformedByUserId] = useState("");
  const [createIncome, setCreateIncome] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!record || !checkOutTime) return;

    setError("");
    setLoading(true);
    try {
      // Convert local datetime to ISO string for backend
      const isoTime = new Date(checkOutTime).toISOString();
      await onConfirm(
        record.id,
        isoTime,
        performedByUserId || undefined,
        isReservation ? createIncome : undefined,
        isReservation ? paymentMethod : undefined,
      );
      setPerformedByUserId("");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos registrar la salida. Inténtalo de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!record) return null;

  return (
    <Modal open={open} onClose={onClose} title="Registrar Salida">
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
          {record.checkInTime && (
            <div>
              <p className="text-sm text-muted">Entrada</p>
              <p className="font-medium">
                {fmt(record.checkInTime)} {fmtTime(record.checkInTime)}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="label">Hora de Salida</label>
          <input
            type="datetime-local"
            className="input"
            value={checkOutTime}
            onChange={(e) => setCheckOutTime(e.target.value)}
            required
          />
        </div>

        {isReservation && (
          <div className="space-y-4 border-t pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createIncome}
                onChange={(e) => setCreateIncome(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm font-medium">Crear registro de ingreso</span>
            </label>

            {createIncome && (
              <div>
                <label className="label">Método de Pago</label>
                <select
                  className="input"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method.charAt(0) + method.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

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
            disabled={loading || !checkOutTime}
          >
            {loading ? "Registrando..." : "Registrar Salida"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
