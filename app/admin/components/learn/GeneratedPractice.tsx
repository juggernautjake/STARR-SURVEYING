'use client';

// app/admin/components/learn/GeneratedPractice.tsx — practice that does not run out.
//
// Owner, 2026-09-20: "Make sure we are able to generate new problems and that they all work every
// time and that the grading works every time too."
//
// ── IT GENERATES IN THE BROWSER, AND THAT IS THE POINT ──────────────────────────────────────────
//
// No fetch, no queue, no loading state. `generate(template, seed)` is a pure function and grading is
// already done in the browser by `gradeMultiStep`, so "new numbers" is instant. A round trip for
// each drill would put a spinner between a student and the next repetition, which is exactly where
// a spinner does the most damage — drilling is a rhythm, and the rhythm is the useful part.
//
// It also means this keeps working with no connection, on a phone, in a truck.
//
// ── THE SEED IS SHOWN ON PURPOSE ────────────────────────────────────────────────────────────────
//
// A problem is (template, seed) and nothing else, so the number under the problem is enough to get
// that exact problem back. It is there so a question about a specific drill can be asked precisely
// — "seed 41839 marked my answer wrong" is reproducible, and "a curve problem graded wrong this
// morning" is not.

import { useCallback, useMemo, useState } from 'react';
import { Shuffle, Dices, ArrowRight } from 'lucide-react';
import MultiStepProblem from '@/app/admin/components/learn/MultiStepProblem';
import {
  generate, templatesForModule, PROBLEM_TEMPLATES, type GeneratedProblem,
} from '@/lib/learn/problemTemplates';
import type { MultiStepResult } from '@/lib/learn/gradeSteps';
import { revealStyle } from '@/lib/learn/reveal';

export interface GeneratedPracticeProps {
  /** Restrict to one module's templates. Omitted means the whole bank. */
  moduleNumber?: number;
  onGraded?: (problem: GeneratedProblem, result: MultiStepResult) => void;
}

/** A seed that is short enough to read out loud and long enough not to repeat. */
function freshSeed(): number {
  return Math.floor(Math.random() * 90000) + 10000;
}

export default function GeneratedPractice({ moduleNumber, onGraded }: GeneratedPracticeProps) {
  const templates = useMemo(
    () => (moduleNumber ? templatesForModule(moduleNumber) : PROBLEM_TEMPLATES),
    [moduleNumber],
  );

  const [templateId, setTemplateId] = useState<string>(() => templates[0]?.id ?? '');
  const [seed, setSeed] = useState<number>(freshSeed);
  const [tally, setTally] = useState({ done: 0, solved: 0 });

  const template = templates.find((t) => t.id === templateId) ?? templates[0];

  /**
   * The problem itself.
   *
   * `generate` throws rather than return something that failed its own validity check — which is
   * right, and means this has to cope. A thrown template is a bug in the template and the honest
   * thing on screen is to say so and offer another, not to render a blank panel.
   */
  const problem = useMemo<GeneratedProblem | { error: string } | null>(() => {
    if (!template) return null;
    try {
      return generate(template, seed);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [template, seed]);

  const newNumbers = useCallback(() => setSeed(freshSeed()), []);

  const shuffleTemplate = useCallback(() => {
    if (templates.length === 0) return;
    // A different template from the current one wherever there is one to pick.
    const others = templates.filter((t) => t.id !== templateId);
    const pick = (others.length ? others : templates)[Math.floor(Math.random() * (others.length || templates.length))];
    setTemplateId(pick.id);
    setSeed(freshSeed());
  }, [templates, templateId]);

  const handleGraded = useCallback((result: MultiStepResult) => {
    if (problem && !('error' in problem)) {
      setTally((t) => ({ done: t.done + 1, solved: t.solved + (result.partialScore === 1 ? 1 : 0) }));
      onGraded?.(problem, result);
    }
  }, [problem, onGraded]);

  if (templates.length === 0) {
    return (
      <div className="genprac genprac--empty">
        <p>
          No generated drills for this module yet. The written problem set still covers it — this is
          the endless-repetition mode, and it is only worth adding where repetition is what helps.
        </p>
      </div>
    );
  }

  return (
    <div className="genprac" data-testid="generated-practice">
      <div className="genprac__bar">
        <label className="genprac__pick">
          <span className="genprac__pick-label">Drill</span>
          <select
            id="genprac-template"
            value={template?.id ?? ''}
            onChange={(e) => { setTemplateId(e.target.value); setSeed(freshSeed()); }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </label>

        <div className="genprac__actions">
          <button type="button" className="genprac__btn" onClick={newNumbers} data-testid="genprac-new">
            <Dices size={14} aria-hidden /> New numbers
          </button>
          {templates.length > 1 && (
            <button type="button" className="genprac__btn" onClick={shuffleTemplate} data-testid="genprac-shuffle">
              <Shuffle size={14} aria-hidden /> Different drill
            </button>
          )}
        </div>

        {tally.done > 0 && (
          <p className="genprac__tally" aria-live="polite">
            <strong>{tally.solved}</strong> of <strong>{tally.done}</strong> fully solved
          </p>
        )}
      </div>

      {problem === null ? null : 'error' in problem ? (
        <div className="genprac__error" role="status">
          <p><strong>That drill could not be built.</strong> {problem.error}</p>
          <button type="button" className="genprac__btn" onClick={newNumbers}>
            <ArrowRight size={14} aria-hidden /> Try another
          </button>
        </div>
      ) : (
        <>
          <div className="genprac__problem reveal-item" style={revealStyle(0, { total: 2 })}>
            <MultiStepProblem
              // Keyed on template AND seed: a new problem must be a new component, or the answers
              // typed into the last one would still be sitting in the boxes.
              key={`${problem.templateId}-${problem.seed}`}
              statement={problem.statement}
              steps={problem.steps}
              givenVars={problem.given}
              difficulty={problem.difficulty}
              explanation={problem.explanation}
              onGraded={handleGraded}
            />
          </div>
          <p className="genprac__seed reveal-item" style={revealStyle(1, { total: 2 })}>
            {problem.title} · seed {problem.seed}
          </p>
        </>
      )}
    </div>
  );
}
