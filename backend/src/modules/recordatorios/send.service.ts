import { Prisma } from "@prisma/client";

import { prisma } from "../../db";
import { DeliveryError, deliver, type Channel } from "../../core/messaging";
import { localDayBoundsUtc, localHourInTimezone } from "../../core/tenancy/local-time";
import {
  getUnitReminderSettings,
  getUnitTimezone,
  reminderSettingsSelect,
  toReminderSettings,
} from "../../core/tenancy/unit-settings";
import { AuthzError, type BusinessUnit } from "../../middleware/auth";
import { logger } from "../../middleware/observability";
import { getEnabledProductModules } from "../../platform/module-access";
import {
  contentFor,
  listDue,
  loadTenantContext,
  resolveChannel,
  usableChannels,
  type DueReminder,
  type TenantContext,
} from "./due.service";
import { renderEmailHtml, renderEmailText } from "./email-layout";
import { WHATSAPP_FOOTER, renderReminder } from "./templates";

/** The product module a tenant must hold for anything here to be sent on its behalf. */
export const RECORDATORIOS_MODULE_ID = "recordatorios";

const DAY_MS = 86_400_000;
const MAX_ATTEMPTS = 3;
const ERROR_MAX_LENGTH = 300;
/** Nobody wants a reminder at three in the morning. Local hours, end exclusive. */
const SEND_WINDOW = { from: 8, to: 20 } as const;
/** Kinds the job sends on its own. A pending lab result is told by a person, not a timer. */
const AUTOMATIC_KINDS = ["CITA", "VACUNA", "PREVENTIVO", "CONTROL"] as const;

/** The most a tenant may send in 24 hours: a fuse against a runaway bill, not a quota. */
export function dailyCap(): number {
  const parsed = Number(process.env.REMINDERS_DAILY_CAP);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 500;
}

async function sentInLastDay(daycareId: string): Promise<number> {
  return prisma.reminderMessage.count({
    where: { daycareId, status: "ENVIADO", sentAt: { gte: new Date(Date.now() - DAY_MS) } },
  });
}

export type SendOutcome = "sent" | "skipped" | "failed" | "duplicate";

export interface SendResult {
  outcome: SendOutcome;
  id: string | null;
  channel: Channel | null;
  recipient: string | null;
  /** Why it was not sent, for `skipped` and `failed`. */
  reason: string | null;
}

