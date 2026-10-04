import assert from "node:assert/strict";

import { localDayBoundsUtc } from "../src/core/tenancy/local-time";

/**
 * A unit's calendar day. No database, so it runs in the architecture suite.
 *
 * The server runs in UTC and Ecuador is UTC-5: computing "the day" on the server's clock moved
 * every consultation after 19:00 onto the next day's agenda.
 */

const GUAYAQUIL = "America/Guayaquil";
const iso = (date: Date) => date.toISOString();

// A bare date names the local day, whatever the server's own timezone is.
{
  const day = localDayBoundsUtc("2026-10-04", GUAYAQUIL);
  assert.ok(day);
  assert.equal(iso(day.start), "2026-10-04T05:00:00.000Z");
  assert.equal(iso(day.end), "2026-10-05T05:00:00.000Z");

  // 23:30 local on the 4th is already the 5th in UTC, and still belongs to the 4th.
  const lateVisit = new Date("2026-10-05T04:30:00.000Z");
  assert.ok(lateVisit >= day.start && lateVisit < day.end, "An evening visit stays on its day");
  // 00:10 local on the 5th does not.
  assert.ok(new Date("2026-10-05T05:10:00.000Z") >= day.end, "The end bound is exclusive");
}

// An instant resolves to the local day it falls on.
{
  const day = localDayBoundsUtc("2026-10-05T02:00:00.000Z", GUAYAQUIL);
  assert.ok(day);
  assert.equal(iso(day.start), "2026-10-04T05:00:00.000Z", "02:00 UTC is still the 4th locally");
  assert.deepEqual(localDayBoundsUtc(new Date("2026-10-05T02:00:00.000Z"), GUAYAQUIL), day);
}

// Month and year roll over.
{
  const day = localDayBoundsUtc("2026-12-31", GUAYAQUIL);
  assert.ok(day);
  assert.equal(iso(day.end), "2027-01-01T05:00:00.000Z");
}

// A day with a clock change is 23 or 25 hours long, not 24.
{
  const spring = localDayBoundsUtc("2026-03-29", "Europe/Madrid");
  assert.ok(spring);
  assert.equal(spring.end.getTime() - spring.start.getTime(), 23 * 3_600_000);
  const autumn = localDayBoundsUtc("2026-10-25", "Europe/Madrid");
  assert.ok(autumn);
  assert.equal(autumn.end.getTime() - autumn.start.getTime(), 25 * 3_600_000);
}

// Not a date.
assert.equal(localDayBoundsUtc("mañana", GUAYAQUIL), null);
assert.equal(localDayBoundsUtc("2026-02-30", GUAYAQUIL), null, "An impossible date is refused");

console.log("✓ local day bounds in a unit's timezone");
