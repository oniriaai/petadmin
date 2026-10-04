/**
 * Wall-clock time in a unit's configured timezone.
 *
 * The server runs in UTC and a daycare does not: "today" and "the 4th" are local notions, and
 * computing them with `setHours(0, 0, 0, 0)` yields the server's day instead of the unit's.
 */

export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

export function localDatePartsInTimezone(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { year, month, day };
}

function localDateTimeOffsetMs(utcDate: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // Not `hour12: false`: that formats midnight as "24", which reads as the following day.
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(utcDate);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const second = Number(parts.find((p) => p.type === "second")?.value);
  return Date.UTC(year, month - 1, day, hour, minute, second) - utcDate.getTime();
}

export function localDateTimeToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timezone: string,
): Date {
  const targetMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0, 0);
  let guessMs = targetMs;
  for (let i = 0; i < 3; i += 1) {
    const offset = localDateTimeOffsetMs(new Date(guessMs), timezone);
    guessMs = targetMs - offset;
  }
  return new Date(guessMs);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The UTC instants that bound one local calendar day, end exclusive.
 *
 * A bare `YYYY-MM-DD` names that local day. Anything else is read as an instant and resolves to
 * the local day it falls on. Returns null for a value that is not a date.
 */
export function localDayBoundsUtc(
  value: string | Date,
  timezone: string,
): { start: Date; end: Date } | null {
  let local: LocalDate;
  const dateOnly = typeof value === "string" ? DATE_ONLY.exec(value.trim()) : null;
  if (dateOnly) {
    local = { year: Number(dateOnly[1]), month: Number(dateOnly[2]), day: Number(dateOnly[3]) };
    // Date.UTC rolls an impossible date over (Feb 30 becomes Mar 2); refuse it instead.
    const check = new Date(Date.UTC(local.year, local.month - 1, local.day));
    if (check.getUTCMonth() !== local.month - 1 || check.getUTCDate() !== local.day) return null;
  } else {
    const instant = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(instant.getTime())) return null;
    local = localDatePartsInTimezone(instant, timezone);
  }
  return {
    start: localDateTimeToUtc({ ...local, hour: 0, minute: 0 }, timezone),
    // Midnight of the next local day, so a day with a clock change is still exactly one day.
    end: localDateTimeToUtc({ ...local, day: local.day + 1, hour: 0, minute: 0 }, timezone),
  };
}
