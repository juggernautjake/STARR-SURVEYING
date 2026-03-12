// app/admin/research/components/WorkflowStepper.tsx
'use client';

import type { WorkflowStep } from '@/types/research';
import { WORKFLOW_STEPS } from '@/types/research';

interface WorkflowStepperProps {
  currentStatus: WorkflowStep;
  onStepClick?: (step: WorkflowStep) => void;
}

const STEP_ICONS: Record<WorkflowStep, string> = {
  upload: '📤',
  configure: '⚙️',
  analyzing: '🔄',
  review: '🔍',
  drawing: '✏️',
  verifying: '✅',
  complete: '🏁',
};

export default function WorkflowStepper({ currentStatus, onStepClick }: WorkflowStepperProps) {
  const currentIndex = WORKFLOW_STEPS.findIndex(s => s.key === currentStatus);

  return (
    <div className="research-workflow">
      <div className="research-workflow__header">
        <span className="research-workflow__header-title">Research Progress</span>
        <span className="research-workflow__header-count">
          Step {currentIndex + 1} of {WORKFLOW_STEPS.length}
        </span>
      </div>
      <div className="research-workflow__steps">
        {WORKFLOW_STEPS.map((step, i) => {
          const isDone = i < currentIndex;
          const isActive = i === currentIndex;
          // 'analyzing' is a transient state — not a stable revert target
          const isRevertable = isDone && onStepClick && step.key !== 'analyzing';

          return (
            <div key={step.key} className="research-workflow__item">
              {i > 0 && (
                <div className={`research-workflow__connector ${isDone ? 'research-workflow__connector--done' : ''}`} />
              )}
              <div className="research-workflow__step-wrap">
                <div
                  className={`research-workflow__circle ${isDone ? 'research-workflow__circle--done' : ''} ${isActive ? 'research-workflow__circle--active' : ''} ${isRevertable ? 'research-workflow__circle--revertable' : ''}`}
                  onClick={() => isRevertable && onStepClick(step.key)}
                  title={isRevertable ? `Go back to ${step.label}` : undefined}
                  style={{ cursor: isRevertable ? 'pointer' : 'default' }}
                  role={isRevertable ? 'button' : undefined}
                >
                  {isDone ? (
                    <span className="research-workflow__check">✓</span>
                  ) : (
                    <span className="research-workflow__step-icon">{STEP_ICONS[step.key]}</span>
                  )}
                </div>
                <div className={`research-workflow__step-label ${isDone ? 'research-workflow__step-label--done' : ''} ${isActive ? 'research-workflow__step-label--active' : ''}`}>
                  {step.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
