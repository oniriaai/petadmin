import { useCallback, useEffect, useState } from "react";
import { BellRing, ChevronLeft, ChevronRight, History, Send } from "lucide-react";
import { Badge, type Tone } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageLoader } from "../../components/ui/Spinner";
import { Tabs } from "../../components/ui/Tabs";
import { UnitBadge } from "../../components/ui/UnitBadge";
import { useAuth } from "../../lib/auth-context";
import { fmt, fmtDateTime } from "../../lib/utils";
import {
  CHANNEL_LABELS,
  KIND_BADGES,
  KIND_LABELS,
  STATUS_LABELS,
  remindersApi,
  type ChannelAvailability,
  type DueReminder,
  type ReminderKind,
  type ReminderLogPage,
  type ReminderStatus,
  type SendResult,
} from "./api";
import { SendReminderButton } from "./SendReminderButton";

const WINDOWS = [
  ["3", "3 días"],
  ["7", "7 días"],
  ["30", "30 días"],
] as const;

const STATUS_TONES: Record<ReminderStatus, Tone> = {
  PENDIENTE: "neutral",
  ENVIADO: "success",
  FALLIDO: "danger",
  OMITIDO: "warning",
};

type View = "due" | "log";

const message = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** What happened to the reminder just sent, in the words of the brand: what, and what next. */
function resultNotice(reminder: DueReminder, result: SendResult): { tone: string; text: string } {
  if (result.outcome === "sent" && result.channel) {
    return {
      tone: "notice-success",
      text: `Listo, el recordatorio de ${reminder.petNames} salió por ${CHANNEL_LABELS[result.channel]} a ${reminder.client.firstName}.`,
    };
  }
  return {
    tone: "notice-danger",
    text: `No pudimos enviar el recordatorio de ${reminder.petNames}. ${result.reason ?? "Inténtalo de nuevo en un momento."}`,
  };
}

/**
 * Reminders the system sends to tutors: what is due and can go out now, and what already went.
 *
 * Shown for whichever unit the session is working in; the server scopes both lists.
 */
