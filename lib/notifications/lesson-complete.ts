// lib/notifications/lesson-complete.ts
//
// Slice 2g of hub-widget-excellence-03-notifications. Pure payload
// builder for the "lesson complete" celebration sent to the learner the
// FIRST time they finish a lesson. Dependency-free + unit-testable; the
// learn/progress route resolves the titles + gates on first completion,
// then maps this through `notify`.

export interface LessonCompleteInput {
  user_email?: string | null;
  lesson_title?: string | null;
  module_title?: string | null;
}

export interface LessonCompleteNotification {
  user_email: string;
  type: 'info';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'lesson_complete';
}

/**
 * Build the lesson-complete celebration for the learner. Returns null
 * when there's no learner. Falls back to a generic label when the lesson
 * title is missing, and drops the "in {module}" clause when the module
 * title is absent.
 */
export function buildLessonCompleteNotification(
  input: LessonCompleteInput,
): LessonCompleteNotification | null {
  const user_email = input.user_email?.trim();
  if (!user_email) return null;

  const lessonTitle = input.lesson_title?.trim() || 'a lesson';
  const moduleTitle = input.module_title?.trim();

  return {
    user_email,
    type: 'info',
    title: `✅ Lesson Complete: ${lessonTitle}`,
    body: moduleTitle
      ? `Great work finishing "${lessonTitle}" in ${moduleTitle}!`
      : `Great work finishing "${lessonTitle}"!`,
    icon: '✅',
    link: '/admin/learn/roadmap',
    source_type: 'lesson_complete',
  };
}
