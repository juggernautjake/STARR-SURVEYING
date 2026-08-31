// A run that stops on time, with what it has (research plan R5).
//
// The owner's ask has two ceilings in it: *"continues to work on the research for 20–30 minutes"*
// and *"as cheap but as effective as possible"*. Without a clock, a run that finds an interesting
// chain of title follows it for an hour. Without a dollar limit, a county whose plats are 60 pages
// of scanned handwriting spends whatever the vision model asks. Neither failure announces itself —
// the run is just slower and dearer than the last one, and nobody can say why.
//
// The behaviour that matters most is what happens AT the ceiling: finish cleanly with what you
// have. A run that dies at its limit is worse than useless — the money is spent, the time is gone,
// and there is nothing to show for it.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_LIMITS,
  checkBudget,
  endRun,
  limitsFor,
  MAX_COST_CEILING_USD,
  mayRun,
  notePaidPages,
  recordSkipped,
  startRun,
  windDownSummary,
} from '../infra/run-budget.js';

const PROJECT = 'proj-1';
const T0 = 1_700_000_000_000;

beforeEach(() => { endRun(PROJECT); });

describe('the limits themselves', () => {
  it('defaults to the owner’s 25 minutes', () => {
    expect(DEFAULT_LIMITS.maxWallClockMs).toBe(25 * 60_000);
  });

  it('honours a caller’s request', () => {
    expect(limitsFor({ maxResearchTimeMinutes: 30 }, {} as NodeJS.ProcessEnv).maxWallClockMs).toBe(30 * 60_000);
  });

  it('clamps a request that would tie up a slot all afternoon', () => {
    // Four hours is either a mistake or somebody working around a problem that should be fixed
    // properly. A worker that accepts it holds a concurrency slot the whole time.
    expect(limitsFor({ maxResearchTimeMinutes: 240 }, {} as NodeJS.ProcessEnv).maxWallClockMs).toBe(60 * 60_000);
    expect(limitsFor({ maxResearchTimeMinutes: 0 }, {} as NodeJS.ProcessEnv).maxWallClockMs).toBe(60_000);
  });

  // ── Per-run spend limit (owner request, 2026-08-30) ────────────────────────────────────────
  //
  // $2.00 is the right default — most runs are Bell/Coryell/Milam/Lampasas/Bosque and cost nothing
  // but AI time — but a chain of title behind TexasFile can legitimately need more, and until now
  // the only way to raise it was to edit this file.

  it('honours a caller’s per-run spend limit', () => {
    expect(limitsFor({ maxCostUsd: 7.5 }, {} as NodeJS.ProcessEnv).maxCostUsd).toBe(7.5);
  });

  it('clamps a request above the ceiling instead of rejecting the run', () => {
    // A typo of 1000 for 10.00 must not become a thousand-dollar run. Satisfied AT the maximum
    // rather than refused: failing a run outright over a too-large budget helps nobody.
    expect(limitsFor({ maxCostUsd: 1000 }, {} as NodeJS.ProcessEnv).maxCostUsd).toBe(MAX_COST_CEILING_USD);
    expect(MAX_COST_CEILING_USD).toBe(10);
  });

  it('treats a requested 0 as "free sources only", not as "unset"', () => {
    // The bug this pins: `requested.maxCostUsd || fallback` reads 0 as absent and silently hands
    // back the $2.00 default — the run then spends money the caller explicitly forbade.
    expect(limitsFor({ maxCostUsd: 0 }, {} as NodeJS.ProcessEnv).maxCostUsd).toBe(0);
    expect(
      limitsFor({ maxCostUsd: 0 }, { RUN_MAX_COST_USD: '5' } as NodeJS.ProcessEnv).maxCostUsd,
    ).toBe(0);
  });

  it('ignores a negative or unusable request rather than trusting it', () => {
    expect(limitsFor({ maxCostUsd: -5 }, {} as NodeJS.ProcessEnv).maxCostUsd).toBe(DEFAULT_LIMITS.maxCostUsd);
    expect(limitsFor({ maxCostUsd: NaN }, {} as NodeJS.ProcessEnv).maxCostUsd).toBe(DEFAULT_LIMITS.maxCostUsd);
  });

  it('clamps the environment default too — the ceiling is not a UI-only rule', () => {
    // A deployment that sets RUN_MAX_COST_USD=250 is the same mistake with a different author.
    expect(
      limitsFor(undefined, { RUN_MAX_COST_USD: '250' } as NodeJS.ProcessEnv).maxCostUsd,
    ).toBe(MAX_COST_CEILING_USD);
  });

  it('reads deployment defaults from the environment', () => {
    const l = limitsFor(undefined, { RUN_MAX_MINUTES: '10', RUN_MAX_COST_USD: '0.5', RUN_MAX_PAID_PAGES: '3' } as NodeJS.ProcessEnv);
    expect(l.maxWallClockMs).toBe(10 * 60_000);
    expect(l.maxCostUsd).toBe(0.5);
    expect(l.maxPaidPages).toBe(3);
  });

  it('caps paid pages separately from dollars', () => {
    // One $50 plat set can pass a dollar limit in a single purchase; that decision deserves its own
    // bound rather than hiding inside the total.
    expect(DEFAULT_LIMITS.maxPaidPages).toBeGreaterThan(0);
  });
});

