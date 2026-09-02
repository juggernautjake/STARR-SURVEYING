// __tests__/research/run-state.test.ts — the three lies the screen told, as tests.
//
// Each describe block below is one line from the Research & Analysis screen captured on
// 2026-09-01, where four components described the same run as running, finished, and failed at
// once. The tests assert the rule that makes that line impossible, not the line itself.

import { describe, it, expect } from 'vitest';
import {
  lifecycleOf,
  isActive,
  isStopped,
  isPayloadForRun,
  resolvePercent,
  resolveOutcome,
  buildRunState,
  formatElapsed,
} from '@/lib/research/run-state';

describe('lifecycleOf', () => {
  it('maps every status the worker and the app can produce', () => {
    expect(lifecycleOf('running')).toBe('active');
    expect(lifecycleOf('starting')).toBe('active');
    expect(lifecycleOf('queued')).toBe('active');
    expect(lifecycleOf('retrying')).toBe('active');
    expect(lifecycleOf('complete')).toBe('succeeded');
    expect(lifecycleOf('success')).toBe('succeeded');
    expect(lifecycleOf('partial')).toBe('succeeded');
    expect(lifecycleOf('cancelled')).toBe('cancelled');
    expect(lifecycleOf('interrupted')).toBe('interrupted');
    expect(lifecycleOf('failed')).toBe('failed');
  });

  it('is case-insensitive, because two sources spell status differently', () => {
    expect(lifecycleOf('Running')).toBe('active');
    expect(lifecycleOf('COMPLETE')).toBe('succeeded');
  });

  it('treats an UNKNOWN status as active, never as failed', () => {
    // The direction matters. Treating a stopped run as active costs one more poll; treating an
    // active run as stopped is the bug that latches "Research Failed" over a working run.
    expect(lifecycleOf('some_future_status')).toBe('active');
    expect(isActive(lifecycleOf('some_future_status'))).toBe(true);
  });

  it('distinguishes never-started from stopped', () => {
    expect(lifecycleOf(null)).toBe('idle');
    expect(lifecycleOf(undefined)).toBe('idle');
    expect(isStopped('idle')).toBe(false);
    expect(isStopped('active')).toBe(false);
    expect(isStopped('failed')).toBe(true);
    expect(isStopped('cancelled')).toBe(true);
    expect(isStopped('interrupted')).toBe(true);
    expect(isStopped('succeeded')).toBe(true);
  });
});

// ── "Research Failed" over a run that went on to retrieve 17 documents ──────────────────────────

describe('isPayloadForRun — the stale-run guard', () => {
  it('REFUSES a terminal payload naming the previous run', () => {
    // This is the whole re-run bug in one assertion. Run 1 finished; run 2 is what we started. A
    // poll answering about run 1 must not be allowed to stop run 2's poll.
    expect(isPayloadForRun('run-1', 'run-2')).toBe(false);
  });

  it('accepts a payload for the run we started', () => {
    expect(isPayloadForRun('run-2', 'run-2')).toBe(true);
  });

  it('accepts anything before we know which run is ours', () => {
    // Between mount and the POST returning, refusing everything would leave the screen blank.
    expect(isPayloadForRun('run-1', null)).toBe(true);
    expect(isPayloadForRun('run-1', undefined)).toBe(true);
  });

  it('accepts a payload from a worker too old to name its run', () => {
    // Rejecting these would black out the screen against a worker that simply has not been
    // redeployed, which is a worse failure than the staleness it would prevent.
    expect(isPayloadForRun(null, 'run-2')).toBe(true);
    expect(isPayloadForRun(undefined, 'run-2')).toBe(true);
  });
});

// ── "13%" for a Bell County run that had retrieved 17 documents ─────────────────────────────────

