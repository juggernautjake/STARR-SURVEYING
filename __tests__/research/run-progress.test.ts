// __tests__/research/run-progress.test.ts — D1.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// `inferMicroStage` ran its checks in source order and tested for stage 3 before stage 3.5:
//
//     if (/stage\s*3/i.test(message) || …) { … return 'extracting'; }
//     if (/stage\s*3\.5/i.test(message) || /reconcil/i.test(lower)) return 'validating_data';
//
// `/stage\s*3/` matches inside `"Stage 3.5"`, so the second line could not be reached by stage
// number at all. `worker/src/services/pipeline.ts:2023` posts exactly `Stage 3.5: Geometric
// reconciliation…`, and "reconciliation" contains none of `validat`/`summar`/`compil` — so the
// stage-3 block fell through to its default and the panel showed **"Extracting Data"** for the
// whole of geometric reconciliation.
//
// The `/reconcil/` half of that dead line would have caught it. It never got the chance.
//
// The messages below are the worker's real ones, not invented shapes: an inference over a string
// another service produces is only as good as the strings it is tested against, and this repository
// has shipped a display written in units nobody produces more than once.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { inferMicroStage, progressPercent, MICRO_STAGES } from
  '../../app/admin/research/components/run-progress';

const RUNNING = 'running';

describe('the stage the worker is actually in', () => {
  it('reads `Stage 3.5: Geometric reconciliation…` as reconciliation, not extraction', () => {
    // The defect, in the worker's own words.
    expect(inferMicroStage('Stage 3.5: Geometric reconciliation…', RUNNING, 3)).toBe('validating_data');
  });

  it('still reads plain stage 3 as extraction', () => {
    // The fix must be surgical: stage 3 itself did not change.
    expect(inferMicroStage('Stage 3: AI extraction', RUNNING, 3)).toBe('extracting');
    expect(inferMicroStage('Stage 3: Claude is reading the deed', RUNNING, 3)).toBe('extracting');
  });

  it('and a future decimal stage does not fall into stage 3 either', () => {
    // `(?!\.\d)` alongside the reordering. Either alone fixes 3.5; the pair is what stops the next
    // decimal stage reintroducing it by a reorder.
    expect(inferMicroStage('Stage 3.7: something new', RUNNING, 3)).not.toBe('extracting');
  });

  it('keeps the sub-branches of stage 3', () => {
    expect(inferMicroStage('Stage 3: validating extraction', RUNNING, 3)).toBe('validating_data');
    expect(inferMicroStage('Stage 3: building summary', RUNNING, 3)).toBe('resource_summary');
    expect(inferMicroStage('Stage 3: compiling results', RUNNING, 3)).toBe('compiling_data');
  });

  it('handles the early stages', () => {
    expect(inferMicroStage('Stage 0: normalizing address', RUNNING, 0)).toBe('compiling');
    expect(inferMicroStage('Stage 1: searching CAD', RUNNING, 0)).toBe('compiling');
    expect(inferMicroStage('Stage 4: quality checks', RUNNING, 3)).toBe('validating_data');
  });

  it('needs a document before it will claim to be validating one', () => {
    // Stage 2 is retrieval. Saying "Validating Information" with nothing retrieved is a claim about
    // work that has not happened.
    expect(inferMicroStage('Stage 2: retrieving documents', RUNNING, 0)).toBe('compiling');
    expect(inferMicroStage('Stage 2: retrieving documents', RUNNING, 2)).toBe('validating');
  });

  it('lets the run status override the message', () => {
    expect(inferMicroStage('Stage 3: AI extraction', 'success', 3)).toBe('final_summary');
    expect(inferMicroStage('Stage 3: AI extraction', 'partial', 3)).toBe('final_summary');
    expect(inferMicroStage(undefined, null, 0)).toBe('compiling');
    expect(inferMicroStage(undefined, 'starting', 0)).toBe('compiling');
  });

  it('returns a real stage id for every input', () => {
    const ids = new Set(MICRO_STAGES.map((s) => s.id));
    const messages = [
      'Stage 0: x', 'Stage 1: x', 'Stage 2: x', 'Stage 3: x', 'Stage 3.5: x', 'Stage 4: x',
      'something unrecognised', '', undefined,
    ];
    for (const m of messages) {
      for (const st of [null, 'starting', RUNNING, 'success', 'partial', 'failed']) {
        expect(ids, `${m} / ${st}`).toContain(inferMicroStage(m, st, 1));
      }
    }
  });
});

