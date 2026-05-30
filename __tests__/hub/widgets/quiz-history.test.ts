// __tests__/hub/widgets/quiz-history.test.ts
//
// hub-widget-excellence-13 — quiz-history R1: the widget hit a missing
// endpoint (/api/admin/learn/quiz-attempts) reading quiz_name/score/
// max_score, but the real history is /api/admin/learn/quizzes?history=1
// with score_percent/attempt_type/exam_category. Lock the mapper +
// label + the existing percent/filter helpers.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import {
  toQuizAttempt,
  quizLabel,
  attemptPercent,
  filterFailed,
} from '@/lib/hub/widgets/quiz-history';

describe('quiz-history — registry', () => {
  it('registers in the learning category', () => {
    expect(getWidget('quiz-history')?.category).toBe('learning');
  });
});

describe('quizLabel', () => {
  it('prefers the exam category, then exam-prep, else lesson quiz', () => {
    expect(quizLabel('exam_prep', 'PLS')).toBe('PLS exam');
    expect(quizLabel('exam_prep', null)).toBe('Exam-prep quiz');
    expect(quizLabel('lesson_quiz', null)).toBe('Lesson quiz');
  });
});

describe('toQuizAttempt (R1: real quiz_attempts shape)', () => {
  it('maps score_percent → score/100 so attemptPercent returns the %', () => {
    const a = toQuizAttempt({
      id: 'q1', attempt_type: 'lesson_quiz', score_percent: 85, completed_at: '2026-05-30T10:00:00Z',
    });
    expect(a).toEqual({ id: 'q1', quiz_name: 'Lesson quiz', score: 85, max_score: 100, completed_at: '2026-05-30T10:00:00Z' });
    expect(attemptPercent(a)).toBe(85);
  });

  it('clamps/rounds + defaults a missing score to 0', () => {
    expect(toQuizAttempt({ id: 'q2', score_percent: 150 }).score).toBe(100);
    expect(toQuizAttempt({ id: 'q3', score_percent: 88.6 }).score).toBe(89);
    expect(toQuizAttempt({ id: 'q4' }).score).toBe(0);
  });
});

describe('filterFailed (still applies to the mapped attempts)', () => {
  it('keeps attempts below 60%', () => {
    const attempts = [
      toQuizAttempt({ id: 'pass', score_percent: 90 }),
      toQuizAttempt({ id: 'fail', score_percent: 45 }),
    ];
    expect(filterFailed(attempts).map((a) => a.id)).toEqual(['fail']);
  });
});
