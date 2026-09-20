// Marking a multi-part problem the way an examiner marks one.
//
// Owner, 2026-09-19: "There should be problems that require use to solve the different parts of the
// problem so that it can check each step of our process" — graded "each step, carry their answer
// forward. If step 1 is wrong, step 2 is marked against what THEY got, not the right answer."
//
// A traverse is five steps deep. Mistype one latitude and every number after it is wrong, so a
// grader that marks against the true answer throughout reports five errors for one keypress. Nearly
// all of what follows is about that.
import { describe, it, expect } from 'vitest';
import {
  gradeMultiStep, verdictLabel, shownAnswer, DEFAULT_STEP_TOLERANCE,
  type ProblemStep,
} from '@/lib/learn/gradeSteps';

/** Inverse between two coordinates — the archetypal three-step FS problem. */
const INVERSE: ProblemStep[] = [
  { id: 'dN', prompt: 'Compute ΔN', formula: 'bN - aN', unit: 'ft' },
  { id: 'dE', prompt: 'Compute ΔE', formula: 'bE - aE', unit: 'ft' },
  { id: 'dist', prompt: 'Compute the distance', formula: 'sqrt(dN*dN + dE*dE)', unit: 'ft', tolerance: 0.05 },
];
const GIVENS = { aN: 1000, aE: 2000, bN: 1300, bE: 2400 };
// ΔN = 300, ΔE = 400, distance = 500 exactly.

describe('marking every part', () => {
  it('marks a clean run correct throughout', () => {
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 400, dist: 500 }, GIVENS);
    expect(r.steps.map((s) => s.verdict)).toEqual(['correct', 'correct', 'correct']);
    expect(r.partialScore).toBe(1);
    expect(r.finalCorrect).toBe(true);
  });

  it('marks each part on its own, not just the final answer', () => {
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 999, dist: 500 }, GIVENS);
    expect(r.steps[0]!.verdict).toBe('correct');
    expect(r.steps[1]!.verdict).toBe('wrong');
  });

  it('gives partial credit rather than pass or fail', () => {
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 999, dist: 0 }, GIVENS);
    expect(r.partialScore).toBeCloseTo(1 / 3, 5);
  });
});

describe('carrying an error forward', () => {
  it('credits a step whose method is right but whose input came from a slip', () => {
    // ΔE typed as 300 instead of 400. √(300² + 300²) = 424.26 — right arithmetic, wrong input.
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 300, dist: 424.26 }, GIVENS);
    expect(r.steps[1]!.verdict, 'the slip itself is still wrong').toBe('wrong');
    expect(r.steps[2]!.verdict, 'but the step built on it is credited').toBe('carried');
  });

  it('counts a carried step in full', () => {
    // The mark for the slip was taken on the step where it happened. Taking it again on every
    // later step is marking once for the error and once for its consequences.
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 300, dist: 424.26 }, GIVENS);
    expect(r.carriedCount).toBe(1);
    expect(r.partialScore).toBeCloseTo(2 / 3, 5);
  });

  it('still refuses the real answer when their own work does not lead there', () => {
    // 500 is the TRUE distance, but from their ΔE of 300 it is not what they should have got.
    // It is still marked correct, because being right is being right.
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 300, dist: 500 }, GIVENS);
    expect(r.steps[2]!.verdict).toBe('correct');
  });

  it('marks a step wrong when neither the true nor the carried value fits', () => {
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 300, dist: 111 }, GIVENS);
    expect(r.steps[2]!.verdict).toBe('wrong');
  });

  it('carries through several steps, not just one', () => {
    const chain: ProblemStep[] = [
      { id: 'a', prompt: 'a', formula: 'x * 2' },
      { id: 'b', prompt: 'b', formula: 'a + 10' },
      { id: 'c', prompt: 'c', formula: 'b * 3' },
    ];
    // x=5 → a=10, b=20, c=60. They answer a=12 (wrong), then carry perfectly: b=22, c=66.
    const r = gradeMultiStep(chain, { a: 12, b: 22, c: 66 }, { x: 5 });
    expect(r.steps.map((s) => s.verdict)).toEqual(['wrong', 'carried', 'carried']);
    expect(r.partialScore).toBeCloseTo(2 / 3, 5);
  });

  it('says when a step’s expectation moved because of an earlier answer', () => {
    // What lets the worked solution say "500 — or 424.26 from your ΔE" without either being a lie.
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 300, dist: 424.26 }, GIVENS);
    const last = r.steps[2]!;
    expect(last.carriedFromEarlier).toBe(true);
    expect(last.expected).toBeCloseTo(500, 2);
    expect(last.expectedFromTheirWork).toBeCloseTo(424.26, 1);
  });

  it('does not claim a carry when nothing went wrong', () => {
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 400, dist: 500 }, GIVENS);
    expect(r.steps.every((s) => !s.carriedFromEarlier)).toBe(true);
  });
});

