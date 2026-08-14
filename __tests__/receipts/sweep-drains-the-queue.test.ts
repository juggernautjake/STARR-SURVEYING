// __tests__/receipts/sweep-drains-the-queue.test.ts
//
// Owner, 2026-08-13: *"it should work through all queued receipts until it has analyzed all of
// them."*
//
// ── WHAT WAS WRONG ───────────────────────────────────────────────────────────────────────────────
//
// `sweepQueuedReceipts` fetched ONE page of `batchSize` rows, extracted those, and returned. Paired
// with an hourly cron that made the drain rate 25 receipts per hour: photograph a shoebox of sixty
// and the last of them is read the following morning. The queue emptied eventually, which is exactly
// why nobody noticed it was not emptying now.
//
// ── WHY THE CLAIM IS MADE TO FAIL HERE ──────────────────────────────────────────────────────────
//
// These tests are about the LOOP — does it page, does it stop — and not about extraction. So the
// claim is mocked to lose every race, which means `runExtraction` is never reached and no Anthropic
// client, photo download or write-back is needed. What is left is precisely the control flow that
// was wrong, tested without a scaffold big enough to be wrong itself.
//
// The three risks a drain loop has, one test each: it must page past the first batch, it must stop
// when there is nothing new, and it must respect its budget rather than run until the platform kills
// it mid-extraction.

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeRow { id: string; user_id: string; photo_url: string }

/** Rows the fake database will hand back, and a record of how it was asked. */
const state = {
  pages: [] as FakeRow[][],
  selectCalls: 0,
  /** Set true to make every claim succeed instead of losing. */
  claimWins: false,
};

/**
 * A thenable query builder.
 *
 * The code under test ends its chains in four different places — `.limit()`, `.is()`,
 * `.maybeSingle()` and `.select('id')` — so rather than guess which, every builder resolves to the
 * given result when awaited. That is also what the real client does.
 *
 * The two SELECTs are deliberately NOT the same. The sweep's list query ends at `.limit()` and is
 * what consumes a page; `claimRow`'s own read of one row ends at `.maybeSingle()`. The first draft
 * of this mock served pages to both, so every claim ate a page and the page accounting the tests
 * assert on was measuring the mock rather than the loop.
 */
function builder(result: unknown, onLimit?: () => unknown): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'or', 'not', 'is', 'eq', 'order', 'update', 'insert']) {
    b[m] = () => builder(result, onLimit);
  }
  b.limit = () => builder(onLimit ? onLimit() : result, onLimit);
  // The claim's read. A queued row with no start time is the ordinary case; whether the claim then
  // succeeds is decided by the UPDATE, which is where these tests want the control.
  b.maybeSingle = () =>
    Promise.resolve({ data: { extraction_status: 'queued', extraction_started_at: null }, error: null });
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return b;
}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () =>
        builder({ data: [], error: null, count: 0 }, () => {
          state.selectCalls += 1;
          const page = state.pages.shift() ?? [];
          return { data: page, error: null, count: page.length };
        }),
      // The claim's compare-and-set. `[]` means "somebody else got there first", which is the
      // ordinary outcome this loop must survive without spinning.
      update: () => builder({ data: state.claimWins ? [{ id: 'x' }] : [], error: null }),
    }),
  },
}));

const { sweepQueuedReceipts } = await import('@/lib/receipts/extract');

const page = (n: number, prefix: string): FakeRow[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`, user_id: 'u1', photo_url: `u1/${prefix}-${i}.jpg`,
  }));

beforeEach(() => {
  state.pages = [];
  state.selectCalls = 0;
  state.claimWins = false;
});

describe('the sweep drains rather than taking one page', () => {
  it('keeps fetching while pages keep coming back', async () => {
    // Three full pages then an empty one. The old implementation stopped after the first.
    state.pages = [page(2, 'a'), page(2, 'b'), page(2, 'c'), []];

    await sweepQueuedReceipts(2, { budgetMs: 120_000 });

    expect(
      state.selectCalls,
      'one SELECT per page plus the one that finds the queue empty',
    ).toBeGreaterThanOrEqual(4);
    expect(state.pages, 'every page was consumed').toEqual([]);
  });

  it('stops when a page brings nothing new, rather than reading it forever', async () => {
    // The failure a naive `while (rows.length)` has: a row another process is extracting stays in
    // the fetch result, so the same page comes back every time and the loop spins until the budget
    // expires — burning a whole cron run to do nothing.
    const stuck = page(2, 'same');
    state.pages = [stuck, stuck, stuck, stuck, stuck, stuck];

    await sweepQueuedReceipts(2, { budgetMs: 120_000 });

    // Second fetch returns rows already seen → `fresh` is empty → the loop ends. It must NOT have
    // worked through all six identical pages.
    expect(state.selectCalls).toBeLessThanOrEqual(3);
  });

  it('returns promptly on an empty queue', async () => {
    state.pages = [[]];
    const started = Date.now();
    const results = await sweepQueuedReceipts(25, { budgetMs: 120_000 });
    expect(results).toEqual([]);
    expect(Date.now() - started, 'an idle sweep must not sit on its budget').toBeLessThan(2_000);
  });

  it('starts nothing once the budget is spent', async () => {
    // A budget below the reserve means there is no room for even one extraction, so the loop must
    // decline to start — not begin a Vision call the platform will kill halfway through, leaving a
    // `running` row and a bill for nothing.
    state.pages = [page(5, 'a'), page(5, 'b')];
    await sweepQueuedReceipts(5, { budgetMs: 1 });
    expect(state.selectCalls).toBe(0);
  });
});