describe('resolvePercent — the server outranks the client guess', () => {
  it('uses the server percentage and ignores the inference entirely', () => {
    expect(resolvePercent(68, 13, 'active')).toBe(68);
  });

  it('falls back to the inference only when the server has no number', () => {
    // A worker that predates `percent` must still draw a bar rather than sitting at zero.
    expect(resolvePercent(null, 13, 'active')).toBe(13);
    expect(resolvePercent(undefined, 13, 'active')).toBe(13);
  });

  it('does not treat a server 0 as missing', () => {
    // `serverPercent ?? inferred` would be correct here but `serverPercent || inferred` would not,
    // and 0 is a real answer at the very start of a run.
    expect(resolvePercent(0, 13, 'active')).toBe(0);
  });

  it('never reaches 100 while the run is still going', () => {
    expect(resolvePercent(100, null, 'active')).toBe(99);
    expect(resolvePercent(150, null, 'active')).toBe(99);
  });

  it('reaches exactly 100 on success, whatever the last poll said', () => {
    // A final poll can arrive before the tracker's finish(), which rendered "complete · 96%".
    expect(resolvePercent(96, null, 'succeeded')).toBe(100);
    expect(resolvePercent(null, null, 'succeeded')).toBe(100);
  });

  it('KEEPS the percentage a stopped run actually reached', () => {
    // "It died at 68%" tells an operator what they still hold. Rounding to 0 or 100 throws it away.
    expect(resolvePercent(68, null, 'failed')).toBe(68);
    expect(resolvePercent(68, null, 'cancelled')).toBe(68);
    expect(resolvePercent(68, null, 'interrupted')).toBe(68);
  });

  it('clamps a nonsense negative rather than rendering a backwards bar', () => {
    expect(resolvePercent(-5, null, 'active')).toBe(0);
  });
});

// ── "Bell County research failed: Pipeline cancelled by user" ───────────────────────────────────

describe('resolveOutcome — stopping is not failing', () => {
  it('does NOT call a budget wind-down a failure', () => {
    const out = resolveOutcome({ lifecycle: 'succeeded', stopReason: 'budget_reached' });
    expect(out.isProblem).toBe(false);
    expect(out.headline).not.toMatch(/fail/i);
    expect(out.label).toBe('Finished at ceiling');
  });

  it('carries the worker sentence about the ceiling when there is one', () => {
    const out = resolveOutcome({
      lifecycle: 'succeeded',
      stopReason: 'budget_reached',
      budgetSummary: 'Stopped after $2.00 of a $2.00 ceiling.',
    });
    expect(out.detail).toBe('Stopped after $2.00 of a $2.00 ceiling.');
  });

  it('does NOT call a user cancellation a failure', () => {
    const out = resolveOutcome({ lifecycle: 'cancelled', percent: 68 });
    expect(out.isProblem).toBe(false);
    expect(out.headline).not.toMatch(/fail/i);
    expect(out.detail).toMatch(/68%/);
  });

  it('does NOT call a worker restart a failure', () => {
    const out = resolveOutcome({ lifecycle: 'interrupted' });
    expect(out.isProblem).toBe(false);
    expect(out.headline).not.toMatch(/fail/i);
    expect(out.detail).toMatch(/deploy/i);
  });

  it('does NOT attribute a stop to a person who did not act', () => {
    // The exact sentence from the screen capture: a $2.00 ceiling reported as a user cancellation.
    const out = resolveOutcome({ lifecycle: 'succeeded', stopReason: 'budget_reached' });
    expect(`${out.headline} ${out.detail}`).not.toMatch(/cancelled by user/i);
  });

  it('DOES report a genuine failure as one, with its reason', () => {
    const out = resolveOutcome({ lifecycle: 'failed', failureReason: 'Clerk portal returned 500.' });
    expect(out.isProblem).toBe(true);
    expect(out.headline).toMatch(/failed/i);
    expect(out.detail).toBe('Clerk portal returned 500.');
  });

  it('says so when a failure recorded no reason, rather than inventing one', () => {
    const out = resolveOutcome({ lifecycle: 'failed', failureReason: null });
    expect(out.isProblem).toBe(true);
    expect(out.detail).toMatch(/no reason was recorded/i);
  });

  it('only ever marks a genuine failure as a problem', () => {
    for (const lc of ['idle', 'active', 'succeeded', 'cancelled', 'interrupted'] as const) {
      expect(resolveOutcome({ lifecycle: lc }).isProblem).toBe(false);
    }
    expect(resolveOutcome({ lifecycle: 'failed' }).isProblem).toBe(true);
  });
});

