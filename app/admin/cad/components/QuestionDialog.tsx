'use client';
// app/admin/cad/components/QuestionDialog.tsx
//
// Phase 6 §28.4 — clarifying-question dialog. Surfaces the
// `deliberationResult.questions` queue from the AI store as a
// stepped modal:
//   * Blocking questions are listed first and must be answered
//     before the user can press "Draw Now".
//   * Optional questions can be skipped individually or via
//     "Skip All Optional".
//   * Each step shows the question text, the AI's reasoning,
//     and an answer control matched to `answerType`.
//
// Auto-opens once when `setResult` lands a deliberation flagged
// as `shouldShowDialog`. Closing the dialog without answering
// every blocking question keeps it accessible from the menu so
// the surveyor can come back later.
//
// "Draw Now" simply closes the dialog in this slice. Pipeline
// re-run with answers folded back lands in a follow-up.

import { useMemo, useState } from 'react';

import { useAIStore } from '@/lib/cad/store';
import type {
  ClarifyingQuestion,
  QuestionPriority,
} from '@/lib/cad/ai-engine/types';

export default function QuestionDialog() {
  const isOpen = useAIStore((s) => s.isQuestionDialogOpen);
  const close = useAIStore((s) => s.closeQuestionDialog);
  const result = useAIStore((s) => s.result);
  const setAnswer = useAIStore((s) => s.setQuestionAnswer);
  const setSkipped = useAIStore((s) => s.setQuestionSkipped);
  const skipAll = useAIStore((s) => s.skipAllOptionalQuestions);

  const [stepIndex, setStepIndex] = useState(0);

  const ordered = useMemo<ClarifyingQuestion[]>(() => {
    const d = result?.deliberationResult;
    if (!d) return [];
    return [...d.blockingQuestions, ...d.optionalQuestions];
  }, [result]);

  if (!isOpen || !result?.deliberationResult || ordered.length === 0) {
    return null;
  }

  const totalCount = ordered.length;
  const blockingCount = result.deliberationResult.blockingQuestions.length;
  const overall = Math.round(result.deliberationResult.overallConfidence);
  const safeIndex = Math.min(stepIndex, totalCount - 1);
  const question = ordered[safeIndex];
  const isBlocking = question.priority === 'BLOCKING';
  const blockingPending = ordered.filter(
    (q) => q.priority === 'BLOCKING' && !q.userAnswer
  ).length;
  const canDrawNow = blockingPending === 0;

  return (
    <div style={styles.backdrop}>
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="AI clarifying questions"
      >
        <header style={styles.header}>
          <div>
            <h2 style={styles.title}>AI Drawing Questions</h2>
            <p style={styles.subtitle}>
              Answer to improve drawing accuracy. Blocking
              questions (⛔) must be answered.
            </p>
          </div>
          <button
            type="button"
            style={styles.skipAll}
            onClick={skipAll}
            disabled={ordered.every(
              (q) => q.priority === 'BLOCKING' || q.skipped || q.userAnswer
            )}
          >
            Skip All Optional
          </button>
        </header>

        <div style={styles.confidenceRow}>
          <span style={styles.confidenceLabel}>Overall Confidence</span>
          <div style={styles.confidenceBar}>
            <div
              style={{
                ...styles.confidenceFill,
                width: `${overall}%`,
                background: confidenceColor(overall),
              }}
            />
          </div>
          <span style={styles.confidenceValue}>{overall}%</span>
        </div>

        <div style={styles.stepNav}>
          <span style={styles.stepNavCount}>
            {priorityBadge(question.priority)} {safeIndex + 1} of{' '}
            {totalCount} — {humanCategory(question.category)}
          </span>
          <span style={styles.stepBlockingNote}>
            {blockingCount} blocking · {blockingPending} pending
          </span>
        </div>

        <div style={styles.body}>
          <p style={styles.questionText}>{question.question}</p>
          <p style={styles.reasoning}>
            <strong>Why:</strong> {question.aiReasoning}
          </p>

          <AnswerControl
            question={question}
            onAnswer={(answer) => setAnswer(question.id, answer)}
          />

          {!isBlocking ? (
            <label style={styles.skipToggle}>
              <input
                type="checkbox"
                checked={question.skipped}
                onChange={(e) =>
                  setSkipped(question.id, e.target.checked)
                }
              />
              <span>Skip this question</span>
            </label>
          ) : null}
        </div>

        <footer style={styles.footer}>
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={safeIndex === 0}
            style={
              safeIndex === 0 ? styles.navBtnDisabled : styles.navBtn
            }
          >
            ← Previous
          </button>
          <div style={styles.footerSpacer} />
          <button
            type="button"
            onClick={() =>
              setStepIndex((i) => Math.min(totalCount - 1, i + 1))
            }
            disabled={safeIndex === totalCount - 1}
            style={
              safeIndex === totalCount - 1
                ? styles.navBtnDisabled
                : styles.navBtn
            }
          >
            Next →
          </button>
          <button
            type="button"
            onClick={close}
            disabled={!canDrawNow}
            style={
              canDrawNow ? styles.drawNowBtn : styles.drawNowBtnDisabled
            }
            title={
              canDrawNow
                ? 'All blocking questions answered — proceed to drawing'
                : `Answer the ${blockingPending} blocking question(s) first`
            }
          >
            {canDrawNow ? 'Draw Now' : `${blockingPending} blocking left`}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Answer controls — one per QuestionAnswerType
// ────────────────────────────────────────────────────────────

function AnswerControl({
  question,
  onAnswer,
}: {
  question: ClarifyingQuestion;
  onAnswer: (answer: string) => void;
}) {
  const value = question.userAnswer ?? question.suggestedAnswer ?? '';

  switch (question.answerType) {
    case 'SELECT':
      return (
        <div style={styles.optionList}>
          {(question.options ?? []).map((opt) => {
            const selected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onAnswer(opt)}
                style={
                  selected ? styles.optionBtnSelected : styles.optionBtn
                }
              >
                {selected ? '● ' : '○ '} {opt}
              </button>
            );
          })}
        </div>
      );
    case 'CONFIRM':
      return (
        <div style={styles.optionList}>
          {(question.options ?? ['Yes', 'No', 'Not sure']).map((opt) => {
            const selected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onAnswer(opt)}
                style={
                  selected ? styles.optionBtnSelected : styles.optionBtn
                }
              >
                {selected ? '● ' : '○ '} {opt}
              </button>
            );
          })}
        </div>
      );
    case 'NUMBER':
      return (
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => onAnswer(e.target.value)}
          style={styles.input}
          placeholder="Enter a number"
        />
      );
    case 'POINT_SELECT':
      // Real point-pick lives on the canvas; for now we accept a
      // typed point name so the answer is still captured.
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onAnswer(e.target.value)}
          style={styles.input}
          placeholder="Enter the point name (e.g. 8 or BC02 20fnd)"
        />
      );
    case 'TEXT':
    default:
      return (
        <textarea
          value={value}
          onChange={(e) => onAnswer(e.target.value)}
          rows={3}
          style={styles.textarea}
          placeholder="Type your answer"
        />
      );
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function priorityBadge(p: QuestionPriority): string {
  switch (p) {
    case 'BLOCKING':
      return '⛔';
    case 'HIGH':
      return '⚠️';
    case 'MEDIUM':
      return '💡';
    case 'LOW':
    default:
      return '◦';
  }
}