describe('the worker really does post these strings', () => {
  // A control for the whole file above. If the worker renames its stages, these tests keep passing
  // against messages nothing sends any more — which is the failure mode that lets a progress
  // display drift away from the pipeline it is describing.
  const pipeline = fs.readFileSync(
    path.join(process.cwd(), 'worker/src/services/pipeline.ts'), 'utf8',
  );

  it('posts a Stage 3.5 status', () => {
    expect(pipeline).toContain('Stage 3.5: Geometric reconciliation');
  });

  it('and that message is what the inference is tested with', () => {
    const posted = pipeline.match(/updateStatus\([^,]+,\s*'running',\s*`(Stage 3\.5[^`]*)`/);
    expect(posted, 'the Stage 3.5 updateStatus call moved').not.toBeNull();
    expect(inferMicroStage(posted![1], RUNNING, 3)).toBe('validating_data');
  });
});

describe('the progress bar', () => {
  it('pins to 100 only on success', () => {
    expect(progressPercent('final_summary', true)).toBe(100);
    expect(progressPercent('final_summary', false)).toBeLessThan(100);
  });

  it('never sits at 0 — a bar at 0 reads as nothing happening', () => {
    // The property is real; the CLAMP that would enforce it is not load-bearing today. Eight stages
    // put the first one at 13%, so `Math.max(6, …)` cannot bind, and mutating it to `Math.max(0, …)`
    // survives this suite. That is an equivalent mutation, not a gap — recorded here so a later
    // reader does not mistake the surviving mutant for a missing test, and so that whoever shortens
    // MICRO_STAGES knows the floor starts mattering at four stages or fewer.
    expect(progressPercent('compiling', false)).toBeGreaterThanOrEqual(6);
    expect(progressPercent(MICRO_STAGES[0].id, false), 'the first stage is already above the floor')
      .toBeGreaterThan(6);
  });

  it('never reaches 100 while running — that reads as finished', () => {
    for (const s of MICRO_STAGES) {
      expect(progressPercent(s.id, false), s.id).toBeLessThanOrEqual(96);
    }
  });

  it('never goes backwards as the run advances', () => {
    let last = -1;
    for (const s of MICRO_STAGES) {
      const pct = progressPercent(s.id, false);
      expect(pct, `${s.id} went backwards`).toBeGreaterThanOrEqual(last);
      last = pct;
    }
    expect(last).toBeGreaterThan(6);   // control: the sequence actually moved
  });
});

describe('the run-state hook uses the extracted module', () => {
  const PANEL = fs.readFileSync(
    // Was ResearchRunPanel, deleted 2026-09-02 with the rest of the superseded four-panel view.
    // The progress derivation moved into the one hook that owns polling — which is the better
    // home for it, because a percentage computed in a component is a percentage each component
    // can compute differently, and four of them did.
    path.join(process.cwd(), 'app/admin/research/components/useRunState.ts'), 'utf8',
  );

  it('imports it', () => {
    expect(PANEL).toContain("from './run-progress'");
  });

  it('and no longer carries its own copy', () => {
    // Importing is not using, and a leftover local definition would shadow the import silently.
    expect(PANEL).not.toMatch(/function inferMicroStage\s*\(/);
    expect(PANEL).not.toMatch(/const MICRO_STAGES\s*=/);
  });

  it('and calls progressPercent rather than re-deriving the clamp', () => {
    // The hook composes the two calls rather than holding a `currentMicroStage` variable.
    expect(PANEL).toContain('progressPercent(');
    expect(PANEL).toContain('inferMicroStage(');
    expect(PANEL, 'the inline clamp is back').not.toContain('Math.min(96, Math.max(6,');
  });
});
