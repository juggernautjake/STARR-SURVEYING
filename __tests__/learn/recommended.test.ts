// __tests__/learn/recommended.test.ts
//
// hub-widget-excellence-13 — recommended-lessons R1: the
// /api/admin/learn/recommended endpoint was missing. Locks the pure
// recommendation picker behind the new endpoint + the widget's
// canonical lesson link.

import { describe, it, expect } from 'vitest';
import { pickRecommended } from '@/lib/learn/recommended';
import { recommendedLessonHref } from '@/lib/hub/widgets/recommended-lessons';

const lessons = [
  { id: 'l1', title: 'Intro to Bearings', module_id: 'm1' },
  { id: 'l2', title: 'Traverse Adjustment', module_id: 'm1' },
  { id: 'l3', title: 'GPS Basics', module_id: 'm2' },
];
const moduleTitles = new Map([['m1', 'Boundary Basics'], ['m2', 'Geodesy']]);

describe('pickRecommended', () => {
  it('drops completed lessons, caps, and joins module titles', () => {
    const out = pickRecommended(lessons, new Set(['l1']), 5, moduleTitles);
    expect(out.map((l) => l.id)).toEqual(['l2', 'l3']);
    expect(out[0]).toEqual({
      id: 'l2', title: 'Traverse Adjustment', module_id: 'm1',
      module_title: 'Boundary Basics', estimated_minutes: null,
    });
  });

  it('honors the limit', () => {
    expect(pickRecommended(lessons, new Set(), 1, moduleTitles).map((l) => l.id)).toEqual(['l1']);
    expect(pickRecommended(lessons, new Set(), 0, moduleTitles)).toEqual([]);
  });

  it('falls back the title + null module title when unknown', () => {
    const out = pickRecommended([{ id: 'x', module_id: 'mZ' }], new Set(), 5);
    expect(out[0].title).toBe('Lesson');
    expect(out[0].module_title).toBeNull();
  });
});

describe('recommendedLessonHref (R2: canonical lesson route)', () => {
  it('links to /admin/learn/modules/{module}/{lesson}', () => {
    expect(recommendedLessonHref({ id: 'l2', module_id: 'm1' })).toBe('/admin/learn/modules/m1/l2');
  });
  it('falls back to the modules list when the module is unknown', () => {
    expect(recommendedLessonHref({ id: 'l2', module_id: null })).toBe('/admin/learn/modules');
  });
});
