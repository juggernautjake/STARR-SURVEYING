// app/admin/research/[projectId]/_sections/stage-view.ts — which stage am I LOOKING at? (Phase N1)
//
// ── STATUS IS WHAT THE PIPELINE DID; STAGE IS WHAT I AM READING ─────────────────────────────────
//
// Owner: *"be able to navigate back and forth throughout the research flow"*.
//
// Before this, there was no such thing as looking at a stage. `currentStage` was derived straight
// from `project.status`, so the only way to see an earlier screen was to **change the project's
// status** — `handleRevertToStep`, behind a red confirmation dialog that (correctly) warns it may
// permanently delete extracted data points. Going back to re-read the property form meant
// pretending to the database that the run had not happened.
//
// And going FORWARD again was not possible at all: the stepper only accepts clicks on stages with
// index < current, so once you reverted you could only get back by re-running.
//
// There was already a workaround for one case of this, and its existence is the argument for the
// whole slice: `holdOnResearchStage` is a boolean that exists solely to keep somebody on Stage 2
// after the DB has moved to `review`. One special case of "the stage I am looking at is not the
// stage the row says", hard-coded for the one place it was needed.
//
// ── SO: TWO VALUES, AND ONE OF THEM WRITES NOTHING ──────────────────────────────────────────────
//
// `reachedStage` — the furthest the project has actually got, from `status`. Only the pipeline and
//                  an explicit revert move it, and moving it is a database write.
// `viewStage`    — the screen in front of you. Moving it writes nothing, deletes nothing, and asks
//                  nothing. Any stage up to and including `reachedStage` is fair game.
//
// Reverting still exists and is still destructive; it is now a separate, explicit act rather than
// the side effect of wanting to look at something.

import { PIPELINE_STAGES, workflowStepToStage } from '@/types/research';
import type { PipelineStage, WorkflowStep } from '@/types/research';

export const STAGE_ORDER: PipelineStage[] = PIPELINE_STAGES.map((s) => s.key);

export function stageIndex(stage: PipelineStage): number {
  const i = STAGE_ORDER.indexOf(stage);
  // An unknown stage reads as the first one rather than -1. `-1` propagates into comparisons as
  // "before everything", which would silently mark every stage reachable.
  return i === -1 ? 0 : i;
}

export function stageLabel(stage: PipelineStage): string {
  return PIPELINE_STAGES.find((s) => s.key === stage)?.label ?? stage;
}

/** How far the project has actually got. */
export function reachedStage(status: WorkflowStep): PipelineStage {
  return workflowStepToStage(status);
}

/**
 * Can I open this stage without changing anything?
 *
 * Anything at or before the one the project has reached. Not beyond: a "Review" screen for a
 * project that has never run is four empty panels and a promise the page cannot keep, and the
 * research portal has shipped that shape before — a tile that scrolls to an empty section.
 */
export function canViewStage(stage: PipelineStage, status: WorkflowStep): boolean {
  return stageIndex(stage) <= stageIndex(reachedStage(status));
}

/**
 * The stage to actually render.
 *
 * `null` means "follow the project", which is the default and the state somebody is in almost all
 * of the time. A chosen stage that is no longer reachable — the project was reverted while you were
 * looking at Review — falls back rather than rendering a screen for a stage that has un-happened.
 */
export function resolveViewStage(
  chosen: PipelineStage | null,
  status: WorkflowStep,
): PipelineStage {
  const reached = reachedStage(status);
  if (!chosen) return reached;
  return canViewStage(chosen, status) ? chosen : reached;
}

/**
 * Is the reader looking at something behind the project, and should be told so?
 *
 * The banner this drives is the difference between "I chose to look back at the property details"
 * and "this page is stuck on the wrong screen". Without it, a project that has finished analysing
 * looks, to somebody who clicked Stage 1 an hour ago, exactly like a project that never ran.
 */
export function isViewingBehind(
  chosen: PipelineStage | null,
  status: WorkflowStep,
): boolean {
  if (!chosen) return false;
  return stageIndex(resolveViewStage(chosen, status)) < stageIndex(reachedStage(status));
}
