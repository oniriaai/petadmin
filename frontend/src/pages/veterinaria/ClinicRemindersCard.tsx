import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { fmt } from "../../lib/utils";
import { veterinariaApi, type Reminder } from "./api";

const SHOWN = 5;

/**
 * The clinic's reminders on the dashboard. Renders nothing when there is nothing to chase or the
 * request is refused, which is what an admin working in another unit gets.
 */
export function ClinicRemindersCard() {
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    let current = true;
    veterinariaApi
      .reminders({ days: "7" })
      .then((loaded) => current && setReminders(loaded))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  if (reminders.length === 0) return null;
  const overdue = reminders.filter((reminder) => reminder.overdue).length;

  return (
    <section className="card" aria-label="Recordatorios de la clínica">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">
          Recordatorios de la clínica
          <span className="ml-2 text-sm font-normal text-muted">
            {reminders.length} esta semana{overdue > 0 ? ` · ${overdue} vencidos` : ""}
          </span>
        </h2>
        <Link
          to="/veterinaria/recordatorios"
          className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
        >
          Ver todos <ArrowRight size={14} />
        </Link>
      </div>
      <ul className="divide-y divide-gray-100 text-sm">
        {reminders.slice(0, SHOWN).map((reminder) => (
          <li key={reminder.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <span>
              <span className="font-medium text-gray-900">{reminder.pet.name}</span>{" "}
              <span className="text-gray-700">· {reminder.label}</span>
            </span>
            <span className={reminder.overdue ? "text-red-700" : "text-muted"}>
              {fmt(reminder.dueAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
