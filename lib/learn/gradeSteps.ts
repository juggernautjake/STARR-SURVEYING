// lib/learn/gradeSteps.ts — marking a multi-part problem the way a human grader marks one.
//
// Owner, 2026-09-19: "There should be problems that require use to solve the different parts of the
// problem so that it can check each step of our process … It should be able to grade each part and
// should be able to show how to fully solve the problem and each part."
//
// And, on how strictly: "Grade each step, carry their answer forward. If step 1 is wrong, step 2 is
// marked against what THEY got, not the right answer."
//
// ── WHY CARRY-FORWARD IS THE WHOLE POINT ────────────────────────────────────────────────────────
//
// A traverse problem is five steps deep. Mistype one latitude in step 1 and every number after it
// is wrong — so a grader that marks each step against the TRUE answer reports five errors for one
// mistake, and tells a student their method is broken when their only fault was a keypress.
//
// Every surveying examiner marks the other way: check the arithmetic against what the candidate
// actually had in front of them. A step whose method is right and whose input was wrong earns the
// mark. That is what `carried` means here, and it earns the same credit as `correct` because the
// student did that step correctly.
//
// The distinction is still REPORTED, because it matters to the person studying: "your method was
// right, your number came from step 2" is a different lesson from "this step is correct".
//
// ── WHY `expected` AND `expectedFromTheirWork` ARE BOTH KEPT ────────────────────────────────────
//
// The first is what the step should be. The second is what it should be given what they had. When
// an earlier step is right the two are identical; when it is wrong they differ, and showing both is
// how the worked solution can say "8.41 — or 8.62 from your Δ N" without either number being a lie.
//
// Pure. `evalFormula` is imported rather than reimplemented: it is already how `answer_formula`
// works for the randomised templates, and a second expression evaluator would be a second set of
// rules about what `sqrt` means.

import { evalFormula } from '@/lib/problemEngine';

/** One part of a problem. */
export interface ProblemStep {
  /** Referenced by later steps' formulas, so it must be a legal identifier: `s1`, `dN`, `bearing`. */
  id: string;
  prompt: string;
  /** How the answer is computed, in terms of the problem's givens AND earlier step ids. */
  formula?: string;
  /** A fixed answer, for a step that computes from nothing. Ignored when `formula` is present. */
  answer?: number;
  unit?: string;
  /** Absolute tolerance. Surveying answers are rounded, so exact equality is the wrong test. */
  tolerance?: number;
  /** Shown after grading — how this step is done. */
  explanation?: string;
}

export type StepVerdict = 'correct' | 'carried' | 'wrong' | 'blank';

export interface StepResult {
  id: string;
  verdict: StepVerdict;
  given: number | null;
  /** What this step should be, done properly throughout. */
  expected: number;
  /** What it should be given the answers they actually entered earlier. */
  expectedFromTheirWork: number;
  tolerance: number;
  /** True when the two expectations differ — i.e. an earlier slip is being carried. */
  carriedFromEarlier: boolean;
}

export interface MultiStepResult {
  steps: StepResult[];
  /** 0..1. Carried steps count in full: the student did them right. */
  partialScore: number;
  correctCount: number;
  carriedCount: number;
  /** Whether the LAST step is right on its own terms, ignoring carry. What "did I solve it" means. */
  finalCorrect: boolean;
}

/** Surveying answers are rounded before they are written down; exact equality would fail them all. */
export const DEFAULT_STEP_TOLERANCE = 0.01;

/** A submitted answer, or null when the box was left empty. */
function parseGiven(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const within = (a: number, b: number, tol: number) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

/**
 * Grade a multi-part problem.
 *
 * `vars` are the problem's given quantities — the numbers printed in the question. Step answers are
 * added to that scope as they are computed, which is what lets step 3 say `sqrt(s1*s1 + s2*s2)`.
 *
 * A step with neither a formula nor an answer cannot be graded and is reported `blank`, never
 * silently counted right. Getting credit for a step nobody could mark is worse than getting none.
 */
export function gradeMultiStep(
  steps: readonly ProblemStep[],
  answers: Readonly<Record<string, unknown>>,
  vars: Readonly<Record<string, number>> = {},
): MultiStepResult {
  const truthScope: Record<string, number> = { ...vars };
  const theirScope: Record<string, number> = { ...vars };
  const results: StepResult[] = [];

  for (const step of steps) {
    const tolerance = Number.isFinite(Number(step.tolerance))
      ? Number(step.tolerance)
      : DEFAULT_STEP_TOLERANCE;

    // What it should be, if everything before it was right.
    const expected = step.formula
      ? evalFormula(step.formula, truthScope)
      : Number(step.answer);

    // What it should be, given what they actually entered. Identical until something goes wrong.
    const expectedFromTheirWork = step.formula
      ? evalFormula(step.formula, theirScope)
      : Number(step.answer);

    const given = parseGiven(answers[step.id]);

    let verdict: StepVerdict;
    if (given === null) {
      verdict = 'blank';
    } else if (!Number.isFinite(expected)) {
      // Nothing to mark against — a step with no formula and no answer, or a formula that will not
      // evaluate. Reported rather than credited.
      verdict = 'blank';
    } else if (within(given, expected, tolerance)) {
      verdict = 'correct';
    } else if (Number.isFinite(expectedFromTheirWork) && within(given, expectedFromTheirWork, tolerance)) {
      // The method is right; the input came from a step they got wrong. Full credit for this step.
      verdict = 'carried';
    } else {
      verdict = 'wrong';
    }

    // The scopes advance differently, and that is the mechanism. Truth always carries the true
    // value. Their scope carries THEIR number when they gave one — including a wrong one, which is
    // what makes the next step markable against their work — and falls back to the true value when
    // they left it blank, so one skipped step does not mark everything after it wrong.
    if (Number.isFinite(expected)) truthScope[step.id] = expected;
    theirScope[step.id] = given !== null ? given : (Number.isFinite(expected) ? expected : Number.NaN);

    results.push({
      id: step.id,
      verdict,
      given,
      expected,
      expectedFromTheirWork,
      tolerance,
      carriedFromEarlier: Number.isFinite(expected)
        && Number.isFinite(expectedFromTheirWork)
        && !within(expected, expectedFromTheirWork, tolerance),
    });
  }

  const correctCount = results.filter((r) => r.verdict === 'correct').length;
  const carriedCount = results.filter((r) => r.verdict === 'carried').length;

  return {
    steps: results,
    correctCount,
    carriedCount,
    // Carried counts in full. The student did that step correctly; the mark for the slip was
    // already taken on the step where it happened, and taking it again is marking once for the
    // error and once for its consequences.
    partialScore: results.length === 0 ? 0 : (correctCount + carriedCount) / results.length,
    finalCorrect: results.length > 0 && results[results.length - 1]!.verdict === 'correct',
  };
}

/** How a step's outcome should read on screen. */
export function verdictLabel(r: StepResult): string {
  switch (r.verdict) {
    case 'correct': return 'Correct';
    // Named for what happened, not for a grade. "Correct" would hide that the number came from a
    // step they got wrong, which is the one thing they most need to know.
    case 'carried': return 'Right method — carried from an earlier slip';
    case 'wrong': return 'Not right';
    default: return 'Not answered';
  }
}

/** The number to show as "the answer" for a step, once it has been marked. */
export function shownAnswer(r: StepResult): { value: number; note?: string } {
  if (r.carriedFromEarlier) {
    return {
      value: r.expected,
      note: `${r.expectedFromTheirWork.toFixed(3).replace(/\.?0+$/, '')} from your earlier figure`,
    };
  }
  return { value: r.expected };
}
