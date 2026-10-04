import { useState, useEffect } from "react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { fmtCurrency, PAYMENT_METHODS } from "../../lib/utils";

interface Payable {
  id: string;
  description: string;
  balance: number;
}

interface Props {
  payable: Payable | null;
  onClose: () => void;
  onSaved: () => void;
}

export function PayModal({ payable, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("EFECTIVO");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payable) {
      setAmount(payable.balance.toFixed(2));
    }
  }, [payable]);

  async function save() {
    if (!payable) return;
    setSaving(true);
    try {
      await api.post(`/payables/${payable.id}/payments`, {
        amount: +amount,
        method,
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error("Error registering payment:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!payable}
      onClose={onClose}
      title="Registrar Pago"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-success" onClick={save} disabled={saving}>
            {saving ? "Registrando..." : "Registrar pago"}
          </button>
        </>
      }
    >
      {payable && (
        <div className="space-y-4">
          <div className="p-3 bg-sunken rounded-lg text-sm">
            <p className="font-medium">{payable.description}</p>
            <p className="text-muted">
              Saldo: <strong className="text-danger">{fmtCurrency(payable.balance)}</strong>
            </p>
          </div>
          <div>
            <label className="label">Monto ($)</label>
            <input
              className="input"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Forma de pago</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </Modal>
  );
}
