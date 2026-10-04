import { prisma } from "../../db";

export const DEFAULT_TIMEZONE = "America/Guayaquil";
/** Ecuador's standard VAT. The rate new reservations and appointments use when unconfigured. */
export const DEFAULT_VAT_PERCENT = 15;

export interface UnitSettings {
  timezone: string;
  vatPercent: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { expiresAt: number; value: UnitSettings }>();

const keyFor = (daycareId: string, businessUnit: string) => `${daycareId}:${businessUnit}`;

/**
 * Settings for one business-unit slot of one daycare.
 *
 * Settings are per tenant: the unique key is (daycareId, businessUnit), so this needs both.
 * Missing values fall back to defaults rather than throwing — an unconfigured unit must not stop
 * reservation generation or pricing.
 *
 * Memoised briefly because this sits on the write path of every reservation and appointment, and
 * on every occurrence the scheduler evaluates. `invalidateUnitSettings` is called when the
 * settings screen writes.
 */
export async function getUnitSettings(
  daycareId: string,
  businessUnit: string,
): Promise<UnitSettings> {
  const key = keyFor(daycareId, businessUnit);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const setting = await prisma.businessUnitSetting.findUnique({
    where: { daycareId_businessUnit: { daycareId, businessUnit } },
    select: { timezone: true, vatPercent: true },
  });

  const value: UnitSettings = {
    timezone: setting?.timezone || DEFAULT_TIMEZONE,
    vatPercent: setting?.vatPercent ?? DEFAULT_VAT_PERCENT,
  };
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function getUnitTimezone(daycareId: string, businessUnit: string): Promise<string> {
  return (await getUnitSettings(daycareId, businessUnit)).timezone;
}

/** The unit's default VAT, used when a request does not state one explicitly. */
export async function getUnitVatPercent(daycareId: string, businessUnit: string): Promise<number> {
  return (await getUnitSettings(daycareId, businessUnit)).vatPercent;
}

export function invalidateUnitSettings(daycareId: string, businessUnit?: string): void {
  if (businessUnit) {
    cache.delete(keyFor(daycareId, businessUnit));
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${daycareId}:`)) cache.delete(key);
  }
}
