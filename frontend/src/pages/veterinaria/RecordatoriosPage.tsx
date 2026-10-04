import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, MessageCircle } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { PageLoader } from "../../components/ui/Spinner";
import { useAuth } from "../../lib/auth-context";
import { cls, fmt } from "../../lib/utils";
import {
  REMINDER_KINDS,
  errorMessage,
  veterinariaApi,
  whatsappLink,
  type Reminder,
  type ReminderKind,
} from "./api";

const WINDOWS = [
  ["7", "7 días"],
  ["30", "30 días"],
  ["90", "90 días"],
] as const;

/** The message offered to the tutor. The clinic sends it from its own WhatsApp, and may edit it. */
export function reminderMessage(reminder: Reminder, clinic: string): string {
  const greeting = `Hola ${reminder.client.firstName}, le escribimos de ${clinic}.`;
  const date = fmt(reminder.dueAt, "d 'de' MMMM");
  switch (reminder.kind) {
    case "VACUNA":
    case "PREVENTIVO":
      return `${greeting} A ${reminder.pet.name} le corresponde: ${reminder.label.toLowerCase()} (${date}). ¿Le agendamos una cita?`;
    case "CONTROL":
      return `${greeting} ${reminder.pet.name} tiene un control pendiente desde el ${date}. ¿Le agendamos una cita?`;
    case "LABORATORIO":
      return `${greeting} Seguimos a la espera del resultado del examen de ${reminder.pet.name}; le avisaremos en cuanto llegue.`;
  }
}

/** What the clinic should chase: doses coming due, follow-ups nobody booked, pending results. */
export function RecordatoriosPage() {
  const { daycare } = useAuth();
  const [kind, setKind] = useState<ReminderKind | "">("");
  const [days, setDays] = useState("30");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setLoading(true);
    veterinariaApi
      .reminders({ days })
      .then((loaded) => {
        if (!current) return;
        setReminders(loaded);
        setError("");
      })
      .catch((e) => current && setError(errorMessage(e, "No se pudieron cargar los recordatorios")))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [days]);

  const clinic = daycare?.name ?? "la clínica";
  const shown = kind ? reminders.filter((reminder) => reminder.kind === kind) : reminders;
  const count = (candidate: ReminderKind) => reminders.filter((r) => r.kind === candidate).length;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Recordatorios"
        subtitle="Vacunas y preventivos por vencer, controles sin agendar y exámenes sin resultado"
        actions={
          <select
            className="input w-auto"
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
        }
      />

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de recordatorio">
        <button
          role="tab"
          aria-selected={kind === ""}
          className={cls("btn-sm", kind === "" ? "btn-primary" : "btn-secondary")}
          onClick={() => setKind("")}
        >
          Todos ({reminders.length})
        </button>
        {(Object.keys(REMINDER_KINDS) as ReminderKind[]).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={kind === key}
            className={cls("btn-sm", kind === key ? "btn-primary" : "btn-secondary")}
            onClick={() => setKind(key)}
          >
            {REMINDER_KINDS[key]} ({count(key)})
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader />
      ) : shown.length === 0 ? (
        <div className="card p-10 text-center">
          <BellRing size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-muted">Nada pendiente en este periodo.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {["Fecha", "Paciente", "Pendiente", ""].map((title, index) => (
                    <th key={index} className="table-th">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((reminder) => {
                  const link = whatsappLink(reminder.client, reminderMessage(reminder, clinic));
                  return (
                    <tr key={reminder.id} className="table-tr">
                      <td className="table-td whitespace-nowrap">
                        {fmt(reminder.dueAt)}
                        {reminder.overdue && (
                          <Badge color="bg-red-100 text-red-800" className="ml-2">
                            {reminder.kind === "LABORATORIO" ? "En espera" : "Vencido"}
                          </Badge>
                        )}
                      </td>
                      <td className="table-td">
                        <Link
                          to={`/veterinaria/pacientes/${reminder.pet.id}`}
                          className="font-medium text-gray-900 hover:underline"
                        >
                          {reminder.pet.name}
                        </Link>
                        <span className="block text-xs text-muted">
                          {reminder.client.firstName} {reminder.client.lastName}
                          {reminder.client.phone ? ` · ${reminder.client.phone}` : ""}
                        </span>
                      </td>
                      <td className="table-td">{reminder.label}</td>
                      <td className="table-td text-right whitespace-nowrap">
                        {link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary btn-sm"
                          >
                            <MessageCircle size={15} /> WhatsApp
                          </a>
                        ) : (
                          <span className="text-xs text-muted">Sin teléfono</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