describe('the answers people actually give', () => {
  it('treats an empty box as unanswered, never as wrong-and-credited', () => {
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: '', dist: null }, GIVENS);
    expect(r.steps[1]!.verdict).toBe('blank');
    expect(r.steps[2]!.verdict).toBe('blank');
    expect(r.partialScore).toBeCloseTo(1 / 3, 5);
  });

  it('does not mark everything after a skipped step wrong', () => {
    // They skipped ΔE but did the distance correctly from the true figures. Punishing that would
    // teach people to guess rather than leave a box empty.
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: '', dist: 500 }, GIVENS);
    expect(r.steps[2]!.verdict).toBe('correct');
  });

  it('accepts a number typed with a comma', () => {
    const r = gradeMultiStep([{ id: 'v', prompt: 'v', formula: 'n' }], { v: '1,250' }, { n: 1250 });
    expect(r.steps[0]!.verdict).toBe('correct');
  });

  it('rejects text that is not a number', () => {
    const r = gradeMultiStep([{ id: 'v', prompt: 'v', formula: 'n' }], { v: 'about 500' }, { n: 500 });
    expect(r.steps[0]!.verdict).toBe('blank');
  });

  it('uses a tolerance, because surveying answers are rounded before they are written down', () => {
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 400, dist: 500.04 }, GIVENS);
    expect(r.steps[2]!.verdict, 'inside the step’s 0.05 ft').toBe('correct');
    const r2 = gradeMultiStep(INVERSE, { dN: 300, dE: 400, dist: 500.5 }, GIVENS);
    expect(r2.steps[2]!.verdict).toBe('wrong');
  });

  it('defaults the tolerance when a step does not set one', () => {
    const r = gradeMultiStep([{ id: 'v', prompt: 'v', formula: 'n' }], { v: 10 }, { n: 10 });
    expect(r.steps[0]!.tolerance).toBe(DEFAULT_STEP_TOLERANCE);
  });
});

describe('a problem that cannot be marked', () => {
  it('reports a step with no formula and no answer as unmarked, never as correct', () => {
    // Credit for a step nobody could mark is worse than no credit: it tells somebody they have
    // understood something that was never checked.
    const r = gradeMultiStep([{ id: 'v', prompt: 'Describe your method' }], { v: 42 }, {});
    expect(r.steps[0]!.verdict).toBe('blank');
    expect(r.partialScore).toBe(0);
  });

  it('survives a formula that will not evaluate', () => {
    const r = gradeMultiStep([{ id: 'v', prompt: 'v', formula: 'this is not maths(((' }], { v: 1 }, {});
    expect(r.steps[0]!.verdict).toBe('blank');
  });

  it('has an answer for a problem with no steps at all', () => {
    const r = gradeMultiStep([], {}, {});
    expect(r.partialScore).toBe(0);
    expect(r.finalCorrect).toBe(false);
  });
});

describe('what the student is told', () => {
  it('names a carried step for what happened, not for its grade', () => {
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 300, dist: 424.26 }, GIVENS);
    expect(verdictLabel(r.steps[2]!)).toContain('carried');
    expect(verdictLabel(r.steps[0]!)).toBe('Correct');
    expect(verdictLabel(r.steps[1]!)).toBe('Not right');
  });

  it('shows the true answer, and what their own work led to', () => {
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 300, dist: 424.26 }, GIVENS);
    const shown = shownAnswer(r.steps[2]!);
    expect(shown.value).toBeCloseTo(500, 2);
    expect(shown.note).toContain('from your earlier figure');
  });

  it('adds no note when there was no carry', () => {
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 400, dist: 500 }, GIVENS);
    expect(shownAnswer(r.steps[2]!).note).toBeUndefined();
  });

  it('says whether the problem itself was solved', () => {
    // Carried credit is honest about the steps and honest about the outcome: the final number was
    // not right, and a student revising needs to know that.
    const r = gradeMultiStep(INVERSE, { dN: 300, dE: 300, dist: 424.26 }, GIVENS);
    expect(r.partialScore).toBeGreaterThan(0.5);
    expect(r.finalCorrect).toBe(false);
  });
});
