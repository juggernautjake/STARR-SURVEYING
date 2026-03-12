// app/admin/research/components/PipelineStepper.tsx
// 4-stage pipeline stepper for STARR RECON research projects.
// Maps the underlying 7-step WorkflowStep (DB status) to 4 user-facing stages.
'use client';

import type { WorkflowStep } from '@/types/research';
import { PIPELINE_STAGES, workflowStepToStage } from '@/types/research';

interface PipelineStepperProps {
  /** Current project status (DB value) */
  currentStatus: WorkflowStep;
  /** Called when the user clicks a completed stage to revert to it */
  onStageClick?: (primaryStep: WorkflowStep) => void;
}

export default function PipelineStepper({ currentStatus, onStageClick }: PipelineStepperProps) {
  const currentStage = workflowStepToStage(currentStatus);
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
          const isDone = i < currentIndex;
          const isActive = i === currentIndex;
          // 'research' stage is revertable only when no analysis is running
          const isRevertable = isDone && !!onStageClick && currentStatus !== 'analyzing';

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
                <div
                  className={[
                    'pipeline-stepper__circle',
                    isDone ? 'pipeline-stepper__circle--done' : '',
                    isActive ? 'pipeline-stepper__circle--active' : '',
                    isRevertable ? 'pipeline-stepper__circle--revertable' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => isRevertable && onStageClick(stage.primaryStep)}
                  title={isRevertable ? `Return to ${stage.label}` : undefined}
                  style={{ cursor: isRevertable ? 'pointer' : 'default' }}
                  role={isRevertable ? 'button' : undefined}
                  tabIndex={isRevertable ? 0 : -1}
                  aria-disabled={!isRevertable ? true : undefined}
                  onKeyDown={e => {
                    if (isRevertable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onStageClick(stage.primaryStep);
                    }
                  }}
                >
                  {isDone ? (
                    <span className="pipeline-stepper__check">✓</span>
                  ) : (
                    <span className="pipeline-stepper__stage-icon">{stage.icon}</span>
                  )}
                </div>
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
