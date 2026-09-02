// A run that outlives the process running it (research plan R3).
//
// `activePipelines`, `completedResults` and `completedLogs` are in-process Maps. A 25-minute run on
// a box that restarts, OOMs or gets a deploy loses every trace of itself — including the fact that
// it had already bought documents. The app polls for status, gets nothing, and shows a run that was
// two thirds finished as though it had never started.
//
// The documents are safe; they go to Supabase as they are produced. What vanished is the RUN: its
// phase, its clock, its spend, and whether it ended.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readSeedNormalised } from './seed-normalise.helper.js';
import { STALE_HEARTBEAT_MS, describeRecovery, type RecoveredRun } from '../infra/run-store.js';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const store = read('src/infra/run-store.ts');
const index = read('src/index.ts');
const seed = readSeedNormalised('530_research_runs.sql');

describe('interrupted is not failed', () => {
  it('the recovery sweep marks stale runs interrupted', () => {
    // The research did not fail — the process holding it stopped, usually a deploy. Somebody
    // scanning a list of failures should not have to work out which ones were releases.
    expect(store).toContain("status: 'interrupted'");
    expect(store).toContain('restart or deploy');
  });

  it('the schema keeps them as separate states', () => {
    expect(seed).toMatch(/CHECK \(status IN \('running', 'complete', 'failed', 'interrupted', 'cancelled'\)\)/);
    expect(seed).toContain('interrupted is NOT a kind of failed');
  });

  it('says out loud what a restart orphaned, and what it had already spent', () => {
    const runs: RecoveredRun[] = [
      { projectId: 'p1', phase: 'Deed chain', costUsd: 1.25, startedAt: '2026-08-02T10:00:00Z', workerBuild: 'abc123' },
      { projectId: 'p2', phase: 'Plat analysis', costUsd: 0.4, startedAt: '2026-08-02T10:05:00Z', workerBuild: 'abc123' },
    ];
    const line = describeRecovery(runs);
    expect(line).toContain('2 run(s)');
    // The money is the point: an interrupted run that had bought $12 of plats must not look
    // identical to one that had spent nothing — that difference decides whether somebody re-runs.
    expect(line).toContain('$1.6500');
    expect(line).toContain('Deed chain');
    expect(line).toContain('not failed');
  });

  it('is quiet when there is nothing to recover', () => {
    expect(describeRecovery([])).toBe('no interrupted runs to recover');
  });
});

describe('the staleness window', () => {
  it('is long enough that a slow phase is never mistaken for a dead process', () => {
    // A county portal taking four minutes, or a 60-page plat set being read, must not be swept.
    expect(STALE_HEARTBEAT_MS).toBeGreaterThanOrEqual(5 * 60_000);
  });

  it('is short enough to answer "did my research survive the deploy?" in one sitting', () => {
    expect(STALE_HEARTBEAT_MS).toBeLessThanOrEqual(15 * 60_000);
  });

  it('only matters at boot — a live run heartbeats every phase', () => {
    // Matched across a line break. The call gained a `percent` argument when the progress
    // tracker landed and wrapped onto several lines, which broke a substring match on
    // `void recordRunPhase(projectId` while the property it guards — the pipeline heartbeats
    // the durable record at every phase, so a stale heartbeat really does mean a dead process —
    // never stopped holding. A guard that fails on reformatting teaches people to edit the
    // guard, which is how it ends up asserting nothing.
    expect(index).toMatch(/void recordRunPhase\(\s*projectId/);
  });
});

describe('bookkeeping never fails a run', () => {
  it('every write is fire-and-forget from the pipeline', () => {
    // Same reformatting problem as above, same fix: the property is "preceded by `void`", not
    // "written on one line". Bookkeeping that a run AWAITS is bookkeeping that can fail the run,
    // which is the whole point of this test.
    for (const call of [
      /void\s+recordRunStart\(\{/,
      /void\s+recordRunPhase\(\s*projectId/,
      /void\s+recordRunFinish\(\{/,
    ]) {
      expect(index, `${call} — not awaited-free`).toMatch(call);
    }
  });

  it('but logs loudly rather than swallowing', () => {
    // Silence is how a table ends up empty while everybody assumes the feature works — the exact
    // history of research_usage_events.
    expect(store).toContain('console.error');
    expect(store).not.toMatch(/catch \(err\) \{\s*\}/);
  });
});

describe('the record covers every exit', () => {
  it('closes out on success, on crash, on cancel — and on a budget stop', () => {
    expect(index).toContain("status: 'complete'");

    // ── A FOURTH EXIT APPEARED, AND IT IS THE IMPORTANT ONE ──────────────────────────────
    //
    // This asserted exactly `status: isAborted ? 'cancelled' : 'failed'`, which encoded the
    // assumption that an aborted run is either a cancellation or a crash. It is not. The worker
    // has ONE AbortController per run and two things call .abort() on it: the budget guard and
    // the cancel button. Collapsing them is what reported a run that finished inside its own
    // $2.00 ceiling as "Bell County research failed: Pipeline cancelled by user" — a failure
    // that was not a failure, attributed to a person who had not touched it.
    //
    // So the guard now requires the distinction to exist, rather than requiring its absence.
    expect(index).toMatch(/status: budgetStop \? 'complete' : isAborted \? 'cancelled' : 'failed'/);
  });

  it('carries the spend and the skipped work onto the finished row', () => {
    // So "what did this run cost and what did it not do" survives the process that knew.
    expect(index).toContain('costUsd: finalBudget.spentUsd');
    expect(index).toContain('skippedWork: finalBudget.skipped');
  });

  it('records which build was running', () => {
    // An interrupted run is usually a deploy; this says which one.
    expect(store).toContain('worker_build');
    expect(seed).toContain('worker_build');
  });
});

describe('what this deliberately does NOT claim', () => {
  it('says plainly that it does not resume a half-finished pipeline', () => {
    // The pipeline has no checkpoints, and re-running phases whose side effects are purchases is
    // not idempotent. Promising resumption would be worse than not having it.
    expect(store).toContain('does **not** resume a half-finished pipeline');
    expect(seed).toContain('does NOT resume a half-finished pipeline');
  });
});
