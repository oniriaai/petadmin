export { veterinariaRouter } from "./veterinaria.router";
export { VETERINARIA_BUSINESS_UNIT } from "./visits.service";
// What the clinic should chase. Public because the reminders module sends these to tutors.
export { REMINDER_KINDS as CLINIC_REMINDER_KINDS, listReminders } from "./insights.service";
export type {
  Reminder as ClinicReminder,
  ReminderKind as ClinicReminderKind,
} from "./insights.service";