export function RemindersWorkspace() {
  const { activeBusinessUnit } = useAuth();
  const [view, setView] = useState<View>("due");
  const [days, setDays] = useState("7");
  const [kind, setKind] = useState<ReminderKind | "">("");
  const [due, setDue] = useState<DueReminder[]>([]);
  const [log, setLog] = useState<ReminderLogPage | null>(null);
  const [page, setPage] = useState(1);
  const [channels, setChannels] = useState<ChannelAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ tone: string; text: string } | null>(null);

  const loadDue = useCallback(async () => {
    try {
      setDue(await remindersApi.due({ days }));
      setError("");
    } catch (e) {
      setError(message(e, "No pudimos cargar los recordatorios. Inténtalo de nuevo."));
    }
  }, [days]);

  const loadLog = useCallback(async () => {
    try {
      setLog(await remindersApi.log(page));
      setError("");
    } catch (e) {
      setError(message(e, "No pudimos cargar los envíos. Inténtalo de nuevo."));
    }
  }, [page]);

  // The unit is part of the request (X-Business-Unit), so switching it reloads the list.
  useEffect(() => {
    let current = true;
    setLoading(true);
    void (view === "due" ? loadDue() : loadLog()).finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [view, loadDue, loadLog, activeBusinessUnit]);

  useEffect(() => {
    remindersApi
      .channels()
      .then(setChannels)
      .catch(() => setChannels(null));
  }, []);

  function onResult(reminder: DueReminder, result: SendResult | null, failure?: string) {
    setNotice(
      result
        ? resultNotice(reminder, result)
        : { tone: "notice-danger", text: failure ?? "No pudimos enviar el recordatorio." },
    );
    void loadDue();
  }

  const kinds = [...new Set(due.map((item) => item.kind))];
  const shown = kind ? due.filter((item) => item.kind === kind) : due;
  const simulated =
    channels !== null && (channels.WHATSAPP === "simulated" || channels.EMAIL === "simulated");
  const showUnit = !activeBusinessUnit;

  return (
    <div className="space-y-5">
      {simulated && (
        <div className="notice notice-warning" role="status">
          Este entorno no tiene un proveedor de mensajes conectado: los envíos quedan registrados,
          pero no llegan a nadie.
        </div>
      )}
      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className={`notice ${notice.tone}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          label="Recordatorios"
          value={view}
          onChange={(next) => {
            setView(next);
            setNotice(null);
          }}
          className="flex-1"
          items={[
            { id: "due" as View, label: "Por enviar", icon: Send, count: due.length },
            { id: "log" as View, label: "Enviados", icon: History },
          ]}
        />
        {view === "due" && (
          <select
            className="input sm:w-auto"
            aria-label="Ventana de tiempo"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          >
            {WINDOWS.map(([value, label]) => (
              <option key={value} value={value}>
                Próximos {label}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <PageLoader />
      ) : view === "due" ? (
        <>
          {kinds.length > 1 && (
            <Tabs
              label="Tipo de recordatorio"
              value={kind}
              onChange={setKind}
              items={[
                { id: "" as ReminderKind | "", label: "Todos", count: due.length },
                ...kinds.map((key) => ({
                  id: key as ReminderKind | "",
                  label: KIND_LABELS[key],
                  count: due.filter((item) => item.kind === key).length,
                })),
              ]}
            />
          )}
          {shown.length === 0 ? (
            <div className="card">
              <EmptyState icon={BellRing} title="No hay recordatorios por enviar en estos días.">
                Cuando haya una cita, una vacuna o un control cerca, aparecerá aquí.
              </EmptyState>
            </div>
          ) : (
            <div className="card overflow-hidden">
              {/* A phone gets one reminder per block: a four-column table there squeezes the
                  message into a ribbon and pushes the button off the screen. */}
              <ul className="divide-y divide-line-subtle md:hidden">
                {shown.map((reminder) => (
                  <li key={reminder.sourceKey} className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
                      <span className="font-medium text-ink">
                        {reminder.kind === "CITA"
                          ? fmtDateTime(reminder.dueAt)
                          : fmt(reminder.dueAt)}
                      </span>
                      <Badge tone="neutral">{KIND_BADGES[reminder.kind]}</Badge>
                      {reminder.overdue && (
                        <Badge tone="danger">
                          {reminder.kind === "LABORATORIO" ? "En espera" : "Vencido"}
                        </Badge>
                      )}
                      {showUnit && <UnitBadge unit={reminder.businessUnit} />}
                    </div>
                    <p className="text-sm">
                      <span className="font-medium text-ink">{reminder.petNames}</span>
                      <span className="text-muted">
                        {" · "}
                        {reminder.client.firstName} {reminder.client.lastName}
                      </span>
                    </p>
                    <p className="text-sm text-muted">{reminder.message}</p>
                    {reminder.lastSend && (
                      <p className="text-xs text-muted">
                        <Badge tone={STATUS_TONES[reminder.lastSend.status]}>
                          {STATUS_LABELS[reminder.lastSend.status]}
                        </Badge>{" "}
                        {fmtDateTime(reminder.lastSend.sentAt ?? reminder.lastSend.createdAt)}
                      </p>
                    )}
                    <SendReminderButton
                      reminder={reminder}
                      onResult={(result, failure) => onResult(reminder, result, failure)}
                    />
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead>
                    <tr>
                      {["Fecha", "Mascota y tutor", "Mensaje", ""].map((title, index) => (
                        <th key={index} className="table-th">
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((reminder) => (
                      <tr key={reminder.sourceKey} className="table-tr align-top">
                        <td className="table-td whitespace-nowrap tabular-nums">
                          {reminder.kind === "CITA"
                            ? fmtDateTime(reminder.dueAt)
                            : fmt(reminder.dueAt)}
                          <span className="mt-1 flex flex-wrap gap-1">
                            <Badge tone="neutral">{KIND_BADGES[reminder.kind]}</Badge>
                            {reminder.overdue && (
                              <Badge tone="danger">
                                {reminder.kind === "LABORATORIO" ? "En espera" : "Vencido"}
                              </Badge>
                            )}
                            {showUnit && <UnitBadge unit={reminder.businessUnit} />}
                          </span>
                        </td>
                        <td className="table-td">
                          <span className="font-medium text-ink">{reminder.petNames}</span>
                          <span className="block text-xs text-muted">
                            {reminder.client.firstName} {reminder.client.lastName}
                            {reminder.recipient ? ` · ${reminder.recipient}` : ""}
                          </span>
                        </td>
                        <td className="table-td max-w-md text-sm text-muted">
                          {reminder.message}
                          {reminder.lastSend && (
                            <span className="mt-1 block text-xs">
                              <Badge tone={STATUS_TONES[reminder.lastSend.status]}>
                                {STATUS_LABELS[reminder.lastSend.status]}
                              </Badge>{" "}
                              {fmtDateTime(reminder.lastSend.sentAt ?? reminder.lastSend.createdAt)}
                              {reminder.lastSend.status !== "ENVIADO" && reminder.lastSend.error
                                ? ` · ${reminder.lastSend.error}`
                                : ""}
                            </span>
                          )}
                        </td>
                        <td className="table-td whitespace-nowrap text-right">
                          <SendReminderButton
                            reminder={reminder}
                            onResult={(result, failure) => onResult(reminder, result, failure)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : !log || log.items.length === 0 ? (
        <div className="card">
          <EmptyState icon={History} title="Todavía no se ha enviado ningún recordatorio.">
            Cada envío, automático o hecho a mano, queda anotado aquí.
          </EmptyState>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {["Fecha", "Mascota y tutor", "Tipo", "Canal", "Estado"].map((title) => (
                    <th key={title} className="table-th">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.items.map((entry) => (
                  <tr key={entry.id} className="table-tr align-top">
                    <td className="table-td whitespace-nowrap tabular-nums">
                      {fmtDateTime(entry.sentAt ?? entry.createdAt)}
                      <span className="block text-xs text-muted">
                        {entry.trigger === "AUTO" ? "Automático" : "A mano"}
                      </span>
                    </td>
                    <td className="table-td">
                      <span className="font-medium text-ink">{entry.pet?.name ?? "—"}</span>
                      <span className="block text-xs text-muted">
                        {entry.client ? `${entry.client.firstName} ${entry.client.lastName}` : "—"}
                      </span>
                    </td>
                    <td className="table-td">
                      {KIND_BADGES[entry.kind] ?? entry.kind}
                      {showUnit && <UnitBadge unit={entry.businessUnit} className="ml-2" />}
                    </td>
                    <td className="table-td">
                      {entry.channel ? CHANNEL_LABELS[entry.channel] : "—"}
                      {entry.recipient && (
                        <span className="block text-xs text-muted">{entry.recipient}</span>
                      )}
                    </td>
                    <td className="table-td">
                      <Badge tone={STATUS_TONES[entry.status]}>{STATUS_LABELS[entry.status]}</Badge>
                      {entry.error && (
                        <span className="mt-1 block max-w-xs text-xs text-muted">
                          {entry.error}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {log.pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-line-subtle px-4 py-3 text-sm text-muted">
              <span className="tabular-nums">
                Página {log.page} de {log.pageCount} · {log.total} envíos
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={log.page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  <ChevronLeft size={15} aria-hidden /> Anterior
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={log.page >= log.pageCount}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Siguiente <ChevronRight size={15} aria-hidden />
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
