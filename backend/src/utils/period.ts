import type { Request } from "express";
import { AuthzError, getBusinessUnitScope } from "../middleware/auth";
import { resolveDaycareScope } from "../core/tenancy/scope";
import {
  localDatePartsInTimezone,
  localDateTimeToUtc,
  localDayBoundsUtc,
  type LocalDate,
} from "../core/tenancy/local-time";
import { DEFAULT_TIMEZONE, getUnitTimezone } from "../core/tenancy/unit-settings";

/**
 * The `from`/`to` of a finance screen, as UTC instants.
 *
 * Both are local calendar days (`YYYY-MM-DD`) of the unit, inclusive, so "the 31st" reaches the
 * end of the 31st where the business is and not where the server runs. `end` is exclusive.
 */
export interface Period {
  start: Date;
  end: Date;
}

/** The timezone a request's days are read in: that of the first unit in its scope. */
export async function requestTimezone(req: Request): Promise<string> {
  const scope = resolveDaycareScope(req);
  if (scope.mode !== "single") return DEFAULT_TIMEZONE;
  return getUnitTimezone(scope.daycareId, getBusinessUnitScope(req)[0]);
}

function localMidnight(local: LocalDate, timezone: string): Date {
  return localDateTimeToUtc({ ...local, hour: 0, minute: 0 }, timezone);
}

function readDay(value: unknown, timezone: string): { start: Date; end: Date } | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const bounds = localDayBoundsUtc(value, timezone);
  if (!bounds) throw new AuthzError(400, "Fecha inválida");
  return bounds;
}

/**
 * A date typed into a form. A bare `YYYY-MM-DD` is that day where the business is; read as an
 * instant it would be midnight UTC, which is still the evening before in Ecuador, so the row
 * showed and filtered a day early.
 */
export function parseFormDate(value: string, timezone: string): Date {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? readDay(value, timezone) : undefined;
  if (day) return day.start;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new AuthzError(400, "Fecha inválida");
  return instant;
}

/** An optional range for a list: either end may be open, and with neither there is no filter. */
export function readRange(req: Request, timezone: string): Partial<Period> {
  const from = readDay(req.query.from, timezone);
  const to = readDay(req.query.to, timezone);
  return { start: from?.start, end: to?.end };
}

/** The Prisma fragment for a date column, or undefined when the range is open on both ends. */
export function rangeWhere(range: Partial<Period>): { gte?: Date; lt?: Date } | undefined {
  if (!range.start && !range.end) return undefined;
  return { gte: range.start, lt: range.end };
}

/** A closed period for a report. Whatever is missing defaults to the current local month. */
export function readPeriod(req: Request, timezone: string, now = new Date()): Period {
  const range = readRange(req, timezone);
  const today = localDatePartsInTimezone(now, timezone);
  const period = {
    start: range.start ?? localMidnight({ ...today, day: 1 }, timezone),
    end: range.end ?? localMidnight({ ...today, month: today.month + 1, day: 1 }, timezone),
  };
  if (period.start >= period.end) throw new AuthzError(400, "El periodo es inválido");
  return period;
}

/**
 * The period to compare against. Whole calendar months step back by as many months, so October
 * is compared with September and not with the 31 days before it; anything else steps back by
 * its own length.
 */
export function previousPeriod(period: Period, timezone: string): Period {
  const start = localDatePartsInTimezone(period.start, timezone);
  const end = localDatePartsInTimezone(period.end, timezone);
  const months = (end.year - start.year) * 12 + (end.month - start.month);
  const wholeMonths =
    start.day === 1 &&
    end.day === 1 &&
    months > 0 &&
    localMidnight(start, timezone).getTime() === period.start.getTime() &&
    localMidnight(end, timezone).getTime() === period.end.getTime();
  if (wholeMonths) {
    return {
      start: localMidnight({ ...start, month: start.month - months }, timezone),
      end: period.start,
    };
  }
  return {
    start: new Date(period.start.getTime() - (period.end.getTime() - period.start.getTime())),
    end: period.start,
  };
}

/** The `count` local months ending with the one that contains the last day of the period. */
export function monthsEndingAt(
  period: Period,
  timezone: string,
  count: number,
): Array<Period & { month: string }> {
  const last = localDatePartsInTimezone(new Date(period.end.getTime() - 1), timezone);
  return Array.from({ length: count }, (_, i) => {
    const offset = i - (count - 1);
    const start = localMidnight({ ...last, month: last.month + offset, day: 1 }, timezone);
    const end = localMidnight({ ...last, month: last.month + offset + 1, day: 1 }, timezone);
    const label = localDatePartsInTimezone(start, timezone);
    return { month: `${label.year}-${String(label.month).padStart(2, "0")}`, start, end };
  });
}