function humanCategory(c: ClarifyingQuestion['category']): string {
  switch (c) {
    case 'DEED_DISCREPANCY':
      return 'DEED DISCREPANCY';
    case 'OFFSET_DISAMBIGUATION':
      return 'OFFSET DISAMBIGUATION';
    case 'CODE_AMBIGUITY':
      return 'CODE AMBIGUITY';
    case 'POSSIBLE_TYPO':
      return 'POSSIBLE TYPO';
    case 'DUPLICATE_SHOT':
      return 'DUPLICATE SHOT';
    case 'MISSING_FEATURE':
      return 'MISSING FEATURE';
    case 'FEATURE_ATTRIBUTE':
      return 'FEATURE ATTRIBUTE';
    case 'MONUMENT_INFO':
      return 'MONUMENT INFO';
    case 'AREA_MISMATCH':
      return 'AREA MISMATCH';
    case 'AREA_ENCLOSURE':
      return 'AREA ENCLOSURE';
    case 'CONNECTION_AMBIGUITY':
      return 'CONNECTION AMBIGUITY';
  }
}

function confidenceColor(score: number): string {
  if (score >= 95) return '#16A34A';
  if (score >= 80) return '#65A30D';
  if (score >= 60) return '#CA8A04';
  if (score >= 40) return '#EA580C';
  return '#DC2626';
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 60,
    zIndex: 1100,
  },
  modal: {
    background: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 720,
    maxHeight: 'calc(100vh - 120px)',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 20px',
    borderBottom: '1px solid #E2E5EB',
  },
  title: { fontSize: 16, fontWeight: 600, margin: 0 },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 1.4,
  },
  skipAll: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: 11,
    color: '#374151',
    whiteSpace: 'nowrap',
  },
  confidenceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 20px',
    borderBottom: '1px solid #F1F2F4',
  },
  confidenceLabel: { fontSize: 11, color: '#6B7280', minWidth: 130 },
  confidenceBar: {
    flex: 1,
    height: 8,
    background: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  confidenceFill: { height: '100%', borderRadius: 4 },
  confidenceValue: {
    fontSize: 12,
    fontWeight: 600,
    color: '#111827',
    minWidth: 36,
    textAlign: 'right',
  },
  stepNav: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 20px',
    fontSize: 11,
    color: '#6B7280',
    background: '#FAFBFC',
    borderBottom: '1px solid #F1F2F4',
  },
  stepNavCount: { fontWeight: 600, color: '#111827' },
  stepBlockingNote: { fontStyle: 'italic' },
  body: {
    padding: 20,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  questionText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 500,
    color: '#111827',
    lineHeight: 1.5,
  },
  reasoning: {
    margin: 0,
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 1.5,
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: 6,
    padding: 10,
  },
  optionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  optionBtn: {
    textAlign: 'left',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #E2E5EB',
    background: '#FFFFFF',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
  },
  optionBtnSelected: {
    textAlign: 'left',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #1D3095',
    background: '#EEF2FF',
    cursor: 'pointer',
    fontSize: 13,
    color: '#1D3095',
    fontWeight: 600,
  },
  input: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
  },
  textarea: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  skipToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#6B7280',
    paddingTop: 4,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 20px',
    borderTop: '1px solid #E2E5EB',
    background: '#FAFBFC',
    borderRadius: '0 0 12px 12px',
  },
  footerSpacer: { flex: 1 },
  navBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#374151',
  },
  navBtnDisabled: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'not-allowed',
    fontSize: 12,
    color: '#9CA3AF',
    opacity: 0.6,
  },
  drawNowBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  drawNowBtnDisabled: {
    background: '#9CA3AF',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'not-allowed',
    fontSize: 13,
    fontWeight: 500,
    opacity: 0.6,
  },
};
