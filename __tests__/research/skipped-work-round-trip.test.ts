// __tests__/research/skipped-work-round-trip.test.ts
//
// ── "unnamed work" ──────────────────────────────────────────────────────────────────────────────
//
// The worker records what a run did NOT do and why. `run-budget.ts` builds it, `run-store.ts`
// persists it to `research_runs.skipped_work`, an API returns it, and two places render it. Every
// link in that chain worked. The whole thing still produced nothing usable, because:
//
//     the worker writes  { step, reason, at }
//     the app read       s.what ?? 'unnamed work'
//
// Nothing has ever written `what`. So every skipped item rendered as **"unnamed work"** — next to a
// perfectly real reason like "the run reached its spending limit ($2.00)". That pairing is what
// made it survive: a blank would have looked broken, but a placeholder beside a real sentence looks
// like a feature that works and simply has nothing interesting to say.
//
// ── WHY NEITHER SIDE'S TESTS COULD SEE IT ───────────────────────────────────────────────────────
//
// `run-budget.test.ts` asserts the worker records `step`. The app's tests asserted the console
// renders whatever it was handed. Both were right. The defect lived exactly in the gap between
// them, and `RunFinishInput.skippedWork` was typed `unknown[]` — which accepts any shape by
// definition — so the compiler had nothing to object to either.
//
// This file is that gap: it takes the shape the WORKER actually produces and runs it through the
// APP's reader. It is deliberately not a source-text assertion, because the mismatch was invisible
// in every individual file and only exists between them.

import { describe, it, expect } from 'vitest';
import { buildConsole, type RunRow } from '../../lib/research/run-console';

/**
 * Exactly what `recordSkipped` pushes — `{ step, reason, at }`. Copied from
 * `worker/src/infra/run-budget.ts`, and the point of this file is that it stays copied: if the
 * worker's shape changes, this fixture is what should go red.
 */
const WORKER_SHAPE = [
  { step: 'adjoiner research', reason: 'the run reached its spending limit ($2.00)', at: '2026-08-30T12:00:00Z' },
  { step: 'ROW integration', reason: 'the run reached its 30-minute time limit', at: '2026-08-30T12:01:00Z' },
];

function runRow(skipped: unknown): RunRow {
  return {
    id: 'r1',
    status: 'complete',
    phase: 'done',
    message: null,
    started_at: '2026-08-30T11:30:00Z',
    heartbeat_at: '2026-08-30T12:02:00Z',
    finished_at: '2026-08-30T12:02:00Z',
    cost_usd: 2,
    paid_pages: 1,
    limits: { maxMinutes: 30, maxUsd: 2 },
    skipped_work: skipped as RunRow['skipped_work'],
    budget_summary: 'Finished early because the run reached its spending limit ($2.00).',
    failure_reason: null,
  };
}

const NOW = Date.parse('2026-08-30T12:05:00Z');

describe('what the worker writes is what the console reads', () => {
  const console_ = buildConsole(runRow(WORKER_SHAPE), [], NOW);

  it('names the skipped steps', () => {
    expect(console_.skipped.map((s) => s.what)).toEqual(['adjoiner research', 'ROW integration']);
  });

  it('never says "unnamed work" for work that has a name', () => {
    // The single assertion that would have caught the original bug. It is worth its own test rather
    // than being folded into the one above, because this is the SYMPTOM an operator saw and the
    // thing anyone re-reading this file needs to recognise.
    for (const s of console_.skipped) {
      expect(s.what, 'the worker gave this a name — the reader dropped it').not.toBe('unnamed work');
    }
  });

  it('keeps the reason, which was never the broken half', () => {
    expect(console_.skipped[0].reason).toBe('the run reached its spending limit ($2.00)');
  });
});

describe('the reader stays honest about genuinely missing names', () => {
  it('falls back to "unnamed work" only when there really is no name', () => {
    // Fixing the mismatch must not turn the fallback into a lie in the other direction. A row with
    // no name at all is still possible — an older row, or a future producer — and calling it
    // "unnamed work" is correct THERE.
    const c = buildConsole(runRow([{ reason: 'no idea' }]), [], NOW);
    expect(c.skipped[0].what).toBe('unnamed work');
  });

  it('still reads a legacy `what` row', () => {
    // No production row is known to carry `what` — nothing ever wrote it — but tolerating it costs
    // one `??` and removing it would be a guess about data this session cannot see.
    const c = buildConsole(runRow([{ what: 'legacy step', reason: 'r' }]), [], NOW);
    expect(c.skipped[0].what).toBe('legacy step');
  });

  it('prefers the worker key when a row somehow carries both', () => {
    const c = buildConsole(runRow([{ step: 'real', what: 'stale', reason: 'r' }]), [], NOW);
    expect(c.skipped[0].what).toBe('real');
  });

  it('survives a null skipped_work without throwing', () => {
    expect(buildConsole(runRow(null), [], NOW).skipped).toEqual([]);
  });
});

describe('the report card reads the same field', () => {
  it('does not carry its own copy of the wrong key', async () => {
    // Two consumers read this column and both had the bug. Fixing one and not the other is the
    // likeliest way for half of it to come back.
    const fs = await import('node:fs');
    const src = fs.readFileSync('lib/research/report-card.ts', 'utf8');
    expect(src).toContain("s.step ?? s.what ?? 'unnamed work'");
  });
});
