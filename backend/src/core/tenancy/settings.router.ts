import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../db";
import { BUSINESS_UNITS, handleAuthzError, normalizeBusinessUnit } from "../../middleware/auth";
import { getRequiredDaycareId } from "./scope";
import {
  DEFAULT_TIMEZONE,
  DEFAULT_VAT_PERCENT,
  REMINDER_CHANNELS,
  invalidateUnitSettings,
  reminderSettingsSelect,
  toReminderSettings,
} from "./unit-settings";

export const settingsRouter = Router();

/**
 * Per-daycare operational settings.
 *
 * The settings screen used to be a fake: `vatPercent` lived in `useState` and "Guardar" flashed a
 * confirmation without calling anything. These are the values that were pretended at — the ones
 * that genuinely change behaviour — persisted per (daycare, business unit), which is the grain
 * the unique key on `business_unit_settings` already had.
 *
 * Identity fields (name, legal name, slug, which units exist) are deliberately read-only here:
 * they are the vendor's to set from the platform console, not the tenant's.
 */

function parseUnits(units: string): string[] {
  return units
    .split(",")
    .map((unit) => unit.trim().toUpperCase())
    .filter((unit) => (BUSINESS_UNITS as readonly string[]).includes(unit));
}

settingsRouter.get("/", async (req, res) => {
  try {
    const daycareId = getRequiredDaycareId(req);
    const daycare = await prisma.daycare.findUnique({
      where: { id: daycareId },
      select: {
        id: true,
        slug: true,
        name: true,
        legalName: true,
        timezone: true,
        units: true,
        isActive: true,
      },
    });
    if (!daycare) {
      res.status(404).json({ message: "Guardería no encontrada" });
      return;
    }

    const units = parseUnits(daycare.units);
    const rows = await prisma.businessUnitSetting.findMany({
      where: { daycareId, businessUnit: { in: units } },
      select: {
        businessUnit: true,
        timezone: true,
        vatPercent: true,
        updatedAt: true,
        ...reminderSettingsSelect,
      },
    });
    const byUnit = new Map(rows.map((row) => [row.businessUnit, row]));

    res.json({
      // Read-only: shown so an operator can see what they are configured as, and see that
      // changing it is not theirs to do.
      daycare: {
        id: daycare.id,
        slug: daycare.slug,
        name: daycare.name,
        legalName: daycare.legalName,
        timezone: daycare.timezone,
        isActive: daycare.isActive,
      },
      // One entry per unit the daycare has, whether or not a row exists yet: a missing row means
      // "defaults", not "unconfigurable".
      units: units.map((businessUnit) => {
        const row = byUnit.get(businessUnit);
        return {
          businessUnit,
          timezone: row?.timezone ?? daycare.timezone ?? DEFAULT_TIMEZONE,
          vatPercent: row?.vatPercent ?? DEFAULT_VAT_PERCENT,
          reminders: toReminderSettings(row),
          isConfigured: Boolean(row),
          updatedAt: row?.updatedAt ?? null,
        };
      }),
    });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

const updateSchema = z.object({
  // IANA zone names; validated against the runtime rather than a hard-coded list.
  timezone: z.string().min(1).max(64).optional(),
  vatPercent: z.number().min(0).max(100).optional(),
  // How this unit reminds its tutors. Sent whole: the channels and their default are only
  // valid together.
  reminders: z
    .object({
      auto: z.boolean(),
      channels: z.array(z.enum(REMINDER_CHANNELS)).min(1).max(REMINDER_CHANNELS.length),
      defaultChannel: z.enum(REMINDER_CHANNELS),
      leadDays: z.number().int().min(1).max(30),
      contactPhone: z.string().trim().max(40).nullable(),
      contactEmail: z.string().trim().email().max(200).nullable().or(z.literal("")),
    })
    .optional(),
});

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

settingsRouter.put("/:businessUnit", async (req, res) => {
  try {
    const daycareId = getRequiredDaycareId(req);
    const businessUnit = normalizeBusinessUnit(req.params.businessUnit);
    if (!businessUnit) {
      res.status(400).json({ message: "Unidad de negocio inválida" });
      return;
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      return;
    }

    const daycare = await prisma.daycare.findUnique({
      where: { id: daycareId },
      select: { units: true, timezone: true },
    });
    if (!daycare) {
      res.status(404).json({ message: "Guardería no encontrada" });
      return;
    }
    // A daycare cannot configure a unit it did not buy; the console owns which units exist.
    if (!parseUnits(daycare.units).includes(businessUnit)) {
      res.status(404).json({ message: "Esta guardería no tiene esa unidad de negocio" });
      return;
    }

    if (parsed.data.timezone && !isValidTimezone(parsed.data.timezone)) {
      // A bad zone would silently shift every recurring occurrence the scheduler generates.
      res.status(400).json({ message: `Zona horaria no reconocida: ${parsed.data.timezone}` });
      return;
    }

    const { reminders } = parsed.data;
    if (reminders && !reminders.channels.includes(reminders.defaultChannel)) {
      // Otherwise a tutor with no preference would be sent by a channel the unit switched off.
      res.status(400).json({ message: "El canal por defecto debe ser uno de los canales activos" });
      return;
    }
    const reminderData = reminders
      ? {
          remindersAuto: reminders.auto,
          reminderChannels: [...new Set(reminders.channels)],
          reminderDefaultChannel: reminders.defaultChannel,
          reminderLeadDays: reminders.leadDays,
          contactPhone: reminders.contactPhone || null,
          contactEmail: reminders.contactEmail || null,
        }
      : {};

    const setting = await prisma.businessUnitSetting.upsert({
      where: { daycareId_businessUnit: { daycareId, businessUnit } },
      update: {
        timezone: parsed.data.timezone,
        vatPercent: parsed.data.vatPercent,
        ...reminderData,
      },
      create: {
        daycareId,
        businessUnit,
        timezone: parsed.data.timezone ?? daycare.timezone ?? DEFAULT_TIMEZONE,
        vatPercent: parsed.data.vatPercent ?? DEFAULT_VAT_PERCENT,
        ...reminderData,
      },
      select: {
        businessUnit: true,
        timezone: true,
        vatPercent: true,
        updatedAt: true,
        ...reminderSettingsSelect,
      },
    });

    // The scheduler and the pricing defaults read these through a short-lived cache.
    invalidateUnitSettings(daycareId, businessUnit);

    res.json({
      businessUnit: setting.businessUnit,
      timezone: setting.timezone,
      vatPercent: setting.vatPercent,
      updatedAt: setting.updatedAt,
      reminders: toReminderSettings(setting),
      isConfigured: true,
    });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});
