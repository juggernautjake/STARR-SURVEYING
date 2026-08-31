// worker/src/__tests__/browser-lease-race.test.ts
//
// ── A CHROMIUM LEAKED EVERY TIME TWO LEASES STARTED TOGETHER ────────────────────────────────────
//
// `leaseBrowser` pooled one browser and reference-counted its holders, correctly. What it did not do
// was guard the LAUNCH:
//
//     if (!pool) pool = { browser: await acquireBrowser(), … };
//
// Two callers arriving while the pool is empty both see `null`, both launch, and the second
// assignment overwrites the first:
//
//     A: pool is null → await acquireBrowser…        (suspends)
//     B: pool is null → await acquireBrowser…        (suspends)
//     A: pool = {A}; current = A's pool; refs = 1
//     B: pool = {B}  ← overwrites A's
//     A: release() → refs 0, but `pool !== current`, so it returns early —
//        no idle timer is set and NOTHING ever closes A.
//
// A whole Chromium process, leaked, silently. Not a future problem: `capacity.ts` allows six
// concurrent pipelines today, so two runs starting together already hit it. It surfaced while
// scoping E5d (concurrent capture within one run), which turns an occasional interleaving into a
// routine one — wiring that up first would have made a live leak much worse.
//
// ── WHY THE EXISTING LEASE TESTS COULD NOT SEE IT ───────────────────────────────────────────────
//
// `browser-lease.test.ts` does `await leaseBrowser(); await leaseBrowser();` — the first fully
// resolves before the second begins, so the interleaving never happens. Every assertion in it is
// correct and none of them could fail on this bug. That is the whole reason this file starts the
// leases CONCURRENTLY instead: the defect lives in the overlap, so the test has to create one.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeLeasedBrowser, leaseBrowser, leasedBrowserState } from '../lib/browser-factory.js';

const STUB = { backend: 'stub' as const };

beforeEach(async () => { await closeLeasedBrowser(); });
afterEach(async () => { await closeLeasedBrowser(); });

describe('concurrent first leases share ONE browser', () => {
  it('two leases started together get the same browser', async () => {
    // `Promise.all`, not sequential awaits — both calls must be in flight before either assigns the
    // pool, which is precisely the window the bug lived in.
    const [a, b] = await Promise.all([leaseBrowser(STUB), leaseBrowser(STUB)]);
    expect(a.browser, 'two launches means one of them is unreachable and never closed').toBe(b.browser);
    expect(leasedBrowserState().refs).toBe(2);
    await a.release();
    await b.release();
  });

  it('five at once still produce one browser', async () => {
    const leases = await Promise.all([1, 2, 3, 4, 5].map(() => leaseBrowser(STUB)));
    const distinct = new Set(leases.map((l) => l.browser));
    expect(distinct.size, `${distinct.size} browsers launched for five leases`).toBe(1);
    expect(leasedBrowserState().refs).toBe(5);
    await Promise.all(leases.map((l) => l.release()));
  });

  it('the refcount matches the number of holders, so nothing closes early', () => {
    // The consequence of a lost pool is not only a leak: the surviving pool's refs are wrong, and a
    // browser closed under a live holder surfaces as "Target closed" a long way from its cause.
    expect(leasedBrowserState().refs).toBe(0);
  });

  it('releasing every concurrent holder returns the refcount to zero', async () => {
    const leases = await Promise.all([1, 2, 3].map(() => leaseBrowser(STUB)));
    expect(leasedBrowserState().refs).toBe(3);
    await Promise.all(leases.map((l) => l.release()));
    expect(leasedBrowserState().refs, 'an orphaned pool leaves refs stranded above zero').toBe(0);
  });
});

describe('a failed launch does not poison the pool for ever', () => {
  it('clears the in-flight slot so a later lease can try again', async () => {
    // The in-flight promise is shared. If a rejected one were left in place, every subsequent lease
    // would await it and re-throw the same error — one transient launch failure would take the
    // worker's browser out until it restarted. Worse than the leak it replaced.
    await expect(leaseBrowser({ backend: 'nonsense' as never })).rejects.toBeTruthy();
    const ok = await leaseBrowser(STUB);
    expect(ok.browser).toBeTruthy();
    await ok.release();
  });
});

describe('sequential behaviour is unchanged', () => {
  it('a second lease after the first still reuses the pool', async () => {
    // The fix must not cost the reuse the pool exists for.
    const a = await leaseBrowser(STUB);
    const b = await leaseBrowser(STUB);
    expect(a.browser).toBe(b.browser);
    await a.release();
    await b.release();
  });
});
