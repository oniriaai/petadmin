import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { Spinner } from "../../components/ui/Spinner";
import {
  CHANNEL_LABELS,
  remindersApi,
  type DueReminder,
  type ReminderChannel,
  type SendResult,
} from "./api";

const ICONS = { WHATSAPP: MessageCircle, EMAIL: Mail } as const;

/**
 * Sends one reminder through the system. The main button uses the channel the tutor's
 * preference resolves to; any other channel they can be reached on is offered beside it.
 *
 * A reminder that cannot be sent says why instead of offering a button that would be refused.
 */
export function SendReminderButton({
  reminder,
  onResult,
}: {
  reminder: Pick<DueReminder, "sourceKey" | "channel" | "alternatives" | "skipReason" | "lastSend">;
  onResult: (result: SendResult | null, error?: string) => void;
}) {
  const [sending, setSending] = useState<ReminderChannel | null>(null);

  if (!reminder.channel) {
    return <span className="text-xs text-muted">{reminder.skipReason ?? "Sin canal"}</span>;
  }

  async function send(channel: ReminderChannel) {
    setSending(channel);
    try {
      onResult(await remindersApi.send(reminder.sourceKey, channel));
    } catch (error) {
      onResult(
        null,
        error instanceof Error && error.message
          ? error.message
          : "No pudimos enviar el recordatorio. Inténtalo de nuevo.",
      );
    } finally {
      setSending(null);
    }
  }

  const resend = reminder.lastSend?.status === "ENVIADO";
  const others = reminder.alternatives.filter((channel) => channel !== reminder.channel);
  const MainIcon = ICONS[reminder.channel];

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={resend ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
        disabled={sending !== null}
        onClick={() => void send(reminder.channel!)}
      >
        {sending === reminder.channel ? <Spinner size={14} /> : <MainIcon size={15} aria-hidden />}
        {resend ? "Reenviar" : "Enviar"} por {CHANNEL_LABELS[reminder.channel]}
      </button>
      {others.map((channel) => {
        const Icon = ICONS[channel];
        return (
          <button
            key={channel}
            type="button"
            className="btn-secondary btn-sm"
            disabled={sending !== null}
            onClick={() => void send(channel)}
            aria-label={`Enviar por ${CHANNEL_LABELS[channel]}`}
            title={`Enviar por ${CHANNEL_LABELS[channel]}`}
          >
            {sending === channel ? <Spinner size={14} /> : <Icon size={15} aria-hidden />}
          </button>
        );
      })}
    </span>
  );
}
