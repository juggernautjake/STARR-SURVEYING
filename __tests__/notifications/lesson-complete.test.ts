// __tests__/notifications/lesson-complete.test.ts
//
// Slice 2g of hub-widget-excellence-03-notifications. Locks the pure
// lesson-complete notification builder.

import { describe, it, expect } from 'vitest';
import { buildLessonCompleteNotification } from '@/lib/notifications/lesson-complete';

describe('buildLessonCompleteNotification', () => {
  it('celebrates the learner with lesson + module titles', () => {
    const n = buildLessonCompleteNotification({
      user_email: 'a@x.com',
      lesson_title: 'Bearings & Azimuths',
      module_title: 'Boundary Basics',
    })!;
    expect(n).toMatchObject({
      user_email: 'a@x.com',
      type: 'info',
      icon: '✅',
      link: '/admin/learn/roadmap',
      source_type: 'lesson_complete',
    });
    expect(n.title).toBe('✅ Lesson Complete: Bearings & Azimuths');
    expect(n.body).toBe('Great work finishing "Bearings & Azimuths" in Boundary Basics!');
  });

  it('drops the "in {module}" clause when the module title is missing', () => {
    const n = buildLessonCompleteNotification({
      user_email: 'a@x.com',
      lesson_title: 'Bearings & Azimuths',
      module_title: null,
    })!;
    expect(n.body).toBe('Great work finishing "Bearings & Azimuths"!');
  });

  it('falls back to a generic label when the lesson title is missing', () => {
    const n = buildLessonCompleteNotification({ user_email: 'a@x.com', lesson_title: null })!;
    expect(n.title).toBe('✅ Lesson Complete: a lesson');
  });

  it('returns null without a learner', () => {
    expect(buildLessonCompleteNotification({ user_email: null, lesson_title: 'X' })).toBeNull();
    expect(buildLessonCompleteNotification({ user_email: '  ' })).toBeNull();
  });
});
