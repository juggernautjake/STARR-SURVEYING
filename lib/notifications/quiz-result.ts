// lib/notifications/quiz-result.ts
//
// Slice 2f of hub-widget-excellence-03-notifications. Pure payload
// builder for the quiz-result notification (passed/failed + score) sent
// to the learner after a graded attempt is saved. Dependency-free +
// unit-testable; the quizzes route maps it through `notify`.

export const QUIZ_PASS_THRESHOLD = 70;

export interface QuizAttemptSummary {
  user_email?: string | null;
  attempt_type?: string | null;
  exam_category?: string | null;
  score_percent?: number | null;
}

export interface QuizResultNotification {
  user_email: string;
  type: 'info';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'quiz_result';
}

/** Human label for the quiz from its type/category. */
export function quizLabel(attemptType?: string | null, examCategory?: string | null): string {
  const cat = examCategory?.trim();
  if (cat) return `${cat} exam`;
  if (attemptType === 'exam_prep') return 'Exam-prep quiz';
  return 'Lesson quiz';
}

/**
 * Build the quiz-result notification for the learner. Returns null when
 * there's no user. Score is clamped to 0–100; passing is ≥ 70%.
 */
export function buildQuizResultNotification(
  attempt: QuizAttemptSummary,
): QuizResultNotification | null {
  const user_email = attempt.user_email?.trim();
  if (!user_email) return null;

  const raw = typeof attempt.score_percent === 'number' && Number.isFinite(attempt.score_percent)
    ? attempt.score_percent
    : 0;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const passed = score >= QUIZ_PASS_THRESHOLD;
  const icon = passed ? '🏆' : '📝';
  const verb = passed ? 'Passed' : 'Did not pass';
  const label = quizLabel(attempt.attempt_type, attempt.exam_category);

  return {
    user_email,
    type: 'info',
    title: `${icon} ${verb}: ${label}`,
    body: `Score: ${score}%. ${passed ? 'Great job!' : 'Keep studying and try again!'}`,
    icon,
    link: '/admin/learn/quiz-history',
    source_type: 'quiz_result',
  };
}
