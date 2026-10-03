import assert from "node:assert/strict";

import { DEFAULT_LIMIT, MAX_PAGE_SIZE, readPage, sendPage } from "../src/utils/pagination";

/**
 * The pagination contract. No database, so it runs in the architecture suite.
 *
 * The property that matters most is the first one: a request that does NOT ask for a page must
 * still get a bare array. Three forms fill a `<select>` from these endpoints, and an envelope
 * (or a 50-row page) would leave the client you need silently missing from the picker.
 */

const req = (query: Record<string, unknown>) => ({ query } as any);

// No pagination asked for: bounded, but shaped as it always was.
{
  const page = readPage(req({}));
  assert.equal(page.paginated, false, "An unasked request must not be marked paginated");
  assert.equal(page.skip, 0);
  assert.equal(page.take, DEFAULT_LIMIT, "The default read must still be capped");
}

// page/pageSize.
{
  const page = readPage(req({ page: "3", pageSize: "20" }));
  assert.equal(page.paginated, true);
  assert.equal(page.skip, 40, "Page 3 of 20 starts at 40");
  assert.equal(page.take, 20);
}

// The cap cannot be argued out of: this is what made `?limit=999999` read a whole table.
{
  const page = readPage(req({ pageSize: "999999" }));
  assert.equal(page.take, MAX_PAGE_SIZE, "pageSize must be clamped");
}

// Junk must not become a negative skip or a NaN take, either of which Prisma would reject
// (or, worse, interpret).
for (const bad of ["0", "-5", "abc", "", "1e9999", "NaN"]) {
  const page = readPage(req({ page: bad, pageSize: bad }));
  assert.ok(Number.isInteger(page.skip) && page.skip >= 0, `skip must stay a non-negative integer for ${JSON.stringify(bad)}`);
  assert.ok(Number.isInteger(page.take) && page.take >= 1, `take must stay a positive integer for ${JSON.stringify(bad)}`);
  assert.ok(page.take <= MAX_PAGE_SIZE, `take must stay capped for ${JSON.stringify(bad)}`);
}

// The legacy skip/take/offset/limit names that check-in-out already shipped with.
{
  const page = readPage(req({ offset: "10", limit: "5" }));
  assert.equal(page.paginated, true);
  assert.equal(page.skip, 10);
  assert.equal(page.take, 5);
}

// An explicit skip wins over a page number: they address the same thing.
{
  const page = readPage(req({ page: "5", skip: "7", pageSize: "10" }));
  assert.equal(page.skip, 7, "An explicit skip must win over a computed one");
}

// Response shapes.
{
  const headers: Record<string, string> = {};
  let body: unknown;
  const res = {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    json(payload: unknown) {
      body = payload;
    },
  } as any;

  // Unpaginated: a bare array, plus the true total so truncation is detectable.
  sendPage(res, readPage(req({})), [{ id: "a" }], 873);
  assert.ok(Array.isArray(body), "An unpaginated response must stay a bare array");
  assert.equal(headers["X-Total-Count"], "873", "The true total must always be stated");

  // Paginated: the envelope, with a pageCount the client does not have to compute.
  sendPage(res, readPage(req({ page: "2", pageSize: "10" })), [{ id: "a" }], 95);
  const envelope = body as unknown as { items: unknown[]; total: number; page: number; pageSize: number; pageCount: number };
  assert.equal(envelope.total, 95);
  assert.equal(envelope.page, 2);
  assert.equal(envelope.pageSize, 10);
  assert.equal(envelope.pageCount, 10, "95 rows at 10 per page is 10 pages");

  // An empty result is one page, not zero: a pager rendering "page 1 of 0" is nonsense.
  sendPage(res, readPage(req({ page: "1", pageSize: "10" })), [], 0);
  assert.equal((body as unknown as { pageCount: number }).pageCount, 1);
}

console.log("✓ pagination contract (bare-array default, hard cap, stable envelope)");
