// __tests__/learn/problem-templates.test.ts — "they all work every time, and grading works every time."
//
// Owner, 2026-09-20: "Make sure we are able to generate new problems and that they all work every
// time and that the grading works every time too."
//
// A generated problem set is only worth having if that is literally true, so this does not test a
// handful of examples. It generates every template hundreds of times and asserts, on every single
// instance, that:
//
//   1. it renders — no `{placeholder}` survives into the statement, nothing is NaN
//   2. every step evaluates to a finite number
//   3. grading the TRUE answers marks every step correct
//   4. grading a deliberately wrong answer marks it wrong — the tolerance actually discriminates
//   5. a slip in step 1 carries forward: later steps score `carried`, not `wrong`
//
// Point 4 is the one people skip, and it is the one that matters most. A tolerance wider than the
// answer marks everything correct, which looks like a working problem and teaches nothing. That is
// exactly what the `valid` predicates exist to prevent, and this is what proves they do.

import { describe, it, expect } from 'vitest';
import {
  PROBLEM_TEMPLATES, generate, fillTemplate, problemTemplate, templatesForModule,
} from '@/lib/learn/problemTemplates';
import { gradeMultiStep, DEFAULT_STEP_TOLERANCE, type ProblemStep } from '@/lib/learn/gradeSteps';
import { evalFormula } from '@/lib/problemEngine';

/** How many instances of each template to put through the wringer. */
const RUNS = 250;

/** The correct answer to every step, computed the way the grader will. */
function trueAnswers(problem: ReturnType<typeof generate>): Record<string, number> {
  const scope: Record<string, number> = { ...problem.given };
  const out: Record<string, number> = {};
  for (const step of problem.steps) {
    const v = step.formula ? evalFormula(step.formula, scope) : Number(step.answer);
    scope[step.id] = v;
    out[step.id] = v;
  }
  return out;
}

/**
 * The answers as a student would type them: rounded, not fifteen digits long.
 *
 * HOW FAR rounded has to come from the step's own tolerance. A first version rounded everything to
 * four decimals, which broke two different ways at once on the combined-factor template, whose
 * answers are around 0.9999 with a tolerance of 5e-7: the TRUE answer rounded to 0.9999 and was
 * marked wrong, and a deliberately-wrong answer rounded to 0.9999 as well and was marked correct.
 *
 * Both were artefacts of the test, not of the grader — but the first one is also a real question
 * worth asking of every template: if the right answer written to a sensible number of figures does
 * not mark correct, the tolerance and the prompt disagree, and a student will be marked wrong for
 * doing it properly. Rounding to a tenth of the tolerance is what a prompt asking for that
 * precision would get, which is the standard each template now has to meet.
 */
function asStrings(answers: Record<string, number>, steps: ProblemStep[]): Record<string, string> {
  return Object.fromEntries(steps.map((step) => {
    const tol = step.tolerance ?? DEFAULT_STEP_TOLERANCE;
    const dp = Math.max(0, Math.min(12, Math.ceil(-Math.log10(tol / 10))));
    return [step.id, answers[step.id].toFixed(dp)];
  }));
}

