// app/admin/components/jobs/JobStageTimeline.tsx — Visual stage progression
'use client';

const STAGES = [
  { key: 'quote', label: 'Quote', icon: '💰' },
  { key: 'research', label: 'Research', icon: '🔍' },
  { key: 'fieldwork', label: 'Field Work', icon: '🏗️' },
  { key: 'drawing', label: 'Drawing', icon: '📐' },
  { key: 'legal', label: 'Legal', icon: '⚖️' },
  { key: 'delivery', label: 'Delivery', icon: '📦' },
  { key: 'completed', label: 'Complete', icon: '✅' },
];

interface StageHistoryEntry {
  from_stage?: string;
  to_stage: string;
  changed_by: string;
  notes?: string;
  created_at: string;
}

interface Props {
  currentStage: string;
  history?: StageHistoryEntry[];
  onAdvance?: (toStage: string) => void;
  canAdvance?: boolean;
}

export default function JobStageTimeline({ currentStage, history, onAdvance, canAdvance }: Props) {
  const currentIdx = STAGES.findIndex(s => s.key === currentStage);
  const isTerminal = currentStage === 'cancelled' || currentStage === 'on_hold';

  function getStageDate(stageKey: string): string | null {
    if (!history) return null;
    const entry = history.find(h => h.to_stage === stageKey);
    return entry ? new Date(entry.created_at).toLocaleDateString() : null;
  }

  return (
    <div className="job-timeline">
      {isTerminal && (
        <div className="job-timeline__terminal">
          <span className="job-timeline__terminal-badge" data-stage={currentStage}>
            {currentStage === 'cancelled' ? '❌ Cancelled' : '⏸️ On Hold'}
          </span>
        </div>
      )}

      <div className="job-timeline__track">
        {STAGES.map((stage, idx) => {
          const isPast = idx < currentIdx;
          const isCurrent = idx === currentIdx && !isTerminal;
          const isFuture = idx > currentIdx || isTerminal;
          const stageDate = getStageDate(stage.key);

          return (
            <div
              key={stage.key}
              className={`job-timeline__stage ${isPast ? 'job-timeline__stage--past' : ''} ${isCurrent ? 'job-timeline__stage--current' : ''} ${isFuture ? 'job-timeline__stage--future' : ''}`}
            >
              <div className="job-timeline__connector">
                {idx > 0 && <div className={`job-timeline__line ${isPast || isCurrent ? 'job-timeline__line--active' : ''}`} />}
              </div>
              <div className="job-timeline__dot">
                <span className="job-timeline__icon">{isPast ? '✓' : stage.icon}</span>
              </div>
              <div className="job-timeline__label">{stage.label}</div>
              {stageDate && <div className="job-timeline__date">{stageDate}</div>}
            </div>
          );
        })}
      </div>

      {canAdvance && !isTerminal && currentIdx < STAGES.length - 1 && (
        <div className="job-timeline__advance">
          <button
            className="job-timeline__advance-btn"
            onClick={() => onAdvance?.(STAGES[currentIdx + 1].key)}
          >
            Advance to {STAGES[currentIdx + 1].label} →
          </button>
        </div>
      )}
    </div>
  );
}

export { STAGES };
