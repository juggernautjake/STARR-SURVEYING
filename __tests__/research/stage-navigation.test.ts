// __tests__/research/stage-navigation.test.ts — Phase N1.
//
// ── YOU COULD NOT LOOK AT AN EARLIER STAGE WITHOUT CHANGING THE PROJECT ─────────────────────────
//
// Owner: *"be able to navigate back and forth throughout the research flow"*.
//
// Before this there was no such thing as *looking* at a stage. `currentStage` came straight off
// `project.status`, so seeing an earlier screen meant calling `handleRevertToStep` — a PATCH behind
// a red confirmation that (correctly) warns it may permanently delete extracted data points.
// Going back to re-read the property form meant telling the database the run had not happened.
//
// And forward was not possible at all: the stepper only accepted clicks on stages *before* the
// current one, so once you reverted, the only way back was to re-run.
//
// The tell that this was already a known problem: `holdOnResearchStage`, a boolean whose entire
// purpose is to keep somebody on Stage 2 after the DB has moved to `review`. One hard-coded special
// case of "the stage I am looking at is not the stage the row says".

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  STAGE_ORDER, stageIndex, stageLabel, reachedStage, canViewStage, resolveViewStage, isViewingBehind,
} from '@/app/admin/research/[projectId]/_sections/stage-view';
import { PIPELINE_STAGES } from '@/types/research';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('the stage order this is built on', () => {
  it('comes from PIPELINE_STAGES rather than a second list', () => {
    // A hand-kept order beside `PIPELINE_STAGES` is G12 waiting to happen: a fifth stage would be
    // drawn by the stepper and unreachable by the navigation, and nothing would say why.
    expect(STAGE_ORDER).toEqual(PIPELINE_STAGES.map((s) => s.key));
    expect(STAGE_ORDER.length, 'the pipeline is four stages').toBe(4);
  });

  it('and an unknown stage reads as the FIRST one, not as -1', () => {
    // `indexOf` returns -1, which propagates into `<=` as "before everything" and would silently
    // mark every stage reachable — the exact opposite of what the guard is for.
    expect(stageIndex('nonsense' as never)).toBe(0);
  });

  it('names every stage', () => {
    for (const s of STAGE_ORDER) {
      expect(stageLabel(s).length, `${s} has no label`).toBeGreaterThan(2);
    }
  });
});

describe('how far the project has got', () => {
  it.each([
    ['upload', 'upload'],
    ['configure', 'research'],
    ['analyzing', 'research'],
    ['review', 'review'],
    ['drawing', 'jobprep'],
    ['complete', 'jobprep'],
  ])('%s is stage %s', (status, stage) => {
    expect(reachedStage(status as never)).toBe(stage);
  });
});

describe('what can be opened, and what cannot', () => {
  it('every stage up to the one the project reached', () => {
    expect(canViewStage('upload', 'review')).toBe(true);
    expect(canViewStage('research', 'review')).toBe(true);
    expect(canViewStage('review', 'review')).toBe(true);
  });

  it('but NOT one it has not got to', () => {
    // A Review screen for a project that has never run is four empty panels and a promise the page
    // cannot keep. This portal has shipped that shape before — a stat tile that scrolls to an
    // empty section — and the fix there was to disable the tile.
    expect(canViewStage('review', 'upload')).toBe(false);
    expect(canViewStage('jobprep', 'review')).toBe(false);
  });

  it('and a project mid-run can still be looked back through', () => {
    // `analyzing` maps to `research`, so Stage 1 stays readable while the pipeline works. Somebody
    // watching a run is exactly who wants to check what address they typed.
    expect(canViewStage('upload', 'analyzing')).toBe(true);
  });
});