describe('what happens at each ceiling', () => {
  it('stops on the clock', () => {
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxWallClockMs: 60_000 }, T0);
    expect(checkBudget(PROJECT, 0, T0 + 59_000).ok).toBe(true);
    const over = checkBudget(PROJECT, 0, T0 + 61_000);
    expect(over.ok).toBe(false);
    expect(over.exceeded).toBe('wall_clock');
  });

  it('stops on spend', () => {
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxCostUsd: 0.5 }, T0);
    expect(checkBudget(PROJECT, 0.49, T0).ok).toBe(true);
    expect(checkBudget(PROJECT, 0.5, T0).exceeded).toBe('cost');
  });

  it('stops on paid pages', () => {
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxPaidPages: 2 }, T0);
    notePaidPages(PROJECT, 2);
    expect(checkBudget(PROJECT, 0, T0).exceeded).toBe('paid_pages');
  });

  it('latches — a run winding down does not resume', () => {
    // The clock cannot go backwards, but a revised cost estimate could. Half-finishing a phase
    // twice is worse than skipping it once.
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxCostUsd: 0.5 }, T0);
    expect(checkBudget(PROJECT, 0.6, T0).ok).toBe(false);
    expect(checkBudget(PROJECT, 0.1, T0).ok).toBe(false);
  });
});

describe('stopping is not failing', () => {
  it('records what it did not do, with the reason', () => {
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxWallClockMs: 1000 }, T0);
    expect(mayRun(PROJECT, 'adjoiner research', 0, T0 + 2000)).toBe(false);
    const status = checkBudget(PROJECT, 0, T0 + 2000);
    expect(status.skipped).toHaveLength(1);
    expect(status.skipped[0]!.step).toBe('adjoiner research');
    expect(status.skipped[0]!.reason).toContain('time limit');
  });

  it('does not repeat a skip as each phase checks in', () => {
    // A skipped list with "adjoiners" in it six times reads like six failures.
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxWallClockMs: 1000 }, T0);
    mayRun(PROJECT, 'adjoiner research', 0, T0 + 2000);
    mayRun(PROJECT, 'adjoiner research', 0, T0 + 3000);
    expect(checkBudget(PROJECT, 0, T0 + 3000).skipped).toHaveLength(1);
  });

  it('lets work through while there is budget left', () => {
    startRun(PROJECT, DEFAULT_LIMITS, T0);
    expect(mayRun(PROJECT, 'deed chain', 0.1, T0 + 60_000)).toBe(true);
    expect(checkBudget(PROJECT, 0.1, T0 + 60_000).skipped).toHaveLength(0);
  });

  it('writes a summary a person can act on', () => {
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxWallClockMs: 1000 }, T0);
    recordSkipped(PROJECT, 'adjoiner research', 'ran out of time');
    recordSkipped(PROJECT, 'ROW integration', 'ran out of time');
    const summary = windDownSummary(checkBudget(PROJECT, 0, T0 + 2000))!;
    expect(summary).toContain('Not attempted: adjoiner research, ROW integration');
    // "Partial" on its own is not actionable; the next move is stated.
    expect(summary).toContain('Re-run with a higher limit');
  });

  it('says nothing when the run finished inside its budget', () => {
    startRun(PROJECT, DEFAULT_LIMITS, T0);
    expect(windDownSummary(checkBudget(PROJECT, 0.2, T0 + 60_000))).toBeNull();
  });
});

describe('an unbudgeted call is not an over-budget one', () => {
  it('reports ok when no budget was registered', () => {
    // Ad-hoc calls and paths that do not go through the pipeline must not be refused because
    // nobody set a limit.
    const status = checkBudget('never-started', 5.0);
    expect(status.ok).toBe(true);
    expect(status.remainingUsd).toBe(Infinity);
  });
});

describe('the wiring', () => {
  const index = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');

  it('registers a budget when a run is admitted', () => {
    expect(index).toContain('startRun(projectId, budgetLimits)');
    expect(index).toContain('resetRunSpend(projectId)');
  });

  it('checks at the phase boundary, not inside a phase', () => {
    // Stopping between phases leaves a coherent partial result; stopping inside one leaves half a
    // chain of title.
    expect(index).toContain('Budget check at the phase boundary');
    expect(index).toContain('pipelineAbortController.abort()');
  });

  it('puts the summary and the skipped list on the finished result', () => {
    expect(index).toContain('budgetSummary');
    expect(index).toContain('skippedWork');
  });

  it('releases the budget on both the success and the crash path', () => {
    expect(index.match(/endRun\(projectId\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
