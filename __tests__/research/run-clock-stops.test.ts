import { describe, it, expect } from 'vitest';
import { readCode } from '../helpers/read-source';

// ── A FINISHED RUN THAT KEPT COUNTING ───────────────────────────────────────────────────────────
//
// Measured 2026-09-03. The run started 03:58:07Z and finished 06:41:23Z — 163 minutes. At 12:12 the
// screen read:
//
//     8:14:36 / 25:00     ELAPSED
//
// Three numbers on one line, not one of them true: 8h14m is start-to-NOW on a run that had been
// over for five and a half hours, 25:00 was the limit it had already blown through, and the run
// itself took 163 minutes.
//
// `run-state.ts` computed `now - startedMs` unconditionally. Its own comment shows the START was
// corrected once — the clock used to begin at component mount — and the END was never considered.
// `run-console.ts:114` already had it right: `run.finished_at ? Date.parse(...) : now`. Two
// implementations of "how long did this take" and only one of them stopped.
//
// And the API had been SELECTING `finished_at` since that query was written, without returning it —
// so the client could not have stopped the clock even had it tried.

describe('the elapsed clock stops when the run does', () => {
  const state = readCode('lib/research/run-state.ts');

  it('reads a finish time', () => {
    expect(state).toContain('poll?.finishedAt');
  });

  it('measures to the finish, not to now', () => {
    expect(state).toContain('const endMs = Number.isFinite(finishedMs) ? finishedMs : now');
    expect(state).toContain('Math.max(0, endMs - startedMs)');
  });

  it('THE DEFECT: the unconditional now-minus-start is gone', () => {
    expect(state, 'a finished run will count forever again')
      .not.toMatch(/Math\.max\(0,\s*now\s*-\s*startedMs\)/);
  });

  it('CONTROL: a RUNNING run still counts to now', () => {
    // Without the fallback, a run in flight would show a frozen clock — the opposite bug.
    expect(state).toMatch(/finishedMs\) \? finishedMs : now/);
  });

  it('and the API actually returns the field', () => {
    // It was selected and dropped, so the client had nothing to stop on.
    const route = readCode('app/api/admin/research/[projectId]/pipeline/route.ts');
    expect(route).toContain('finishedAt: (run.finished_at as string) ?? null');
  });

  it('the two implementations now agree', () => {
    // run-console.ts had it right all along. Two definitions of one measurement is how a screen
    // comes to disagree with itself.
    const console_ = readCode('lib/research/run-console.ts');
    expect(console_).toContain('run.finished_at ? Date.parse(run.finished_at) : now');
  });
});
