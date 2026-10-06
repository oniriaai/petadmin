import { prisma } from "../../db";

/**
 * Live account status for an authenticated caller: is this user still active, and is its
 * daycare still active?
 *
 * Tokens are stateless and valid for 12h, so `isActive` checked only at login means
 * deactivating a user — or suspending a whole tenant — has no effect until their token
 * expires. Every authenticated request therefore re-reads the status here.
 *
 * Memoised in process with a short TTL for the same reason entitlements are
 * (`platform/module-access.ts`): this is on the hot path of every request. The console calls
 * `invalidatePrincipal` after writing, so a suspension is visible immediately in the instance
 * that made it, and within `CACHE_TTL_MS` everywhere else.
 */

const CACHE_TTL_MS = 15_000;

export interface PrincipalStatus {
  /** null for a superadmin, which belongs to no daycare. */
  daycareId: string | null;
  userActive: boolean;
  /** As stored: may still be a pre-rename value, so callers normalise it with `businessUnit`. */
  role: string;
  businessUnit: string;
  /** As stored. `effectivePermissions` turns it into what the caller actually holds. */
  permissions: string[];
  /** True when the user has no daycare: there is no tenant to be suspended. */
  daycareActive: boolean;
  /**
   * The daycare's subscription lapsed (a trial that ended, a renewal left unpaid). Unlike an
   * inactive daycare the session stays valid, so the admin can still reach the page to pay.
   */
  subscriptionSuspended: boolean;
}

interface CacheEntry {
  expiresAt: number;
  status: PrincipalStatus | null;
}

const cache = new Map<string, CacheEntry>();
/** De-duplicates concurrent misses so a burst of requests issues one query, not one each. */
const inFlight = new Map<string, Promise<PrincipalStatus | null>>();

async function loadPrincipalStatus(userId: string): Promise<PrincipalStatus | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      daycareId: true,
      role: true,
      businessUnit: true,
      permissions: true,
      daycare: { select: { isActive: true, subscription: { select: { status: true } } } },
    },
  });
  // A token naming a user that no longer exists is not a valid session.
  if (!user) return null;

  return {
    daycareId: user.daycareId,
    userActive: user.isActive,
    role: user.role,
    businessUnit: user.businessUnit,
    permissions: user.permissions,
    daycareActive: user.daycare ? user.daycare.isActive : true,
    subscriptionSuspended: user.daycare?.subscription?.status === "SUSPENDED",
  };
}

/**
 * The caller's current status, or null when the user no longer exists.
 *
 * A negative result is cached like a positive one: a token for a deleted user would otherwise
 * hit the database on every request until it expired.
 */
export async function getPrincipalStatus(userId: string): Promise<PrincipalStatus | null> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.status;

  const pending = inFlight.get(userId);
  if (pending) return pending;

  const load = loadPrincipalStatus(userId)
    .then((status) => {
      cache.set(userId, { status, expiresAt: Date.now() + CACHE_TTL_MS });
      return status;
    })
    .finally(() => {
      inFlight.delete(userId);
    });

  inFlight.set(userId, load);
  return load;
}

/** Drops one user's entry. Called when the console edits that user. */
export function invalidatePrincipal(userId: string): void {
  cache.delete(userId);
  inFlight.delete(userId);
}

/**
 * Drops every cached user of one daycare. Called when the console activates or suspends a
 * tenant, which changes the status of all its users at once without naming any of them.
 */
export function invalidatePrincipalsForDaycare(daycareId: string): void {
  for (const [userId, entry] of cache) {
    if (entry.status?.daycareId === daycareId) {
      cache.delete(userId);
      inFlight.delete(userId);
    }
  }
}

export function invalidateAllPrincipals(): void {
  cache.clear();
  inFlight.clear();
}
