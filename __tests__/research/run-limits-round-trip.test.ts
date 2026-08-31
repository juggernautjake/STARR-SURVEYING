// __tests__/research/run-limits-round-trip.test.ts
//
// ── "no time limit is configured for this run" — ON EVERY RUN ───────────────────────────────────
//
// The run console showed that sentence for every run it has ever displayed, while the limit was
// configured AND being enforced: the worker winds a run down the moment it reaches its wall-clock
// ceiling, and says so in the budget summary two lines further down the same panel.
//
//     the worker persists  { maxWallClockMs, maxCostUsd, maxPaidPages }
//     the app read         run.limits?.maxMinutes   /   maxUsd
//
// Nothing has ever written `maxMinutes` or `maxUsd`. So `budgetMs` was permanently null, which made
// `fractionUsed` permanently null — any progress indicator showing budget used showed nothing — and
// sent the headline down its "no limit" branch every single time.
//
// ── THE SECOND TIME THIS EXACT DEFECT APPEARED IN ONE FILE ──────────────────────────────────────
//
// `worker/src/infra/run-store.ts` typed `skippedWork` as `unknown[]`, and every skipped step
// rendered as "unnamed work". Fixed on 2026-08-31. Four fields below it, `limits` was
// `Record<string, unknown>` — and `index.ts` wrote it through
// `budgetLimits as unknown as Record<string, unknown>`, a double cast that erases the type on
// purpose. `unknown` accepts any shape by definition, so the compiler had nothing to say either
// time.
//
// Both are typed now, so producer and consumer are bound by the compiler rather than by somebody
// remembering. This file tests the shape the WORKER actually writes through the APP's reader,
// because the defect existed only between them.

import { describe, it, expect } from 'vitest';
import { timeStatus, buildConsole, type RunRow } from '../../lib/research/run-console';

/** Exactly `DEFAULT_LIMITS` from worker/src/infra/run-budget.ts — 30 minutes, $2.00, 10 pages. */
const WORKER_LIMITS = { maxWallClockMs: 30 * 60_000, maxCostUsd: 2, maxPaidPages: 10 };

function runRow(limits: unknown, startedMinutesAgo = 10): RunRow {
  const now = Date.parse('2026-08-31T12:00:00Z');
  return {
    id: 'r1',
    status: 'running',
    phase: 'documents',
    message: null,
    started_at: new Date(now - startedMinutesAgo * 60_000).toISOString(),
    heartbeat_at: new Date(now - 5_000).toISOString(),
    finished_at: null,
    cost_usd: 0.5,
    paid_pages: 0,
    limits: limits as RunRow['limits'],
    skipped_work: null,
    budget_summary: null,
    failure_reason: null,
  };
}

const NOW = Date.parse('2026-08-31T12:00:00Z');

describe('the limit the worker wrote is the limit the console shows', () => {
  it('reports minutes used OUT OF the budget', () => {
    const t = timeStatus(runRow(WORKER_LIMITS), NOW);
    expect(t.headline).toBe('10 of 30 minutes used.');
  });

  it('never claims there is no limit when the worker set one', () => {
    // The single assertion that would have caught the original bug, phrased as the symptom an
    // operator actually saw.
    const t = timeStatus(runRow(WORKER_LIMITS), NOW);
    expect(t.headline).not.toContain('no time limit is configured');
  });

  it('computes the fraction used, so a progress indicator has something to show', () => {
    // Permanently null before: not "wrong", just absent, which is why nobody noticed.
    expect(timeStatus(runRow(WORKER_LIMITS), NOW).fractionUsed).toBeCloseTo(10 / 30, 5);
  });

  it('caps the fraction at 1 when a run overruns', () => {
    expect(timeStatus(runRow(WORKER_LIMITS, 45), NOW).fractionUsed).toBe(1);
  });

  it('carries through buildConsole, not only timeStatus', () => {
    // timeStatus is where the arithmetic lives; buildConsole is what the panel calls.
    const c = buildConsole(runRow(WORKER_LIMITS), [], NOW);
    expect(c.time.budgetMs).toBe(30 * 60_000);
  });
});

describe('it stays honest when there really is no limit', () => {
  it('says so for a null limits column', () => {
    // Fixing the mismatch must not turn the fallback into a lie in the other direction. A run
    // recorded before budgets existed genuinely has none.
    expect(timeStatus(runRow(null), NOW).headline).toContain('no time limit is configured');
  });

  it('says so for an empty limits object', () => {
    expect(timeStatus(runRow({}), NOW).headline).toContain('no time limit is configured');
  });

  it('treats a zero ceiling as no ceiling rather than dividing by it', () => {
    // `elapsed / 0` is Infinity, and `Math.min(Infinity, 1)` is 1 — a run would report 100% of a
    // budget that does not exist.
    const t = timeStatus(runRow({ maxWallClockMs: 0 }), NOW);
    expect(t.budgetMs).toBeNull();
    expect(t.fractionUsed).toBeNull();
  });

  it('still reads a legacy maxMinutes row', () => {
    // No row is known to carry it — nothing ever wrote it — but tolerating it costs one `??` and
    // removing it would be a guess about data this session cannot see.
    expect(timeStatus(runRow({ maxMinutes: 30 }), NOW).headline).toBe('10 of 30 minutes used.');
  });

  it('prefers the worker key when a row somehow carries both', () => {
    const t = timeStatus(runRow({ maxWallClockMs: 30 * 60_000, maxMinutes: 5 }), NOW);
    expect(t.headline).toBe('10 of 30 minutes used.');
  });
});

describe('a stalled run still says the more urgent thing', () => {
  it('reports the stall rather than the budget', () => {
    // The headline is a priority list, and "nothing has been heard from this run" outranks "10 of
    // 30 minutes used". Fixing the budget branch must not outrank the stall branch.
    const row = runRow(WORKER_LIMITS);
    row.heartbeat_at = new Date(NOW - 20 * 60_000).toISOString();
    expect(timeStatus(row, NOW).headline).toContain('Nothing has been heard');
  });
});