describe('resolving what to render', () => {
  it('follows the project when nothing is chosen', () => {
    // The state somebody is in almost all of the time.
    expect(resolveViewStage(null, 'review')).toBe('review');
    expect(resolveViewStage(null, 'upload')).toBe('upload');
  });

  it('honours a chosen stage that is reachable', () => {
    expect(resolveViewStage('upload', 'review')).toBe('upload');
  });

  it('and falls back when the chosen stage has UN-HAPPENED', () => {
    // You are reading Review; somebody reverts the project to Upload. Rendering a Review screen for
    // a project that is now on Stage 1 shows analysis results that were just deleted.
    expect(resolveViewStage('review', 'upload')).toBe('upload');
    // `configure`, not `research`: the second argument is a WorkflowStep (7 values) and the first
    // is a PipelineStage (4). Passing a stage here reads as an unknown status and falls to
    // `upload`, which is how the first version of this assertion was wrong — the test caught its
    // own fixture rather than the code, which is the good outcome and worth leaving a note about.
    expect(resolveViewStage('jobprep', 'configure')).toBe('research');
  });
});

describe('saying that you are looking back', () => {
  it('is true only when the chosen stage is genuinely behind', () => {
    expect(isViewingBehind('upload', 'review')).toBe(true);
    expect(isViewingBehind('review', 'review')).toBe(false);
    expect(isViewingBehind(null, 'review')).toBe(false);
  });

  it('and NOT when the choice was discarded as unreachable', () => {
    // `resolveViewStage` already fell back to the project's own stage, so there is nothing to
    // report. A banner reading "you are looking at Upload, this project has reached Upload" is a
    // sentence nobody can act on.
    expect(isViewingBehind('review', 'upload')).toBe(false);
  });
});

describe('the page and the stepper are actually wired to it', () => {
  const PAGE = read('app/admin/research/[projectId]/page.tsx');
  const STEPPER = read('app/admin/research/components/PipelineStepper.tsx');

  it('the page resolves a viewed stage rather than reading status directly', () => {
    expect(PAGE).toContain('resolveViewStage(viewStage, project.status)');
    expect(PAGE).toContain('onViewStage={setViewStage}');
  });

  it('the stepper OPENS a stage on click and reverts somewhere else', () => {
    // These were the same click. Opening writes nothing; reverting can delete data, so it is a
    // named act with its own control.
    expect(STEPPER).toContain('onClick={() => canView && onViewStage(stage.key)}');
    expect(STEPPER).toContain('Restart from here');
  });

  it('the circle is a real button', () => {
    // It was a `div` with `role="button"`, a hand-written `onKeyDown` for Enter and Space, a
    // toggled `tabIndex` and `aria-disabled` — thirty lines re-implementing what the element does
    // for free, and getting disabled semantics only approximately.
    const at = STEPPER.indexOf('pipeline-stepper__circle');
    expect(STEPPER.slice(Math.max(0, at - 200), at)).toContain('<button');
    expect(STEPPER, 'the hand-rolled keyboard handling is back').not.toContain("e.key === 'Enter' || e.key === ' '");
  });

  it('a deliberate move of the PROJECT drops the reader back to following it', () => {
    // Otherwise starting a run while looking at Stage 1 leaves you on Stage 1 watching nothing.
    const at = PAGE.indexOf('async function handleStatusUpdate');
    expect(PAGE.slice(at, at + 400)).toContain('setViewStage(null)');
  });

  it('and so does a revert', () => {
    // A stale choice here shows the banner saying "this project has reached X" about the stage you
    // just reverted away from.
    const at = PAGE.indexOf('async function handleRevertToStep');
    expect(PAGE.slice(at, PAGE.indexOf('function', at + 40))).toContain('setViewStage(null)');
  });

  it('a stage you can OPEN looks different from one you cannot', () => {
    // Photographed on a project that had reached Review: stage 3 was reachable and stage 4 was
    // not, and the two were pixel-identical grey circles. "Which of these can I click" is not a
    // question a stepper should make somebody answer by trying.
    expect(STEPPER).toContain('pipeline-stepper__circle--openable');
    const css = read('app/admin/styles/AdminResearch.css');
    expect(css).toContain('.pipeline-stepper__circle--openable {');
    expect(css, 'a stage the project has not reached still reads as a control')
      .toContain('.pipeline-stepper__circle:disabled:not(.pipeline-stepper__circle--active)');
  });

  it('the banner names both stages and offers the way back', () => {
    expect(PAGE).toContain('research-stage-banner');
    expect(PAGE).toContain('Back to {stageLabel(reached)}');
  });
});
