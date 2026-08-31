// worker/src/__tests__/bounded-map.test.ts
//
// The helper behind E5d. What matters here is not that it is faster — it is that it is BOUNDED, in
// order, and does not turn one failed document into zero documents.
//
// `capacity.ts` caps concurrent runs because "these are small government servers, and the fastest
// way to lose access to a county portal is to look like a load test". A run that gets the firm
// banned from Bell County is not a faster run, so the ceiling is enforced in code rather than
// merely defaulted.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  configuredConcurrency,
  mapBounded,
} from '../infra/bounded-map.js';

/** Records the high-water mark of simultaneous calls. */
function tracker() {
  let live = 0;
  let peak = 0;
  return {
    peak: () => peak,
    async run<T>(work: () => Promise<T>): Promise<T> {
      live++;
      peak = Math.max(peak, live);
      try { return await work(); } finally { live--; }
    },
  };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('it is bounded', () => {
  it('never runs more than the limit at once', async () => {
    const t = tracker();
    await mapBounded(Array.from({ length: 20 }, (_, i) => i), (n) => t.run(async () => { await tick(1); return n; }), 3);
    expect(t.peak(), 'more than three county requests were in flight').toBeLessThanOrEqual(3);
  });

  it('actually uses the width it is given — it is not secretly sequential', async () => {
    // The opposite failure: a "concurrent" helper that awaits each item would pass every ordering
    // and error test above while delivering none of the speed-up it exists for.
    const t = tracker();
    await mapBounded([1, 2, 3, 4, 5, 6], () => t.run(() => tick(5)), 3);
    expect(t.peak()).toBe(3);
  });

  it('clamps a reckless limit to the politeness ceiling', async () => {
    const t = tracker();
    await mapBounded(Array.from({ length: 30 }, (_, i) => i), () => t.run(() => tick(1)), 50);
    expect(t.peak(), 'a config mistake must cost latency, not access').toBeLessThanOrEqual(MAX_CONCURRENCY);
  });

  it('treats 0 and negatives as one at a time rather than as none', async () => {
    // `Array.from({length: 0}, worker)` would start no workers at all and resolve instantly with an
    // array of holes — every document silently uncaptured, and nothing thrown.
    for (const bad of [0, -5, NaN]) {
      const out = await mapBounded([1, 2, 3], async (n) => n * 2, bad);
      expect(out.map((r) => (r.ok ? r.value : null)), `limit ${bad} dropped items`).toEqual([2, 4, 6]);
    }
  });

  it('does not start more workers than there are items', async () => {
    const t = tracker();
    await mapBounded([1], () => t.run(() => tick(1)), 4);
    expect(t.peak()).toBe(1);
  });
});

describe('order is the input order, not the completion order', () => {
  it('returns results in input order even when later items finish first', async () => {
    // The callers push these into a list a surveyor reads; "plats before deeds" is meaningful.
    // Completion order would reshuffle a report by whichever county page answered fastest.
    const out = await mapBounded([30, 20, 10], async (ms) => { await tick(ms); return ms; }, 3);
    expect(out.map((r) => (r.ok ? r.value : null))).toEqual([30, 20, 10]);
  });

  it('passes the index through', async () => {
    const out = await mapBounded(['a', 'b', 'c'], async (v, i) => `${i}:${v}`, 2);
    expect(out.map((r) => (r.ok ? r.value : null))).toEqual(['0:a', '1:b', '2:c']);
  });
});

describe('one failure is not a batch failure', () => {
  it('keeps going and reports per item', async () => {
    // The sequential loops this replaces each wrapped their capture in try/catch and carried on: a
    // document that cannot be captured is a gap in a report, not a reason to abandon the other ten.
    const out = await mapBounded([1, 2, 3, 4], async (n) => {
      if (n === 2) throw new Error('portal timed out');
      return n;
    }, 2);
    expect(out.map((r) => r.ok)).toEqual([true, false, true, true]);
    expect(out[1].ok === false && (out[1].error as Error).message).toBe('portal timed out');
  });

  it('a rejection does not abandon items that had not started yet', async () => {
    // `Promise.all` rejects on the first error and abandons the rest — swapping it in without this
    // turns a one-document problem into a no-documents problem.
    const seen: number[] = [];
    const out = await mapBounded([1, 2, 3, 4, 5, 6], async (n) => {
      if (n === 1) throw new Error('first one failed');
      seen.push(n);
      return n;
    }, 2);
    expect(seen.sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6]);
    expect(out).toHaveLength(6);
  });

  it('every item gets a result — no holes in the array', async () => {
    // A hole reads as `undefined` at the call site and crashes on `.ok`, a long way from here.
    const out = await mapBounded([1, 2, 3], async (n) => { if (n === 3) throw new Error('x'); return n; }, 2);
    expect(out.every((r) => r !== undefined)).toBe(true);
  });

  it('an empty list is fine and starts nothing', async () => {
    expect(await mapBounded([], async () => 1, 3)).toEqual([]);
  });
});

describe('the configured limit', () => {
  it('defaults when unset', () => {
    expect(configuredConcurrency({})).toBe(DEFAULT_CONCURRENCY);
  });

  it('defaults on nonsense rather than producing NaN', () => {
    // `NaN` would flow into `Math.min(width, items.length)` and start zero workers — every document
    // silently uncaptured, with nothing thrown and nothing logged.
    for (const bad of ['', 'lots', '0', '-2']) {
      expect(configuredConcurrency({ RESEARCH_CAPTURE_CONCURRENCY: bad }), bad).toBe(DEFAULT_CONCURRENCY);
    }
  });

  it('accepts a sane value', () => {
    expect(configuredConcurrency({ RESEARCH_CAPTURE_CONCURRENCY: '2' })).toBe(2);
  });

  it('cannot be raised past the ceiling by an env var', () => {
    // The whole reason the ceiling is in code: `RESEARCH_CAPTURE_CONCURRENCY=50` is a plausible typo
    // whose consequence — losing a county portal — never shows up in a test run.
    expect(configuredConcurrency({ RESEARCH_CAPTURE_CONCURRENCY: '50' })).toBe(MAX_CONCURRENCY);
  });
});
