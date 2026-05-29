import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/roadmap-progress';
import '@/lib/hub/widgets/flashcards-due';
import '@/lib/hub/widgets/quiz-history';
import '@/lib/hub/widgets/recommended-lessons';

describe('phase 16 — learning widgets', () => {
  it('roadmap-progress', () => {
    const def = getWidget('roadmap-progress');
    expect(def?.category).toBe('learning');
    expect(def?.allowedRoles).toContain('student');
  });
  it('flashcards-due', () => {
    const def = getWidget('flashcards-due');
    expect(def?.category).toBe('learning');
  });
  it('quiz-history', () => {
    expect(getWidget('quiz-history')?.category).toBe('learning');
  });
  it('recommended-lessons', () => {
    expect(getWidget('recommended-lessons')?.category).toBe('learning');
  });
});
