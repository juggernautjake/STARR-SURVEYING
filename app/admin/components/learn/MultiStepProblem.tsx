'use client';

// app/admin/components/learn/MultiStepProblem.tsx — a problem you solve a part at a time.
//
// Owner, 2026-09-19: "There should be problems that require use to solve the different parts of the
// problem so that it can check each step of our process … It should be able to grade each part and
// should be able to show how to fully solve the problem and each part."
//
// ── EVERY PART IS ON SCREEN FROM THE START ──────────────────────────────────────────────────────
//
// Not revealed one at a time. The shape of the method — latitude, then departure, then Pythagoras —
// IS most of what is being taught here, and hiding it turns a worked procedure into a guessing game
// about what comes next. Somebody who wants the exam experience can cover the boxes; somebody
// learning the method needs to see that it has three parts before they start.
//
// The grading rule lives in `lib/learn/gradeSteps.ts`, where it is tested without a browser. This
// file is the part that has to look right.

import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, CornerDownRight, RotateCcw, Lightbulb } from 'lucide-react';
import {
  gradeMultiStep, verdictLabel, shownAnswer,
  type ProblemStep, type MultiStepResult,
} from '@/lib/learn/gradeSteps';

export interface MultiStepProblemProps {
  /** The question as it reads, before any of the parts. */
  statement: string;
  steps: ProblemStep[];
  /** The numbers printed in the statement, which the step formulas compute from. */
  givenVars?: Record<string, number>;
  difficulty?: string;
  /** Shown once the whole thing has been marked. */
  explanation?: string;
  /** So a caller can record the attempt. Called once per submission, never on a retry. */
  onGraded?: (result: MultiStepResult) => void;
  /** Ask the tutor about this problem, with the problem as the context. */
  onAskTutor?: (prompt: string) => void;
}

const nice = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  // Trailing zeros on a surveyed figure are noise; 500 should not read as 500.000.
  const r = Math.round(n * 1000) / 1000;
  return String(r);
};

export default function MultiStepProblem({
  statement, steps, givenVars = {}, difficulty, explanation, onGraded, onAskTutor,
}: MultiStepProblemProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<MultiStepResult | null>(null);
  const [showWorked, setShowWorked] = useState(false);

  const marked = result !== null;
  const anyAnswered = useMemo(
    () => steps.some((s) => (answers[s.id] ?? '').trim() !== ''),
    [steps, answers],
  );

  const submit = useCallback(() => {
    const r = gradeMultiStep(steps, answers, givenVars);
    setResult(r);
    // Revealed automatically on submit. Somebody who has just been told a step is wrong wants to
    // know why, and making them press a second button for it is a step between them and the point.
    setShowWorked(true);
    onGraded?.(r);
  }, [steps, answers, givenVars, onGraded]);

  const retry = useCallback(() => {
    setAnswers({});
    setResult(null);
    setShowWorked(false);
  }, []);

  return (
    <div className="mstep" data-testid="multi-step-problem">
      <div className="mstep__head">
        <span className="mstep__badge">{steps.length} {steps.length === 1 ? 'part' : 'parts'}</span>
        {difficulty && <span className={`mstep__badge mstep__badge--${difficulty}`}>{difficulty}</span>}
        {marked && (
          <span className="mstep__score" aria-live="polite">
            {result.correctCount + result.carriedCount} of {result.steps.length} parts
            {result.carriedCount > 0 && ` (${result.carriedCount} carried)`}
          </span>
        )}
      </div>

      <p className="mstep__statement">{statement}</p>

      <ol className="mstep__steps">
        {steps.map((step, i) => {
          const r = result?.steps[i];
          const shown = r ? shownAnswer(r) : null;
          return (
            <li key={step.id} className={`mstep__step${r ? ` mstep__step--${r.verdict}` : ''}`}>
              <div className="mstep__step-head">
                <span className="mstep__step-n">{i + 1}</span>
                <span className="mstep__step-prompt">{step.prompt}</span>
              </div>

              <div className="mstep__step-answer">
                <input
                  type="text"
                  inputMode="decimal"
                  className="mstep__input"
                  value={answers[step.id] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [step.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !marked) submit(); }}
                  disabled={marked}
                  placeholder="Your answer"
                  aria-label={`Part ${i + 1}: ${step.prompt}`}
                  data-testid={`mstep-input-${step.id}`}
                />
                {step.unit && <span className="mstep__unit">{step.unit}</span>}
                {r && (
                  <span className={`mstep__verdict mstep__verdict--${r.verdict}`}>
                    {r.verdict === 'correct' && <CheckCircle2 size={14} aria-hidden />}
                    {r.verdict === 'carried' && <CornerDownRight size={14} aria-hidden />}
                    {r.verdict === 'wrong' && <XCircle size={14} aria-hidden />}
                    {verdictLabel(r)}
                  </span>
                )}
              </div>

              {/* The worked step. Shown after marking, never before — it is the answer. */}
              {showWorked && r && (
                <div className="mstep__worked">
                  <div className="mstep__worked-answer">
                    <strong>{nice(shown!.value)}{step.unit ? ` ${step.unit}` : ''}</strong>
                    {/* The one line that makes carry-forward legible: what it should have been, and
                        what their own figures led to. */}
                    {shown!.note && <span className="mstep__worked-note"> — {shown!.note}</span>}
                  </div>
                  {step.formula && <code className="mstep__worked-formula">{step.formula}</code>}
                  {step.explanation && <p className="mstep__worked-why">{step.explanation}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mstep__actions">
        {!marked ? (
          <button
            type="button"
            className="mstep__btn mstep__btn--primary"
            onClick={submit}
            disabled={!anyAnswered}
            data-testid="mstep-submit"
          >
            Check my work
          </button>
        ) : (
          <>
            <button type="button" className="mstep__btn" onClick={retry} data-testid="mstep-retry">
              <RotateCcw size={14} aria-hidden /> Try again
            </button>
            {onAskTutor && (
              <button
                type="button"
                className="mstep__btn"
                onClick={() => onAskTutor(`I am working on this problem:\n\n${statement}\n\nI got ${result.correctCount + result.carriedCount} of ${result.steps.length} parts. Can you walk me through the ones I missed?`)}
                data-testid="mstep-ask"
              >
                <Lightbulb size={14} aria-hidden /> Ask the tutor
              </button>
            )}
          </>
        )}
        {!marked && !anyAnswered && (
          <span className="mstep__hint">Answer at least one part to check your work.</span>
        )}
      </div>

      {marked && explanation && (
        <div className="mstep__explain">
          <strong>How this problem works</strong>
          <p>{explanation}</p>
        </div>
      )}

      {/* Said once, at the bottom, rather than beside every carried step. Somebody meeting this
          grading for the first time needs it explained; somebody on their tenth problem does not
          need it repeated three times on one page. */}
      {marked && result.carriedCount > 0 && (
        <p className="mstep__carry-note">
          A carried part means your working was right for the figure you had. The mark for the
          earlier slip is taken once, where it happened — not again on everything after it.
        </p>
      )}
    </div>
  );
}
