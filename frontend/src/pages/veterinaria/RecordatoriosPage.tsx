import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, MessageCircle } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { PageLoader } from "../../components/ui/Spinner";
import { useAuth } from "../../lib/auth-context";
import { fmt } from "../../lib/utils";
import {
  REMINDER_KINDS,
  errorMessage,
  veterinariaApi,
  whatsappLink,
  type Reminder,
  type ReminderKind,
} from "./api";
import { Tabs } from "../../components/ui/Tabs";

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
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}

      <Tabs
        label="Tipo de recordatorio"
        value={kind}
        onChange={setKind}
        items={[
          { id: "" as ReminderKind | "", label: "Todos", count: reminders.length },
          ...(Object.keys(REMINDER_KINDS) as ReminderKind[]).map((key) => ({
            id: key as ReminderKind | "",
            label: REMINDER_KINDS[key],
            count: count(key),
          })),
        ]}
      />

      {loading ? (
        <PageLoader />
      ) : shown.length === 0 ? (
        <div className="card p-10 text-center">
          <BellRing size={28} className="mx-auto mb-2 text-faint" />
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
                          <Badge color="bg-danger-soft text-danger-ink" className="ml-2">
                            {reminder.kind === "LABORATORIO" ? "En espera" : "Vencido"}
                          </Badge>
                        )}
                      </td>
                      <td className="table-td">
                        <Link
                          to={`/veterinaria/pacientes/${reminder.pet.id}`}
                          className="font-medium text-ink hover:underline"
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