describe('the templates themselves', () => {
  it('have unique ids', () => {
    const ids = PROBLEM_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('are findable, and safe for an id that is not there', () => {
    expect(problemTemplate(PROBLEM_TEMPLATES[0].id)?.id).toBe(PROBLEM_TEMPLATES[0].id);
    expect(problemTemplate('nope')).toBeUndefined();
  });

  it('group by module', () => {
    for (const t of PROBLEM_TEMPLATES) {
      expect(templatesForModule(t.module).map((x) => x.id)).toContain(t.id);
    }
  });

  it('every step id is a legal identifier, because later formulas reference it by name', () => {
    // A step id with a hyphen in it would be parsed as subtraction inside a later formula, giving
    // NaN with no error at all.
    for (const t of PROBLEM_TEMPLATES) {
      for (const s of t.steps) {
        expect(s.id, `${t.id}/${s.id}`).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
      }
    }
  });

  it('no step id collides with a parameter name', () => {
    // The grader builds one scope from the givens and then writes step results into it. A step
    // called `lat` in a template with a given called `lat` would overwrite the given halfway
    // through, and every later step would silently use the wrong number.
    for (const t of PROBLEM_TEMPLATES) {
      const params = new Set(Object.keys(t.params));
      for (const s of t.steps) {
        expect(params.has(s.id), `${t.id}: step '${s.id}' shadows a given of the same name`).toBe(false);
      }
    }
  });

  it('every step explains itself', () => {
    for (const t of PROBLEM_TEMPLATES) {
      for (const s of t.steps) {
        expect((s.explanation ?? '').length, `${t.id}/${s.id} has no explanation`).toBeGreaterThan(40);
      }
    }
  });
});

describe('fillTemplate', () => {
  it('substitutes by name and by decimals', () => {
    expect(fillTemplate('{a} and {b:2}', { a: 5, b: 3.14159 })).toBe('5 and 3.14');
  });

  it('leaves an unknown placeholder alone rather than writing "undefined"', () => {
    // Visible nonsense beats a confident lie: `{missing}` in a problem statement is obviously a
    // bug, and "undefined ft" reads like part of the question.
    expect(fillTemplate('{missing} ft', {})).toBe('{missing} ft');
  });

  it('leaves a non-finite value alone too', () => {
    expect(fillTemplate('{x}', { x: Number.NaN })).toBe('{x}');
  });
});

describe('generate is deterministic', () => {
  it('the same seed gives the same problem', () => {
    // This is what makes "show me that one again" possible, and what makes a bug report
    // reproducible.
    for (const t of PROBLEM_TEMPLATES) {
      const a = generate(t, 12345);
      const b = generate(t, 12345);
      expect(b).toEqual(a);
    }
  });

  it('different seeds give different problems', () => {
    for (const t of PROBLEM_TEMPLATES) {
      const seen = new Set<string>();
      for (let s = 1; s <= 40; s += 1) seen.add(generate(t, s).statement);
      // Not all 40 need differ — a template drawing whole degrees will repeat eventually — but a
      // template producing one statement forty times is not generating anything.
      expect(seen.size, `${t.id} produced ${seen.size} distinct statements in 40 seeds`).toBeGreaterThan(20);
    }
  });
});

describe.each(PROBLEM_TEMPLATES.map((t) => [t.id, t] as const))('%s', (_id, template) => {
  it(`generates ${RUNS} valid instances`, () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const p = generate(template, seed);

      // 1 — it renders.
      expect(p.statement, `seed ${seed}: unfilled placeholder`).not.toMatch(/\{\w+(:\d+)?\}/);
      expect(p.statement).not.toContain('NaN');
      expect(p.statement).not.toContain('undefined');
      expect(p.statement.length).toBeGreaterThan(30);

      // 2 — every step evaluates.
      const answers = trueAnswers(p);
      for (const step of p.steps) {
        expect(Number.isFinite(answers[step.id]), `seed ${seed}: step ${step.id} is not finite`).toBe(true);
      }
    }
  });

  it('grading the true answers marks every step correct', () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const p = generate(template, seed);
      const result = gradeMultiStep(p.steps, asStrings(trueAnswers(p), p.steps), p.given);

      for (const s of result.steps) {
        expect(s.verdict, `${template.id} seed ${seed}: step ${s.id} marked ${s.verdict} for the right answer`)
          .toBe('correct');
      }
      expect(result.partialScore).toBe(1);
      expect(result.finalCorrect).toBe(true);
    }
  });

  it('a wrong answer is marked wrong — the tolerance actually discriminates', () => {
    // THE assertion. A tolerance wider than the quantity it is checking marks everything correct,
    // which looks like a working problem and teaches nothing. The offset is deliberately modest:
    // twice the tolerance, so this fails when a tolerance is loose rather than only when it is
    // absurd.
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const p = generate(template, seed);
      const truth = trueAnswers(p);

      for (const step of p.steps) {
        const tol = step.tolerance ?? DEFAULT_STEP_TOLERANCE;
        const wrong = { ...truth, [step.id]: truth[step.id] + tol * 2 + Math.abs(truth[step.id]) * 1e-9 };
        const result = gradeMultiStep(p.steps, asStrings(wrong, p.steps), p.given);
        const marked = result.steps.find((s) => s.id === step.id)!;
        expect(
          marked.verdict,
          `${template.id} seed ${seed}: step ${step.id} accepted an answer ${(tol * 2).toPrecision(3)} off ` +
          `(true ${truth[step.id].toPrecision(6)}, tolerance ${tol})`,
        ).not.toBe('correct');
      }
    }
  });

  it('a slip in the first step carries forward instead of failing every later step', () => {
    // The behaviour the owner asked for in as many words: "If step 1 is wrong, step 2 is marked
    // against what THEY got, not the right answer." Only meaningful where a later step actually
    // depends on the first, so templates whose steps are independent are skipped rather than
    // asserted about falsely.
    const first = template.steps[0];
    const dependents = template.steps.slice(1).filter((s) => s.formula?.includes(first.id));
    if (dependents.length === 0) return;
    // Across the whole run at least one slip must actually produce a 'carried' verdict, or the
    // allowance above has quietly turned this into a test that asserts nothing.
    let carriedSeen = false;

    for (let seed = 1; seed <= 60; seed += 1) {
      const p = generate(template, seed);
      const truth = trueAnswers(p);

      // A wrong first step, and everything after it consistent with that wrong value.
      const slipped = { ...p.given, [first.id]: truth[first.id] * 1.1 + 5 };
      const theirs: Record<string, number> = { [first.id]: slipped[first.id] };
      const scope: Record<string, number> = { ...p.given, [first.id]: slipped[first.id] };
      for (const step of p.steps.slice(1)) {
        const v = step.formula ? evalFormula(step.formula, scope) : Number(step.answer);
        scope[step.id] = v;
        theirs[step.id] = v;
      }

      const result = gradeMultiStep(p.steps, asStrings(theirs, p.steps), p.given);
      expect(result.steps[0].verdict).toBe('wrong');
      for (const dep of dependents) {
        const marked = result.steps.find((s) => s.id === dep.id)!;
        // A slip does not always propagate VISIBLY. On the inverse template a wrong latitude of 6.1
        // instead of 1.0 barely moves a 500 ft length, and the carried answer lands inside the
        // tolerance of the true one. 'correct' is then the honest verdict — the two answers are
        // indistinguishable at the precision being asked for — so the assertion is that the step is
        // never marked WRONG, which is the failure mode carry-forward exists to prevent.
        const indistinguishable = Math.abs(marked.expected - marked.expectedFromTheirWork) <= marked.tolerance;
        expect(
          marked.verdict,
          `${template.id} seed ${seed}: step ${dep.id} marked ${marked.verdict} after a slip upstream`,
        ).toBe(indistinguishable ? marked.verdict : 'carried');
        expect(marked.verdict, `${template.id} seed ${seed}: ${dep.id} should never be wrong here`).not.toBe('wrong');
        carriedSeen = carriedSeen || marked.verdict === 'carried';
      }
      // Carried steps earn their mark, so a single slip does not zero the problem.
      expect(result.partialScore).toBeGreaterThan(0);
    }
    expect(carriedSeen, `${template.id}: no seed produced a carried verdict — carry-forward untested here`).toBe(true);
  });

  it('a blank answer is blank, not wrong', () => {
    // Somebody who has not answered yet has not got anything wrong, and telling them otherwise
    // while they are still working is both untrue and discouraging.
    const p = generate(template, 7);
    const result = gradeMultiStep(p.steps, {}, p.given);
    for (const s of result.steps) expect(s.verdict).toBe('blank');
    expect(result.partialScore).toBe(0);
  });
});
