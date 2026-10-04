/**
 * Object-key construction and parsing for the media bucket.
 *
 * Every key this module builds is made only of sanitized components, so a caller-supplied
 * value can never escape the prefix it was meant to live under. `buildPetPhotoKey` is the
 * single place the layout is defined — the per-tenant segment is added here.
 */

/** Characters allowed in a single path segment. Notably excludes "/" and ".." sequences. */
const SEGMENT_ALLOWED = /[^a-zA-Z0-9._-]/g;
const MAX_SEGMENT_LENGTH = 80;

export const PET_PHOTO_PREFIX = "pets";
export const DAYCARE_PREFIX = "daycares";

/**
 * Reduces an arbitrary caller-supplied string to one safe path segment.
 * Returns null when nothing usable survives, so callers must decide on a fallback.
 */
export function sanitizeSegment(value: string): string | null {
  // Any "/" becomes "_", so the result is always exactly one path segment. Dots are kept
  // because filenames need them; what must never survive is a segment that IS "." or "..".
  const collapsed = value.trim().replace(SEGMENT_ALLOWED, "_");
  const trimmed = collapsed.replace(/^\.+/, "").slice(0, MAX_SEGMENT_LENGTH);
  if (trimmed.length === 0 || trimmed === "." || trimmed === "..") return null;
  return trimmed;
}

/**
 * Layout: daycares/{daycareId}/pets/{pet}_{owner}/{timestamp}-{file}
 *
 * The tenant segment comes first so one daycare's media is a single prefix: two daycares with
 * a pet of the same name owned by the same surname no longer share a folder, and a prefix
 * listing can never span tenants.
 *
 * Keys written before tenancy have no `daycares/` segment. They are still valid and still
 * resolve — `resolveObjectKey` does not require the prefix, and deletion is authorized against
 * the database rather than the key shape.
 */
export function buildPetPhotoKey(input: {
  daycareId: string;
  petName: string;
  ownerName: string;
  fileName: string;
  timestamp?: number;
}): string {
  const tenant = sanitizeSegment(input.daycareId);
  if (!tenant) throw new Error("daycareId inválido para construir la clave de almacenamiento");
  const pet = sanitizeSegment(input.petName) ?? "mascota";
  const owner = sanitizeSegment(input.ownerName) ?? "tutor";
  const file = sanitizeSegment(input.fileName) ?? "archivo";
  const timestamp = input.timestamp ?? Date.now();
  return `${DAYCARE_PREFIX}/${tenant}/${PET_PHOTO_PREFIX}/${pet}_${owner}/${timestamp}-${file}`;
}

/** The prefix that contains everything belonging to one daycare. */
export function daycarePrefix(daycareId: string): string {
  const tenant = sanitizeSegment(daycareId);
  if (!tenant) throw new Error("daycareId inválido");
  return `${DAYCARE_PREFIX}/${tenant}/`;
}

/** The daycare segment a key is filed under, or null for a key written before tenancy. */
export function tenantOfKey(key: string): string | null {
  const match = /^daycares\/([^/]+)\//.exec(key);
  return match ? match[1] : null;
}

/** Whether a canonical key sits under this daycare's own prefix. */
export function isOwnKey(key: string, daycareId: string): boolean {
  return key.startsWith(daycarePrefix(daycareId));
}

const TENANT_PREFIX_ANYWHERE = /(?:^|\/)daycares\/([^/?#]+)\//g;

/**
 * Whether a stored reference (a key or a URL on any host) names another daycare's prefix.
 *
 * Deletion is authorized by a row of the caller's tenant referencing the key, so a reference a
 * tenant writes must never point into someone else's prefix. The host is deliberately ignored:
 * the reference check matches on the key alone, wherever the URL claims to live.
 */
export function namesForeignPrefix(value: string, daycareId: string): boolean {
  const own = sanitizeSegment(daycareId);
  const candidates = [value];
  try {
    candidates.push(decodeURIComponent(value));
  } catch {
    // Not valid percent-encoding: the raw value is all there is to inspect.
  }
  return candidates.some((candidate) =>
    [...candidate.matchAll(TENANT_PREFIX_ANYWHERE)].some((match) => match[1] !== own),
  );
}

/**
 * Accepts either a raw object key or a full public URL and returns the canonical key.
 * Returns null for anything that does not resolve to a plausible in-bucket key, so the
 * caller can refuse instead of passing an attacker-chosen string to the storage API.
 *
 * When given a URL, its host must belong to this bucket. Note that the URL parser silently
 * normalizes "/../../x" to "/x", so host checking — not traversal checking — is what makes
 * a foreign URL unusable here.
 */
export function resolveObjectKey(
  input: string,
  bucketName: string,
  endpoint?: string,
): string | null {
  let candidate = input.trim();

  if (/^https?:\/\//i.test(candidate)) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      return null;
    }

    // Without a configured endpoint we cannot tell our own bucket from anyone else's.
    if (!endpoint) return null;
    const host = url.host.toLowerCase();
    const bareEndpoint = endpoint
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    const allowedHosts = [
      bareEndpoint,
      bucketName ? `${bucketName.toLowerCase()}.${bareEndpoint}` : "",
    ];
    if (!allowedHosts.includes(host)) return null;

    const pathName = url.pathname;
    candidate = pathName.startsWith("/") ? pathName.slice(1) : pathName;
    // Path-style URLs put the bucket in the path; virtual-host style does not.
    if (bucketName && candidate.startsWith(`${bucketName}/`)) {
      candidate = candidate.slice(bucketName.length + 1);
    }
    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      return null;
    }
  }

  candidate = candidate.replace(/^\/+/, "");
  if (candidate.length === 0) return null;
  // Reject traversal, absolute paths, protocol-ish values and empty segments.
  if (candidate.includes("..") || candidate.includes("//") || candidate.includes("\\")) return null;
  if (candidate.split("/").some((segment) => segment.length === 0)) return null;
  return candidate;
}
