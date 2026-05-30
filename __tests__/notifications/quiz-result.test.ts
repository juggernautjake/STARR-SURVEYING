// __tests__/notifications/quiz-result.test.ts
//
// Slice 2f of hub-widget-excellence-03-notifications. Locks the pure
// quiz-result notification builder + the quiz-label derivation.

import { describe, it, expect } from 'vitest';
import {
  buildQuizResultNotification,
  quizLabel,
  QUIZ_PASS_THRESHOLD,
} from '@/lib/notifications/quiz-result';

describe('quizLabel', () => {
  it('prefers the exam category, then exam-prep, else lesson quiz', () => {
    expect(quizLabel('exam_prep', 'PLS')).toBe('PLS exam');
    expect(quizLabel('exam_prep', null)).toBe('Exam-prep quiz');
    expect(quizLabel('lesson_quiz', null)).toBe('Lesson quiz');
  });
});

describe('buildQuizResultNotification', () => {
  it('builds a passed notice at/above the threshold', () => {
    const n = buildQuizResultNotification({
      user_email: 'a@x.com',
      attempt_type: 'lesson_quiz',
      score_percent: QUIZ_PASS_THRESHOLD,
    })!;
    expect(n).toMatchObject({
      user_email: 'a@x.com',
      type: 'info',
      icon: '🏆',
      link: '/admin/learn/quiz-history',
      source_type: 'quiz_result',
    });
    expect(n.title).toContain('Passed: Lesson quiz');
    expect(n.body).toContain('Score: 70%');
    expect(n.body).toContain('Great job!');
  });

  it('builds a did-not-pass notice below the threshold', () => {
    const n = buildQuizResultNotification({ user_email: 'a@x.com', score_percent: 55 })!;
    expect(n.icon).toBe('📝');
    expect(n.title).toContain('Did not pass');
    expect(n.body).toContain('Score: 55%');
    expect(n.body).toContain('Keep studying');
  });

  it('clamps + rounds the score and defaults missing to 0', () => {
    expect(buildQuizResultNotification({ user_email: 'a@x.com', score_percent: 150 })!.body).toContain('100%');
    expect(buildQuizResultNotification({ user_email: 'a@x.com', score_percent: -5 })!.body).toContain('0%');
    expect(buildQuizResultNotification({ user_email: 'a@x.com', score_percent: 88.6 })!.body).toContain('89%');
    expect(buildQuizResultNotification({ user_email: 'a@x.com', score_percent: null })!.body).toContain('0%');
  });

  it('returns null without a learner', () => {
    expect(buildQuizResultNotification({ user_email: null, score_percent: 90 })).toBeNull();
  });
});
