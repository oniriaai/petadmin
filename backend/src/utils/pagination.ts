import type { Request, Response } from "express";

/**
 * Pagination for list endpoints.
 *
 * Two kinds of caller share these routes and they want different things:
 *
 *   - a ledger screen asks for page 3 of the income list and needs a total to render a pager;
 *   - a form asks for every client to fill a `<select>` (CheckInOutForm, NuevaReservaModal,
 *     RecurringPlanForm all do this today).
 *
 * Paginating both by default would silently truncate the pickers, which is a worse failure
 * than a slow query: the client you need simply is not in the list and nothing says so. So
 * pagination is opt-in — a request that asks for a page gets an envelope with the total, and a
 * request that does not keeps the bare array it has always received.
 *
 * What is NOT optional is the cap. Every one of these queries used to read a whole table for
 * the tenant, so one customer's accumulated history could decide the latency of everyone
 * else's requests. `X-Total-Count` goes out either way, so a caller can always tell that what
 * it received is not everything.
 */

/** The most rows any single response may carry, paginated or not. */
export const MAX_PAGE_SIZE = 200;
/** What an unpaginated caller gets: generous enough for the pickers, bounded all the same. */
export const DEFAULT_LIMIT = 500;

export interface PageRequest {
  /** True when the caller explicitly asked for a page, and so expects an envelope. */
  paginated: boolean;
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

function toPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

/**
 * Reads pagination intent from the query string.
 *
 * `page`/`pageSize` are the documented names. `skip`/`take`/`offset`/`limit` are accepted
 * because `check-in-out` already shipped with them and callers exist.
 */
export function readPage(req: Request): PageRequest {
  const q = req.query as Record<string, unknown>;
  const asked =
    q.page !== undefined ||
    q.pageSize !== undefined ||
    q.skip !== undefined ||
    q.take !== undefined ||
    q.offset !== undefined ||
    q.limit !== undefined;

  if (!asked) {
    return { paginated: false, page: 1, pageSize: DEFAULT_LIMIT, skip: 0, take: DEFAULT_LIMIT };
  }

  const rawSize = q.pageSize ?? q.take ?? q.limit;
  const pageSize = Math.min(toPositiveInt(rawSize, 50), MAX_PAGE_SIZE);

  // An explicit skip/offset wins over a page number: they address the same thing, and the
  // caller that sent the lower-level one meant it.
  const explicitSkip = q.skip ?? q.offset;
  const page = toPositiveInt(q.page, 1);
  const skip =
    explicitSkip !== undefined
      ? Math.max(toPositiveInt(explicitSkip, 0), 0)
      : (page - 1) * pageSize;

  return { paginated: true, page, pageSize, skip, take: pageSize };
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  /** Present so a client can render a pager without recomputing it from total/pageSize. */
  pageCount: number;
}

/**
 * Sends a list response in whichever shape the caller asked for, and always states the true
 * total in `X-Total-Count` so a truncated bare array is detectable.
 */
export function sendPage<T>(res: Response, req: PageRequest, items: T[], total: number): void {
  res.setHeader("X-Total-Count", String(total));
  if (!req.paginated) {
    res.json(items);
    return;
  }
  res.json({
    items,
    total,
    page: req.page,
    pageSize: req.pageSize,
    pageCount: Math.max(Math.ceil(total / req.pageSize), 1),
  } satisfies Page<T>);
}