// ── The whole screen, from one function ─────────────────────────────────────────────────────────

describe('buildRunState', () => {
  const startedAt = '2026-09-01T12:00:00.000Z';
  const now = Date.parse('2026-09-01T12:02:00.000Z'); // two minutes in

  it('reproduces the 2026-09-01 screen correctly instead of contradicting itself', () => {
    // The inputs that produced "running / finished / failed" simultaneously: a live run 2 from the
    // poll, and a run-console still describing run 1's completion.
    const state = buildRunState({
      poll: {
        runId: 'run-2', runNumber: 2, status: 'running', percent: 42,
        phaseLabel: 'Retrieving documents', message: 'Clerk: fetching deed 12 of 17', startedAt,
      },
      console: {
        status: 'complete', phase: 'reporting', activity: '',
        spend: { totalUsd: 0.02, noEventsRecorded: false, headline: '' },
        time: { elapsedMs: 120_000, budgetMs: 1_500_000, fractionUsed: 0.08, looksStalled: false, headline: '' },
        skipped: [], budgetSummary: null,
      },
      now,
    });

    // One answer, and it is the LIVE one.
    expect(state.lifecycle).toBe('active');
    expect(state.outcome.isProblem).toBe(false);
    expect(state.percent).toBe(42);
    expect(state.phaseLabel).toBe('Retrieving documents');
    expect(state.runNumber).toBe(2);
    // And the console still supplies what only it knows.
    expect(state.spendUsd).toBe(0.02);
    expect(state.budgetMs).toBe(1_500_000);
    expect(state.canCancel).toBe(true);
  });

  it('computes elapsed from the run start, not from when the component mounted', () => {
    // The panel showed "00:00 elapsed" beside a console reading two minutes, because it started
    // counting at mount and the run had begun before the operator opened the page.
    const state = buildRunState({
      poll: { runId: 'r', status: 'running', startedAt },
      console: null,
      now,
    });
    expect(state.elapsedMs).toBe(120_000);
    expect(formatElapsed(state.elapsedMs)).toBe('02:00');
  });

  it('falls back to the console clock when the poll cannot say when the run began', () => {
    const state = buildRunState({
      poll: { runId: 'r', status: 'running' },
      console: {
        time: { elapsedMs: 90_000, budgetMs: null, fractionUsed: null, looksStalled: false, headline: '' },
      },
      now,
    });
    expect(state.elapsedMs).toBe(90_000);
  });

  it('is idle, not failed, when nothing has run', () => {
    const state = buildRunState({ poll: null, console: null, now });
    expect(state.lifecycle).toBe('idle');
    expect(state.outcome.isProblem).toBe(false);
    expect(state.canCancel).toBe(false);
  });

  it('keeps "no usage recorded" distinct from "$0.00 spent"', () => {
    const unrecorded = buildRunState({
      poll: { status: 'complete' },
      console: { spend: { totalUsd: 0, noEventsRecorded: true, headline: '' } },
      now,
    });
    const genuinelyFree = buildRunState({
      poll: { status: 'complete' },
      console: { spend: { totalUsd: 0, noEventsRecorded: false, headline: '' } },
      now,
    });
    expect(unrecorded.spendUnrecorded).toBe(true);
    expect(genuinelyFree.spendUnrecorded).toBe(false);
  });

  it('surfaces the work a budget dropped', () => {
    const state = buildRunState({
      poll: { status: 'complete', stopReason: 'budget_reached' },
      console: { skipped: [{ what: 'deed chain', reason: 'cost ceiling reached' }] },
      now,
    });
    expect(state.skipped).toHaveLength(1);
    expect(state.outcome.isProblem).toBe(false);
  });
});

describe('formatElapsed', () => {
  it('renders MM:SS below an hour and H:MM:SS above it', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(59_000)).toBe('00:59');
    expect(formatElapsed(120_000)).toBe('02:00');
    expect(formatElapsed(3_661_000)).toBe('1:01:01');
  });

  it('does not render a negative clock from a clock skew', () => {
    expect(formatElapsed(-5000)).toBe('00:00');
  });
});