interface SendOptions {
  trigger: "AUTO" | "MANUAL";
  /** A channel chosen by hand for this one send, overriding the tutor's preference. */
  channel?: Channel;
  userId?: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Reserves the log row for an automatic send, which is what makes the job idempotent.
 *
 * The row is written BEFORE the message goes out, under the unique `(daycareId, dedupeKey)`:
 * two overlapping runs cannot both insert it, so they cannot both send. A row left from an
 * earlier attempt is taken over only when it failed (up to `MAX_ATTEMPTS`) or was skipped for a
 * reason that may have gone away since, such as a tutor who now has a number on file.
 */
async function claimAutomatic(
  item: DueReminder,
  daycareId: string,
  data: { channel: Channel | null; recipient: string | null },
): Promise<string | null> {
  const findExisting = () =>
    prisma.reminderMessage.findFirst({
      where: { daycareId, dedupeKey: item.dedupeKey },
      select: { id: true, status: true, attempts: true },
    });

  // Read first: on most runs the reminder went out on an earlier one, and finding that out
  // from a failed insert would write a database error to the log for every reminder, every hour.
  let existing = await findExisting();
  if (!existing) {
    try {
      const row = await prisma.reminderMessage.create({
        data: {
          daycareId,
          businessUnit: item.businessUnit,
          clientId: item.client.id,
          petId: item.petId,
          kind: item.kind,
          sourceKey: item.sourceKey,
          dedupeKey: item.dedupeKey,
          trigger: "AUTO",
          status: "PENDIENTE",
          attempts: 1,
          ...data,
        },
        select: { id: true },
      });
      return row.id;
    } catch (error) {
      // Another run inserted it between the read and the write. The unique key is what
      // actually decides who sends; the read above only keeps the common case quiet.
      if (!isUniqueViolation(error)) throw error;
      existing = await findExisting();
    }
  }
  if (!existing) return null;
  const retryable =
    (existing.status === "FALLIDO" && existing.attempts < MAX_ATTEMPTS) ||
    // A skip is only worth revisiting once there is somewhere to send to.
    (existing.status === "OMITIDO" && data.channel !== null);
  if (!retryable) return null;

  // Conditional on the status it was read with, so only one of two racing runs takes it over.
  const taken = await prisma.reminderMessage.updateMany({
    where: { id: existing.id, daycareId, status: existing.status },
    data: { status: "PENDIENTE", attempts: { increment: 1 }, error: null, ...data },
  });
  return taken.count === 1 ? existing.id : null;
}

/**
 * Sends one reminder and records what happened to it.
 *
 * `item` must come from `listDue`: it is the server's own reading of the record, with the
 * recipient taken from the tutor's file. Nothing here trusts a recipient handed in from outside.
 */
export async function sendReminder(
  tenant: TenantContext,
  item: DueReminder,
  options: SendOptions,
): Promise<SendResult> {
  const { daycareId } = tenant;
  const [settings, timezone] = await Promise.all([
    getUnitReminderSettings(daycareId, item.businessUnit),
    getUnitTimezone(daycareId, item.businessUnit),
  ]);
  const decision = resolveChannel(item.client, settings, usableChannels(), options.channel);

  let id: string | null;
  if (options.trigger === "AUTO") {
    id = await claimAutomatic(item, daycareId, {
      channel: decision.channel,
      recipient: decision.recipient,
    });
    if (!id) {
      return { outcome: "duplicate", id: null, channel: null, recipient: null, reason: null };
    }
  } else {
    // A person asked for this one, so being told why it cannot go is more useful than a row.
    if (!decision.channel) throw new AuthzError(409, decision.skipReason);
    const row = await prisma.reminderMessage.create({
      data: {
        daycareId,
        businessUnit: item.businessUnit,
        clientId: item.client.id,
        petId: item.petId,
        kind: item.kind,
        sourceKey: item.sourceKey,
        trigger: "MANUAL",
        status: "PENDIENTE",
        attempts: 1,
        channel: decision.channel,
        recipient: decision.recipient,
        sentByUserId: options.userId ?? null,
      },
      select: { id: true },
    });
    id = row.id;
  }

  if (!decision.channel) {
    await prisma.reminderMessage.update({
      where: { id },
      data: { status: "OMITIDO", error: decision.skipReason },
    });
    return { outcome: "skipped", id, channel: null, recipient: null, reason: decision.skipReason };
  }

  const { channel, recipient } = decision;
  const content = contentFor(tenant, item.businessUnit, item, settings, timezone);
  const rendered = renderReminder(content, channel);
  const layout = {
    headline: rendered.headline,
    body: rendered.text,
    business: tenant.name,
    pets: item.petNames,
    contactEmail: settings.contactEmail,
  };
  try {
    const delivery = await deliver(
      channel === "WHATSAPP"
        ? {
            channel,
            whatsapp: { to: recipient, template: rendered.template.name, params: rendered.params },
            preview: `${rendered.text}\n${WHATSAPP_FOOTER}`,
          }
        : {
            channel,
            email: {
              to: recipient,
              subject: rendered.subject,
              html: renderEmailHtml(layout),
              text: renderEmailText(layout),
              replyTo: settings.contactEmail,
            },
          },
    );
    await prisma.reminderMessage.update({
      where: { id },
      data: {
        status: "ENVIADO",
        sentAt: new Date(),
        providerMessageId: delivery.providerMessageId,
        error: null,
      },
    });
    return { outcome: "sent", id, channel, recipient, reason: null };
  } catch (error) {
    // Only a DeliveryError is worded for people. Anything else is a bug: its text stays in the
    // server log and the row gets a plain sentence.
    const reason =
      error instanceof DeliveryError ? error.message : "No se pudo enviar el recordatorio";
    if (!(error instanceof DeliveryError)) {
      logger.error({ err: error, daycareId, reminderId: id }, "[reminders] envío fallido");
    }
    await prisma.reminderMessage.update({
      where: { id },
      data: { status: "FALLIDO", error: reason.slice(0, ERROR_MAX_LENGTH) },
    });
    return { outcome: "failed", id, channel, recipient, reason };
  }
}

/** Sends one reminder a member of staff picked, by the key the due list gave them. */
export async function sendManualReminder(
  daycareId: string,
  units: readonly BusinessUnit[],
  input: { sourceKey: string; channel?: Channel; userId?: string | null },
): Promise<SendResult> {
  const tenant = await loadTenantContext(daycareId);
  if (!tenant) throw new AuthzError(404, "Recordatorio no encontrado");

  // Looked up again under the caller's tenant and units: the key came from the request, and a
  // key from another tenant, another unit or a visit since cancelled must read as absent.
  let item: DueReminder | undefined;
  for (const unit of units) {
    [item] = await listDue(tenant, unit, { sourceKey: input.sourceKey });
    if (item) break;
  }
  if (!item) throw new AuthzError(404, "Recordatorio no encontrado");

  if ((await sentInLastDay(daycareId)) >= dailyCap()) {
    throw new AuthzError(
      429,
      "Llegaste al máximo de recordatorios por día. Escríbenos si necesitas ampliarlo.",
    );
  }
  return sendReminder(tenant, item, {
    trigger: "MANUAL",
    channel: input.channel,
    userId: input.userId,
  });
}

export interface ReminderRunStats {
  daycares: number;
  units: number;
  evaluated: number;
  sent: number;
  skipped: number;
  duplicates: number;
  failed: number;
  failures: Array<{ daycareId: string; sourceKey: string; reason: string }>;
}

export interface ReminderRunOptions {
  now?: Date;
  /** Send whatever the local hour. For tests and for a run someone starts by hand. */
  ignoreSendWindow?: boolean;
  /** Limit the run to one tenant. */
  daycareId?: string;
}

/**
 * The scheduled pass: for every unit that turned automatic reminders on, sends tomorrow's
 * appointments and the health reminders coming due within the unit's days of notice.
 *
 * Safe to run as often as wanted and from more than one place: each send is claimed first
 * (`claimAutomatic`). It is meant to run hourly, so a unit is reached soon after its morning
 * starts whatever its timezone.
 */
export async function runAutomaticReminders(
  options: ReminderRunOptions = {},
): Promise<ReminderRunStats> {
  const now = options.now ?? new Date();
  const stats: ReminderRunStats = {
    daycares: 0,
    units: 0,
    evaluated: 0,
    sent: 0,
    skipped: 0,
    duplicates: 0,
    failed: 0,
    failures: [],
  };

  const settingsRows = await prisma.businessUnitSetting.findMany({
    where: {
      remindersAuto: true,
      daycare: { isActive: true },
      ...(options.daycareId ? { daycareId: options.daycareId } : {}),
    },
    select: { daycareId: true, businessUnit: true, timezone: true, ...reminderSettingsSelect },
    orderBy: [{ daycareId: "asc" }, { businessUnit: "asc" }],
  });

  const tenants = new Map<string, TenantContext | null>();
  for (const row of settingsRows) {
    if (!tenants.has(row.daycareId)) {
      // The switch may outlive the subscription: a tenant that no longer has the module is not
      // sent for, whatever its settings still say.
      const entitled = (await getEnabledProductModules(row.daycareId)).has(RECORDATORIOS_MODULE_ID);
      tenants.set(row.daycareId, entitled ? await loadTenantContext(row.daycareId) : null);
      if (tenants.get(row.daycareId)) stats.daycares += 1;
    }
    const tenant = tenants.get(row.daycareId);
    const unit = tenant?.units.find((candidate) => candidate === row.businessUnit);
    if (!tenant || !unit) continue;

    const hour = localHourInTimezone(now, row.timezone);
    if (!options.ignoreSendWindow && (hour < SEND_WINDOW.from || hour >= SEND_WINDOW.to)) continue;
    stats.units += 1;

    const settings = toReminderSettings(row);
    // "Tomorrow" is the unit's tomorrow: the server's clock is in UTC and the salon's is not.
    const tomorrow = localDayBoundsUtc(new Date(now.getTime() + DAY_MS), row.timezone);
    const horizon = now.getTime() + settings.leadDays * DAY_MS;
    const due = (await listDue(tenant, unit, { days: Math.max(settings.leadDays, 2) })).filter(
      (item) => {
        if (!(AUTOMATIC_KINDS as readonly string[]).includes(item.kind)) return false;
        if (item.kind === "CITA") {
          return tomorrow !== null && item.dueAt >= tomorrow.start && item.dueAt < tomorrow.end;
        }
        // Already overdue is a backlog, and a backlog is worked through by a person: turning
        // the switch on must not message every tutor with a vaccine a year late.
        return !item.overdue && item.dueAt.getTime() <= horizon;
      },
    );

    let remaining = dailyCap() - (await sentInLastDay(tenant.daycareId));
    for (const item of due) {
      stats.evaluated += 1;
      if (remaining <= 0) {
        logger.warn(
          { daycareId: tenant.daycareId, cap: dailyCap() },
          "[reminders] tope diario alcanzado; el resto queda para la próxima ejecución",
        );
        break;
      }
      try {
        const result = await sendReminder(tenant, item, { trigger: "AUTO" });
        if (result.outcome === "sent") {
          stats.sent += 1;
          remaining -= 1;
        } else if (result.outcome === "skipped") stats.skipped += 1;
        else if (result.outcome === "duplicate") stats.duplicates += 1;
        else {
          stats.failed += 1;
          stats.failures.push({
            daycareId: tenant.daycareId,
            sourceKey: item.sourceKey,
            reason: result.reason ?? "",
          });
        }
      } catch (error) {
        // One tutor's reminder must not stop everyone else's.
        stats.failed += 1;
        stats.failures.push({
          daycareId: tenant.daycareId,
          sourceKey: item.sourceKey,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return stats;
}

const HOUR_MS = 60 * 60 * 1000;

/** The in-process timer for development. Production runs `job:reminders` from a scheduler. */
export function startRemindersScheduler() {
  const run = async () => {
    try {
      const stats = await runAutomaticReminders();
      logger.info(stats, "[reminders] ejecución");
    } catch (error) {
      logger.error({ err: error }, "[reminders] la ejecución falló");
    }
  };

  void run();
  return setInterval(() => {
    void run();
  }, HOUR_MS);
}
