// __tests__/learn/question-delivery.test.ts
//
// Locks in the SHARED question delivery path used by both the practice quizzes
// and the FS Exam Simulator: gradeQuestionSync() for every question type, and
// shapeQuestion() option shaping. Also guards the answer_format text-column
// parse in dbRowToTemplate — the bug that silently forced every template to 2
// decimals / 0.01 tolerance until it was fixed.

import { describe, it, expect } from 'vitest';
import { gradeQuestionSync, shapeQuestion, type RawQuestion } from '@/lib/learn/questionDelivery';
import { dbRowToTemplate, generateFromTemplate } from '@/lib/problemEngine';

const A = (q: Partial<{ user_answer: string; _dynamic: boolean; _generated_answer: string; _tolerance: number }>) =>
  ({ question_id: 'x', user_answer: '', ...q });

describe('gradeQuestionSync — per type', () => {
  it('multiple_choice is case-insensitive exact match', () => {
    const q: RawQuestion = { id: 'x', question_text: '', question_type: 'multiple_choice', correct_answer: 'North' };
    expect(gradeQuestionSync(A({ user_answer: 'north' }), q)!.is_correct).toBe(true);
    expect(gradeQuestionSync(A({ user_answer: 'south' }), q)!.is_correct).toBe(false);
  });

  it('true_false matches', () => {
    const q: RawQuestion = { id: 'x', question_text: '', question_type: 'true_false', correct_answer: 'True' };
    expect(gradeQuestionSync(A({ user_answer: 'true' }), q)!.is_correct).toBe(true);
    expect(gradeQuestionSync(A({ user_answer: 'false' }), q)!.is_correct).toBe(false);
  });

  it('numeric_input honors tolerance', () => {
    const q: RawQuestion = { id: 'x', question_text: '', question_type: 'numeric_input', correct_answer: '100.00', tolerance: 0.5 };
    expect(gradeQuestionSync(A({ user_answer: '100.4' }), q)!.is_correct).toBe(true);
    expect(gradeQuestionSync(A({ user_answer: '101' }), q)!.is_correct).toBe(false);
  });

  it('multi_select requires the exact set (order-independent)', () => {
    const q: RawQuestion = { id: 'x', question_text: '', question_type: 'multi_select', correct_answer: JSON.stringify(['A', 'B']) };
    expect(gradeQuestionSync(A({ user_answer: JSON.stringify(['B', 'A']) }), q)!.is_correct).toBe(true);
    expect(gradeQuestionSync(A({ user_answer: JSON.stringify(['A']) }), q)!.is_correct).toBe(false); // missing
    expect(gradeQuestionSync(A({ user_answer: JSON.stringify(['A', 'B', 'C']) }), q)!.is_correct).toBe(false); // extra
  });

  it('ordering is position-wise', () => {
    const q: RawQuestion = { id: 'x', question_text: '', question_type: 'ordering', correct_answer: JSON.stringify(['1', '2', '3']) };
    expect(gradeQuestionSync(A({ user_answer: JSON.stringify(['1', '2', '3']) }), q)!.is_correct).toBe(true);
    expect(gradeQuestionSync(A({ user_answer: JSON.stringify(['2', '1', '3']) }), q)!.is_correct).toBe(false);
  });

  it('drag_label grades position-wise like ordering', () => {
    const q: RawQuestion = { id: 'x', question_text: '', question_type: 'drag_label', correct_answer: JSON.stringify(['T', 'PC', 'PT']) };
    expect(gradeQuestionSync(A({ user_answer: JSON.stringify(['T', 'PC', 'PT']) }), q)!.is_correct).toBe(true);
    expect(gradeQuestionSync(A({ user_answer: JSON.stringify(['PC', 'T', 'PT']) }), q)!.is_correct).toBe(false);
  });

  it('hotspot matches the chosen region id', () => {
    const q: RawQuestion = { id: 'x', question_text: '', question_type: 'hotspot', correct_answer: 'B' };
    expect(gradeQuestionSync(A({ user_answer: 'b' }), q)!.is_correct).toBe(true);
    expect(gradeQuestionSync(A({ user_answer: 'A' }), q)!.is_correct).toBe(false);
  });

  it('fill_blank awards partial credit', () => {
    const q: RawQuestion = { id: 'x', question_text: '', question_type: 'fill_blank', correct_answer: JSON.stringify(['dog', 'cat']) };
    const r = gradeQuestionSync(A({ user_answer: JSON.stringify(['dog', 'wrong']) }), q)!;
    expect(r.is_correct).toBe(false);
    expect(r.partial_score).toBeCloseTo(0.5);
  });

  it('essay returns null (needs async AI grading)', () => {
    const q: RawQuestion = { id: 'x', question_text: '', question_type: 'essay', correct_answer: 'ref' };
    expect(gradeQuestionSync(A({ user_answer: 'anything' }), q)).toBeNull();
  });

  it('dynamic questions grade against the echoed-back generated answer', () => {
    const q: RawQuestion = { id: 'x', question_text: '', question_type: 'numeric_input', correct_answer: '0', is_dynamic: true, template_id: 't' };
    const r = gradeQuestionSync(A({ user_answer: '42.01', _dynamic: true, _generated_answer: '42.00', _tolerance: 0.05 }), q)!;
    expect(r.is_correct).toBe(true);
    expect(r.correct_answer).toBe('42.00');
    expect(gradeQuestionSync(A({ user_answer: '43', _dynamic: true, _generated_answer: '42.00', _tolerance: 0.05 }), q)!.is_correct).toBe(false);
  });
});

