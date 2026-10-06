import { PageHeader } from "../../components/layout/PageHeader";
import { RemindersWorkspace } from "./RemindersWorkspace";

/** Reminders to tutors, sent by the system over WhatsApp or email. */
export function AvisosPage() {
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Avisos a tutores"
        subtitle="Recordatorios de citas, vacunas y controles, por WhatsApp o correo"
      />
      <RemindersWorkspace />
    </div>
  );
}
