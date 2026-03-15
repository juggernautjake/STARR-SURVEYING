// app/admin/research/components/WorkflowStepper.tsx
'use client';

import type { WorkflowStep } from '@/types/research';
import { WORKFLOW_STEPS } from '@/types/research';

interface WorkflowStepperProps {
  currentStatus: WorkflowStep;
  onStepClick?: (step: WorkflowStep) => void;
}

export default function WorkflowStepper({ currentStatus, onStepClick }: WorkflowStepperProps) {
  // Map 'analyzing' to 'configure' since they share the same visual step
  const effectiveStatus = currentStatus === 'analyzing' ? 'configure' : currentStatus;
  const currentIndex = WORKFLOW_STEPS.findIndex(s => s.key === effectiveStatus);

  return (
    <div className="research-workflow">
      {WORKFLOW_STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;
        // 'analyzing' is a transient state — not a stable revert target
        const isRevertable = isDone && onStepClick && step.key !== 'analyzing';
        const isAnalyzing = currentStatus === 'analyzing' && step.key === 'configure';

        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <div className={`research-workflow__connector ${isDone ? 'research-workflow__connector--done' : ''}`} />
            )}
            <div
              className={`research-workflow__step ${isDone ? 'research-workflow__step--done' : ''} ${isActive ? 'research-workflow__step--active' : ''} ${isRevertable ? 'research-workflow__step--revertable' : ''}`}
              onClick={() => isRevertable && onStepClick(step.key)}
              title={isRevertable ? `Go back to ${step.label}` : isAnalyzing ? 'Research & Analysis in progress...' : undefined}
              style={{ cursor: isRevertable ? 'pointer' : 'default' }}
            >
              <span className="research-workflow__step-num">
                {isDone ? '✓' : isAnalyzing ? '⏳' : step.number}
              </span>
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
