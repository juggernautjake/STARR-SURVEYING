// __tests__/hub/widget-config-render-learning-family.test.ts
//
// Slice 15b of employee-hub-overhaul-2026-05-30.md. Locks the
// content → render wiring for the three learning-family widgets
// shipped this slice:
//   - flashcards-due       (maxCards, hideEmpty)
//   - recommended-lessons  (maxItems, category)
//   - roadmap-progress     (showName, showCurrent, showBar; revised
//                           schema this slice to match what the
//                           widget actually displays)
//
// Pure-unit assertions against each widget's exported resolvers + the
// pure helpers (visibleCount, lessonMatchesCategory).

import { describe, it, expect } from 'vitest';
import { getWidgetOptionsEntry } from '@/lib/hub/widget-options';

import * as Flashcards         from '@/lib/hub/widgets/flashcards-due';
import * as RecommendedLessons from '@/lib/hub/widgets/recommended-lessons';
import * as RoadmapProgress    from '@/lib/hub/widgets/roadmap-progress';

function schemaFieldsByKey(widgetId: string): Map<string, { type: string }> {
  const entry = getWidgetOptionsEntry(widgetId);
  if (entry.source !== 'schema') return new Map();
  return new Map(entry.fields.map((f) => [f.key, { type: f.type }]));
}

describe('Slice 15b — flashcards-due', () => {
  it('schema declares maxCards + hideEmpty', () => {
    const fields = schemaFieldsByKey('flashcards-due');
    expect(fields.get('maxCards')?.type).toBe('number');
    expect(fields.get('hideEmpty')?.type).toBe('toggle');
  });

  it('resolveMaxCards clamps to [1, 25] else null', () => {
    expect(Flashcards.resolveMaxCards({ maxCards: 10 })).toBe(10);
    expect(Flashcards.resolveMaxCards({ maxCards: 26 })).toBe(null);
    expect(Flashcards.resolveMaxCards({})).toBe(null);
  });

  it('resolveHideEmpty defaults false', () => {
    expect(Flashcards.resolveHideEmpty({ hideEmpty: true })).toBe(true);
    expect(Flashcards.resolveHideEmpty({})).toBe(false);
  });

  it('visibleCount caps the raw backend count when an explicit cap is set', () => {
    expect(Flashcards.visibleCount(40, 5)).toBe(5);
    expect(Flashcards.visibleCount(3, 5)).toBe(3);
    // No cap (null) → raw passes through
    expect(Flashcards.visibleCount(40, null)).toBe(40);
  });
});

describe('Slice 15b — recommended-lessons', () => {
  it('schema declares maxItems + category', () => {
    const fields = schemaFieldsByKey('recommended-lessons');
    expect(fields.get('maxItems')?.type).toBe('number');
    expect(fields.get('category')?.type).toBe('select');
  });

  it('schema category options match resolver acceptance', () => {
    const entry = getWidgetOptionsEntry('recommended-lessons');
    if (entry.source !== 'schema') return;
    const cat = entry.fields.find((f) => f.key === 'category');
    if (!cat || cat.type !== 'select') return;
    expect(cat.options.map((o) => o.value).sort()).toEqual(['all', 'safety', 'survey', 'tech']);
  });

  it('resolveMaxItems clamps to [1, 10]', () => {
    expect(RecommendedLessons.resolveMaxItems({ maxItems: 4 })).toBe(4);
    expect(RecommendedLessons.resolveMaxItems({ maxItems: 11 })).toBe(null);
  });

  it('resolveCategory falls back to "all" for unknown values', () => {
    expect(RecommendedLessons.resolveCategory({ category: 'survey' })).toBe('survey');
    expect(RecommendedLessons.resolveCategory({ category: 'safety' })).toBe('safety');
    expect(RecommendedLessons.resolveCategory({ category: 'mystery' as RecommendedLessons.RecommendedLessonsCategory })).toBe('all');
    expect(RecommendedLessons.resolveCategory({})).toBe('all');
  });

  it('lessonMatchesCategory: "all" passes everything', () => {
    const lesson = { title: 'Random lesson', module_title: null };
    expect(RecommendedLessons.lessonMatchesCategory(lesson, 'all')).toBe(true);
  });

  it('lessonMatchesCategory: token match against title + module_title', () => {
    expect(RecommendedLessons.lessonMatchesCategory(
      { title: 'Survey Basics', module_title: 'Land Boundaries' },
      'survey',
    )).toBe(true);
    expect(RecommendedLessons.lessonMatchesCategory(
      { title: 'GPS RTK', module_title: null },
      'tech',
    )).toBe(true);
    expect(RecommendedLessons.lessonMatchesCategory(
      { title: 'OSHA refresher', module_title: 'Safety' },
      'safety',
    )).toBe(true);
  });

  it('lessonMatchesCategory: rejects when no token hits', () => {
    expect(RecommendedLessons.lessonMatchesCategory(
      { title: 'Cooking 101', module_title: 'Kitchen' },
      'survey',
    )).toBe(false);
  });
});

describe('Slice 15b — roadmap-progress (revised schema)', () => {
  it('schema declares showName + showCurrent + showBar (revised this slice)', () => {
    const fields = schemaFieldsByKey('roadmap-progress');
    expect(fields.get('showName')?.type).toBe('toggle');
    expect(fields.get('showCurrent')?.type).toBe('toggle');
    expect(fields.get('showBar')?.type).toBe('toggle');
  });

  it('schema no longer carries the pre-revision per-phase toggles', () => {
    const fields = schemaFieldsByKey('roadmap-progress');
    expect(fields.has('showCompleted')).toBe(false);
    expect(fields.has('showInProgress')).toBe(false);
    expect(fields.has('showUpcoming')).toBe(false);
  });

  it('all three toggles default true so existing layouts render identically', () => {
    expect(RoadmapProgress.resolveShowName({})).toBe(true);
    expect(RoadmapProgress.resolveShowCurrent({})).toBe(true);
    expect(RoadmapProgress.resolveShowBar({})).toBe(true);
  });

  it('toggles flip when explicitly set', () => {
    expect(RoadmapProgress.resolveShowName({ showName: false })).toBe(false);
    expect(RoadmapProgress.resolveShowCurrent({ showCurrent: false })).toBe(false);
    expect(RoadmapProgress.resolveShowBar({ showBar: false })).toBe(false);
  });
});
