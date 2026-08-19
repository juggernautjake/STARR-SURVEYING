// app/admin/components/jobs/JobStageTimeline.tsx — the stages, and getting to any of them.
//
// Owner, 2026-08-19: *"In the job flow, we need to be able to go back to previous stages of the job
// at any time. If I set the initial stage to drawing, I should still be able to click on the
// research stage and open up that page."*
//
// ── WHAT WAS WRONG ──────────────────────────────────────────────────────────────────────────────
//
// Every stage was a `<div>`. Not a disabled button, not a gated link — a div. Nothing on this
// timeline was clickable at all, and the single control moved the job FORWARD one stage. So a job
// created at `drawing` could never look at its research, and a job that went to `fieldwork` too
// early could never be put back. The API had no such restriction — it accepts any `to_stage` — so
// this was purely an interface that had never been given the affordance.
//
// ── THE DISTINCTION THIS COMPONENT NOW MAKES ────────────────────────────────────────────────────
//
// Two different things somebody means by "click on the research stage":
//
//   OPEN it   — show me the research work. Always available, for every stage, in any order. This is
//               the common case and it is now the plain single click, because looking at a stage is
//               not a change to the job and must not feel like one.
//   MOVE to it — the job IS at research now. That is a real edit: it stamps the job, writes history
//               and notifies people. It is a separate, deliberate control.
//
// Collapsing those two would mean either that browsing silently re-stages the job, or that looking
// at last month's research requires an edit. Both are worse than one extra button.

'use client';

import { useState } from 'react';

const STAGES = [
  // `tab` is where this stage's work actually lives on the job page. Opening a stage means opening
  // that tab — the stage names a phase of work, and the phase has a home.
  { key: 'quote', label: 'Quote', icon: '💰', tab: 'financial' },
  { key: 'research', label: 'Research', icon: '🔍', tab: 'research' },
  { key: 'fieldwork', label: 'Field Work', icon: '🏗️', tab: 'fieldwork' },
  { key: 'drawing', label: 'Drawing', icon: '📐', tab: 'cad' },
  { key: 'legal', label: 'Legal', icon: '⚖️', tab: 'files' },
  { key: 'delivery', label: 'Delivery', icon: '📦', tab: 'files' },
  { key: 'completed', label: 'Complete', icon: '✅', tab: 'overview' },
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
  /** Move the job to a stage. Any stage, in any direction — see `onOpen` for the other verb. */
  onAdvance?: (toStage: string) => void;
  canAdvance?: boolean;
  /** Show a stage's work. Never changes the job. */
  onOpen?: (tab: string) => void;
}

export default function JobStageTimeline({ currentStage, history, onAdvance, canAdvance, onOpen }: Props) {
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);
  const isTerminal = currentStage === 'cancelled' || currentStage === 'on_hold';
  // Which stage's "move here" control is showing. Only one at a time, and never by default: the
  // click that opens a stage must not put a job-changing button under the next click.
  const [menuFor, setMenuFor] = useState<string | null>(null);

  function getStageDate(stageKey: string): string | null {
    if (!history) return null;
    const entry = history.find((h) => h.to_stage === stageKey);
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

              {/* A real button. Opening a stage is always allowed, in any direction — a future
                  stage's page is as readable as a past one's, and refusing would only mean the
                  crew opens the tab from the tab strip instead and wonders why the dot was dead. */}
              <button
                type="button"
                className="job-timeline__open"
                onClick={() => onOpen?.(stage.tab)}
                title={`Open ${stage.label}`}
                aria-label={`Open ${stage.label}`}
                data-testid={`stage-open-${stage.key}`}
              >
                <span className="job-timeline__dot">
                  <span className="job-timeline__icon">{isPast ? '✓' : stage.icon}</span>
                </span>
                <span className="job-timeline__label">{stage.label}</span>
              </button>

              {stageDate && <div className="job-timeline__date">{stageDate}</div>}

              {/* The second verb, kept deliberately separate from the first. */}
              {canAdvance && !isCurrent && (
                menuFor === stage.key ? (
                  <div className="job-timeline__setrow">
                    <button
                      type="button"
                      className="job-timeline__set job-timeline__set--confirm"
                      onClick={() => { onAdvance?.(stage.key); setMenuFor(null); }}
                      data-testid={`stage-set-${stage.key}`}
                    >
                      {isPast ? `Move back to ${stage.label}` : `Set to ${stage.label}`}
                    </button>
                    <button type="button" className="job-timeline__set" onClick={() => setMenuFor(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="job-timeline__set"
                    onClick={() => setMenuFor(stage.key)}
                    data-testid={`stage-setmenu-${stage.key}`}
                  >
                    {isPast ? '↩ Move back here' : 'Set as current'}
                  </button>
                )
              )}
              {isCurrent && <div className="job-timeline__here">Current stage</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