describe('shapeQuestion — option shaping', () => {
  it('shuffles multiple_choice options but keeps them all', () => {
    const q: RawQuestion = { id: 'x', question_text: 'q', question_type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], difficulty: 'easy', tags: [] };
    const shaped = shapeQuestion(q);
    expect(new Set(shaped.options as string[])).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it('keeps drag_label as a { terms, targets } object', () => {
    const q: RawQuestion = { id: 'x', question_text: 'q', question_type: 'drag_label', options: { terms: ['a', 'b'], targets: ['t1', 't2'] }, difficulty: 'easy', tags: [] };
    const shaped = shapeQuestion(q);
    const o = shaped.options as { terms: string[]; targets: string[] };
    expect(new Set(o.terms)).toEqual(new Set(['a', 'b']));
    expect(o.targets).toEqual(['t1', 't2']); // target order preserved
  });

  it('keeps hotspot as a { regions } object', () => {
    const q: RawQuestion = { id: 'x', question_text: 'q', question_type: 'hotspot', options: { regions: [{ id: 'A', label: 'a' }, { id: 'B', label: 'b' }] }, difficulty: 'easy', tags: [] };
    const shaped = shapeQuestion(q);
    const o = shaped.options as { regions: { id: string }[] };
    expect(o.regions.map(r => r.id).sort()).toEqual(['A', 'B']);
  });
});

describe('dbRowToTemplate — answer_format text column', () => {
  it('parses a JSON-string answer_format so decimals/tolerance take effect', () => {
    const tpl = dbRowToTemplate({
      id: 't', name: 'EF', category: 'geodesy', question_type: 'numeric_input',
      question_template: 'EF for H={{H:f0}}', answer_formula: '20906000/(20906000+H)',
      // stored as a STRING (text column) — the bug this guards against
      answer_format: '{"decimals":6,"tolerance":0.000002}',
      parameters: [{ name: 'H', type: 'integer', min: 500, max: 9000 }],
    });
    expect(tpl.answer_format.decimals).toBe(6);
    expect(tpl.answer_format.tolerance).toBeCloseTo(0.000002);
    const g = generateFromTemplate(tpl);
    // 6-decimal factor near but not equal to 1.000000
    expect(g.correct_answer).toMatch(/^0\.\d{6}$/);
  });
});
