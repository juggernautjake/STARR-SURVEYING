import { describe, it, expect } from 'vitest';
import { readCode, readSource } from '../helpers/read-source';

// ── AN OPERATOR SIGNED OFF A FAILED RUN FROM A GREEN TICK ───────────────────────────────────────
//
// The review page's log viewer was given the LITERAL string `status="success"`. Every project,
// forever, regardless of what its run did — so "✓ Research complete" sat above the logs of a run
// that had crashed, and the person reading those logs was being told the opposite of what they said.
//
// The page could not have known better. The run's outcome was the one thing the worker did not
// persist into `analysis_metadata.result`: owner, boundary, documents and the whole validation
// report were written down, and whether any of it could be trusted was not.

const PAGE = 'app/admin/research/[projectId]/page.tsx';
const PANEL = 'app/admin/research/components/PipelineProgressPanel.tsx';

describe('the review page no longer asserts an outcome it does not know', () => {
  it('THE DEFECT: the hardcoded success is gone', () => {
    expect(readCode(PAGE)).not.toContain('status="success"');
  });

  it('it reads the stored outcome instead', () => {
    const page = readCode(PAGE);
    expect(page).toContain("typeof r?.status === 'string' ? r.status : null");
  });

  it('and falls back to a claim of nothing, not a claim of success', () => {
    // Every project that ran before the worker started persisting `status` has none. "archived"
    // titles the panel "Run log" and shows no tick either way.
    expect(readCode(PAGE)).toContain("stored ?? 'archived'");
  });

  it('the panel knows what archived means', () => {
    const panel = readCode(PANEL);
    expect(panel).toContain("const isArchived = status === 'archived'");
    expect(panel).toContain("{isArchived && 'Run log'}");
    // It must NOT be folded into the success family — that would restore the defect by another
    // route, with a green tick on every archived run.
    expect(panel).toContain("const isSuccess  = status === 'success' || status === 'partial' || status === 'complete';");
  });

  it('a stopped or failed run gets its reason on screen', () => {
    // `stopReason` first: "reached the ceiling you set" is a more useful sentence than a generic
    // failure line, and it is the one the 2026-09-03 run needed and did not get.
    const page = readCode(PAGE);
    expect(page).toContain("typeof r?.stopReason === 'string' ? r.stopReason : null");
    expect(page).toContain('return stop ?? fail ?? undefined;');
  });

  it('the worker writes the outcome down at all', () => {
    // Asserting the producer: the page reading `r.status` is worth nothing if nothing ever sets it.
    const idx = readCode('worker/src/index.ts');
    expect(idx).toContain('status: r.status ?? null,');
    expect(idx).toContain('failureReason: r.failureReason ?? null,');
  });

  it('CONTROL: the probe can see a status literal that IS still there', () => {
    // If `readCode` were eating this file, every not.toContain above would pass vacuously.
    expect(readCode(PAGE)).toContain("status: 'complete'");
    expect(readSource(PAGE).length).toBeGreaterThan(50_000);
  });
});
