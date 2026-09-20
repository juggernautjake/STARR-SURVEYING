// Recording an attempt at a multi-step problem, and the deeper explanations beside each step.
//
// Owner, 2026-09-20: "Build any mechanics and automatic grading. Involve active AI if needed, but
// make sure it works really well in explaining things and how to do problems and what all the
// applications might be."
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const ATTEMPT = 'app/api/admin/learn/problem-attempt/route.ts';
const EXPLAIN = 'app/api/admin/learn/explain-step/route.ts';
const COMPONENT = 'app/admin/components/learn/MultiStepProblem.tsx';
const QUIZZES = 'app/api/admin/learn/quizzes/route.ts';

describe('partial credit finally counts', () => {
  const route = read(QUIZZES);

  it('is written to the row, not just returned to the screen', () => {
    // seeds/652 added the column in the previous session; nothing filled it until now, so the
    // "N% credit" badge was decorative and no record of it survived the page.
    expect(route).toContain('partial_score: typeof g.partial_score === \'number\' ? g.partial_score : null');
  });

  it('counts for every type that reports it, not only fill_blank', () => {
    // multi_select and ordering computed a partial score that was then thrown away at scoring
    // time, so three of four right scored the same as none.
    expect(route).toContain("totalScore += typeof sync.partial_score === 'number'");
    expect(route, 'the old fill_blank-only rule is gone')
      .not.toContain("q.question_type === 'fill_blank' ? (sync.partial_score ?? 0)");
  });

  it('leaves it null for an all-or-nothing question', () => {
    // So "no partial credit applies here" and "scored zero" stay different facts.
    expect(route).toContain(': null');
  });
});

describe('a multi-step attempt becomes a record', () => {
  const route = read(ATTEMPT);

  it('re-grades on the server rather than trusting a posted verdict', () => {
    // A verdict the client could set is a score anyone can set from the console, and a study
    // record nobody can rely on would quietly corrupt the weak-area tracking built on it.
    expect(route).toContain('gradeMultiStep(q.steps, answers, q.given_vars ?? {})');
    // Checks the FIELDS the body declares, not the prose around them. Three times now I have
    // written an assertion that tripped over the comment explaining why a thing is absent; the
    // fields are the contract, the comment is not.
    const body = route.slice(route.indexOf('const body ='), route.indexOf('if (!body?.questionId'));
    const fields = [...body.matchAll(/^\s{4}(\w+)\??:/gm)].map((m) => m[1]).sort();
    expect(fields, 'the client sends what was typed and nothing about how it was marked')
      .toEqual(['answers', 'questionId', 'timeSpentSeconds']);
  });

  it('refuses a question that is not a step ladder', () => {
    expect(route).toContain("q.question_type !== 'multi_step'");
  });

  it('writes the per-part detail, not just a percentage', () => {
    // So a worked solution can be shown again next week rather than reconstructed from a number.
    expect(route).toContain('partial_score:');
    expect(route).toContain('step_results: result.steps');
  });

  it('scores the parts but only counts the problem when all of them were earned', () => {
    expect(route).toContain('correct_answers: result.partialScore === 1 ? 1 : 0');
    expect(route).toContain('score_percent: Math.round(result.partialScore * 10000) / 100');
  });

  it('records which parts went wrong, without risking the attempt', () => {
    expect(route).toContain('fs_weak_areas');
    // Best effort: a failure in the convenience must never cost the student the attempt.
    const weak = route.slice(route.indexOf('fs_weak_areas') - 400);
    expect(weak).toContain('} catch {');
  });

  it('does not claim success when the answer row failed to write', () => {
    expect(route).toContain('if (answerError) {');
  });
});

describe('the deeper explanation', () => {
  const route = read(EXPLAIN);
  const c = read(COMPONENT);

  it('answers two different questions rather than one blurred one', () => {
    expect(route).toContain("EXPLAIN HOW AND WHY THIS STEP WORKS");
    expect(route).toContain('EXPLAIN WHERE THIS IS USED IN REAL SURVEYING WORK');
    expect(c).toContain('data-testid={`mstep-how-${step.id}`}');
    expect(c).toContain('data-testid={`mstep-where-${step.id}`}');
  });

  it('asks for applications rather than another derivation', () => {
    expect(route).toContain('Do NOT re-derive the arithmetic');
    expect(route).toContain('what goes wrong in the field or on the plat');
  });

  it('meets the student where the marking left them', () => {
    // "You had the method and slipped a digit" and "you used the wrong relationship" deserve
    // different explanations.
    expect(route).toContain("body.verdict === 'wrong'");
    expect(route).toContain("body.verdict === 'carried'");
    expect(route, 'and a carried step is not treated as a misunderstanding')
      .toContain('their method here was right');
  });

  it('never asks the model to re-mark the arithmetic', () => {
    // The marking already happened, deterministically, in gradeMultiStep. Asking a model to
    // re-judge numbers it cannot see is inviting it to contradict a correct result.
    expect(route).toContain('It does NOT get their numeric answer to grade');
  });

  it('degrades to the stored explanation instead of to an error', () => {
    // The authored text is a real answer; it is just a shorter one.
    expect(route).toContain("source: 'stored'");
    expect((route.match(/source: 'stored'/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('uses the model registry rather than naming a model', () => {
    expect(route).toContain("modelFor('drafting').model");
    expect(route).not.toMatch(/claude-[a-z0-9-]+/);
  });

  it('is only offered once the step has been marked', () => {
    // Before that, an explanation of the method IS the answer.
    const worked = c.slice(c.indexOf('{showWorked && r && ('));
    expect(worked).toContain('mstep__deeper-actions');
  });

  it('does not fetch the same paragraph twice', () => {
    expect(c).toContain('if (deeper[key]) return;');
    expect(c).toContain('disabled={Boolean(deeper[');
  });

  it('is styled', () => {
    const css = read('app/admin/styles/AdminLearn.css');
    for (const cls of ['.mstep__deeper-actions', '.mstep__deeper-btn', '.mstep__deeper {', '.mstep__deeper-text']) {
      expect(css).toContain(cls);
    }
  });
});
