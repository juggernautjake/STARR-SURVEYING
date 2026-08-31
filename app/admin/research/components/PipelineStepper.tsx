// app/admin/research/components/PipelineStepper.tsx
//
// The 4-stage pipeline stepper for STARR RECON research projects.
//
// Step model — two layers:
//   1. WorkflowStep (DB status, 7 values) — the granular state
//      the backend writes to `research_projects.status`:
//        upload → configure → analyzing → review → drawing →
//        verifying → complete
//   2. PipelineStage (user-facing, 4 values) — what we render in
//      the stepper UI:
//        upload (Property Info) → research (Research & Analysis)
//        → review → jobprep
//
//   `configure` + `analyzing` collapse into the `research` stage
//   because the user shouldn't see "configure" as a separate
//   surface — it's the same screen as analysis with the run
//   button visible until first run kicks off. Similarly
//   `drawing` + `verifying` + `complete` all share the `jobprep`
//   stage because they're three sub-states of the same downstream
//   workflow (AI drawing, then verification, then the bookkeeper-
//   facing print prep).
//
//   The mapping lives in `types/research.ts::workflowStepToStage`
//   and the stage metadata (label, icon, primaryStep) lives in
//   `PIPELINE_STAGES` in the same file. This component is purely
//   presentational against those.
//
//   Revert behaviour (`onStageClick`): clicking a previously-
//   completed stage circle calls the handler with that stage's
//   primaryStep — the workflow resets to that WorkflowStep. The
//   'analyzing' transient state blocks revert (background job
//   still running).
'use client';

import type { WorkflowStep, PipelineStage } from '@/types/research';
import { PIPELINE_STAGES, workflowStepToStage } from '@/types/research';

interface PipelineStepperProps {
  /** Current project status (DB value) — how far the project has actually got. */
  currentStatus: WorkflowStep;
  /**
   * The stage being LOOKED at, when it is not the one the project is on (Phase N1).
   *
   * Separate from `currentStatus` on purpose. Before this the only way to see an earlier screen
   * was to change the project's status through a destructive revert, and there was no way forward
   * again at all.
   */
  viewStage?: PipelineStage;
  /** Open a stage. Writes nothing — see `_sections/stage-view.ts`. */
  onViewStage?: (stage: PipelineStage) => void;
  /** Called when the user REVERTS to a stage. Destructive; kept separate from viewing. */
  onStageClick?: (primaryStep: WorkflowStep) => void;
}

export default function PipelineStepper({
  currentStatus, viewStage, onViewStage, onStageClick,
}: PipelineStepperProps) {
  const reached = workflowStepToStage(currentStatus);
  const reachedIndex = PIPELINE_STAGES.findIndex(s => s.key === reached);
  // What is on the screen. Defaults to the stage the project is on, which is the state somebody is
  // in almost all of the time.
  const currentStage = viewStage ?? reached;
  const currentIndex = PIPELINE_STAGES.findIndex(s => s.key === currentStage);

  return (
    <div className="pipeline-stepper">
      <div className="pipeline-stepper__header">
        <span className="pipeline-stepper__title">Research Pipeline</span>
        <span className="pipeline-stepper__progress">
          Stage {currentIndex + 1} of {PIPELINE_STAGES.length}
        </span>
      </div>
      <div className="pipeline-stepper__stages">
        {PIPELINE_STAGES.map((stage, i) => {
          // ── DONE, ACTIVE AND REACHED ARE THREE DIFFERENT THINGS NOW (N1) ────────────────────
          //
          // `isDone` used to mean both "the pipeline finished this" and "this is behind the screen
          // you are on", because those could not differ. They can now: looking back at Stage 1 on
          // a project that has reached Review must not redraw Stages 2 and 3 as unfinished.
          //
          //   isDone     — the PROJECT is past it. Ticked.
          //   isActive   — it is the screen in front of you.
          //   isReached  — the project has got at least this far, so it can be opened.
          const isDone = i < reachedIndex;
          const isActive = i === currentIndex;
          const isReached = i <= reachedIndex;

          // Opening a stage writes nothing. Reverting is a separate, destructive act — see
          // `_sections/stage-view.ts`. Both were the same click before this.
          const canView = isReached && !isActive && !!onViewStage;
          // 'research' is revertable only when no analysis is running.
          const isRevertable = i < reachedIndex && !!onStageClick && currentStatus !== 'analyzing';

          return (
            <div key={stage.key} className="pipeline-stepper__item">
              {/* Connector line before each stage except the first */}
              {i > 0 && (
                <div
                  className={`pipeline-stepper__connector${isDone ? ' pipeline-stepper__connector--done' : ''}`}
                />
              )}

              {/* Stage circle + label */}
              <div className="pipeline-stepper__stage-wrap">
                <button
                  type="button"
                  className={[
                    'pipeline-stepper__circle',
                    isDone ? 'pipeline-stepper__circle--done' : '',
                    isActive ? 'pipeline-stepper__circle--active' : '',
                    canView ? 'pipeline-stepper__circle--openable' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => canView && onViewStage(stage.key)}
                  disabled={!canView}
                  title={
                    canView ? `Open ${stage.label}`
                      : isActive ? `${stage.label} — you are here`
                      : `${stage.label} — not reached yet`
                  }
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={
                    canView ? `Open stage ${stage.number}, ${stage.label}`
                      : `Stage ${stage.number}, ${stage.label}${isActive ? ' — current' : ' — not reached yet'}`
                  }
                >
                  {isDone ? (
                    <span className="pipeline-stepper__check" aria-hidden="true">✓</span>
                  ) : (
                    <span className="pipeline-stepper__stage-icon" aria-hidden="true">{stage.icon}</span>
                  )}
                </button>
                <div
                  className={[
                    'pipeline-stepper__stage-label',
                    isDone ? 'pipeline-stepper__stage-label--done' : '',
                    isActive ? 'pipeline-stepper__stage-label--active' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className="pipeline-stepper__stage-num">{stage.number}.</span> {stage.label}
                </div>
                {isActive && (
                  <div className="pipeline-stepper__stage-desc">{stage.description}</div>
                )}
                {/* Reverting is destructive, so it is a named act rather than a click on the same
                    circle that merely opens a screen. It says what it does. */}
                {isRevertable && (
                  <button
                    type="button"
                    className="pipeline-stepper__revert"
                    onClick={() => onStageClick(stage.primaryStep)}
                    title={`Move the project back to ${stage.label} — this can delete analysis data`}
                  >
                    Restart from here
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
