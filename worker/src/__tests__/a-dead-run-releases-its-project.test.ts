// worker/src/__tests__/a-dead-run-releases-its-project.test.ts
//
// ── THE PROJECT THAT COULD NOT BE UNSTUCK ───────────────────────────────────────────────────────
//
// `research_projects.status` is what the project page reads. The worker set it to 'analyzing' when
// a run started and back to 'review' when a run finished — and on every OTHER ending it wrote
// nothing at all. A run killed by the budget ceiling, stopped by the stall watchdog, crashed, or
// interrupted by a worker deploy left the row at 'analyzing' permanently.
//
// That state has no exit. While a project is analyzing the action bar renders no button — no start,
// no re-run, no reset. The Cancel control is gated on the worker still holding the run, so it is
// gone exactly when it is needed. `DELETE /api/admin/research/[id]/analyze` was written to fix
// precisely this and has never had a caller.
//
// Job 26144 sat in 'analyzing' from 2026-09-21 until somebody read the database directly.
//
// Source-level, like its neighbours: the catch handler is inside a 600-line express route with a
// live Supabase client, four watchdogs and a browser pool. What matters is which branches exist.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8').replace(/\r\n/g, '\n');

/** The pipeline catch handler — from the crash message down to the end of cleanup. */
function catchHandler(): string {
  const at = src.indexOf("const crashMsg = err instanceof Error ? err.message : String(err ?? 'Unknown error');");
  expect(at, 'the catch handler moved; this test is reading the wrong region').toBeGreaterThan(-1);
  const end = src.indexOf('clearLiveLogForProject(projectId);', at);
  expect(end).toBeGreaterThan(at);
  return src.slice(at, end);
}

describe('a run that dies releases its project', () => {
  const handler = catchHandler();

  it('writes research_projects on the way out, not only research_runs', () => {
    // `recordRunFinish` writes `research_runs` only — see infra/run-store.ts. Recording the ending
    // there and nowhere else is what left the page showing a run that had been over for hours.
    expect(handler).toContain("from('research_projects')");
    expect(handler).toContain("status: partialStop ? 'review' : 'configure'");
  });

  it('only releases the row this run left behind', () => {
    // Without the guard, a second run started in the meantime is knocked out of 'analyzing' by the
    // first one's cleanup, and the page offers a Start button while work is in flight.
    expect(handler).toContain(".eq('status', 'analyzing')");
  });

  it('sends a budget or stall ending to review, because its documents are real', () => {
    // Same destination the success path gives a `partial` result. The run filed documents; a
    // ceiling is not a reason to hide them.
    expect(handler).toContain('partialStop');
    expect(handler).toContain("? 'review' : 'configure'");
  });

  it('does not overwrite the credit-depletion message, which is more specific', () => {
    expect(handler).toContain('if (!isCreditError) {');
  });

  it('says so in the log when the release itself fails', () => {
    // The previous version of this write, on the credit path, swallowed its error entirely. A
    // recovery step that fails silently leaves exactly the state it was added to prevent.
    expect(handler).toContain("could not release the project from 'analyzing'");
  });
});

describe('who stopped the run decides what it is called', () => {
  const handler = catchHandler();

  it('recognises a RunAbort, not only a DOMException', () => {
    // `signal.throwIfAborted()` raises a DOMException only when nothing set a reason. Every abort
    // in this worker sets one — a RunAbort, a plain Error subclass — so the old test was false for
    // every attributed abort, and a budget wind-down was recorded as a crash.
    expect(handler).toContain('err instanceof RunAbort');
    expect(handler).toContain('abortInfo !== null || (err instanceof DOMException');
  });

  it('calls it cancelled by the user only when a user cancelled it', () => {
    // Widening `isAborted` without this would relabel a stall and a worker shutdown as a
    // cancellation — the same lie abort-reason.ts exists to end, in a new place.
    expect(handler).toContain('userCancelled');
    expect(handler).toContain("stopKind === 'operator' || stopKind === 'cancelled'");
    // The cancellation strings must hang off `userCancelled`, never off bare `isAborted`.
    expect(handler).not.toContain("isAborted ? 'cancelled_by_user'");
    expect(handler).not.toContain("isAborted\n        ? 'Pipeline cancelled by user'");
  });

  it('prefers the reason carried on the abort over the one on the pipeline entry', () => {
    // The entry is gone once a run is cleaned up; the thrown reason survives. They agree when both
    // exist, so the order only matters in the case where one is missing.
    expect(handler).toContain('abortInfo?.kind ?? stop?.kind');
  });

  it('treats a stall as partial rather than failed', () => {
    expect(handler).toContain("stopKind === 'stall'");
    expect(handler).toContain("status: partialStop ? 'partial' : 'failed'");
  });
});
