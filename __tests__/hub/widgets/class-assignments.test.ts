// __tests__/hub/widgets/class-assignments.test.ts
//
// Slice 110 — Class Assignments widget helpers + registry round-trip.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import {
  ALL_ASSIGNMENT_COLUMNS,
  capForBucket,
  chipMetaFor,
  dueStatusFor,
  filterByDueWithin,
  labelForColumn,
  sortAssignments,
  visibleColumnsForBucket,
  type AssignmentColumn,
} from '@/lib/hub/widgets/class-assignments';

describe('class-assignments widget — registry', () => {
  it('registers under id "class-assignments" in learning category', () => {
    const def = getWidget('class-assignments');
    expect(def).toBeDefined();
    expect(def?.category).toBe('learning');
    expect(def?.iconName).toBe('GraduationCap');
  });

  it('only student + teacher + admin + developer can add it', () => {
    const def = getWidget('class-assignments');
    expect(def?.allowedRoles).toEqual(['student', 'teacher', 'admin', 'developer']);
  });

  it('default size 6×3, min 3×2, max 12×6', () => {
    const def = getWidget('class-assignments');
    expect(def?.defaultSize).toEqual({ w: 4, h: 3 });
    expect(def?.minSize).toEqual({ w: 1, h: 1 });  // Slice 217
    expect(def?.maxSize).toEqual({ w: 8, h: 8 });
  });
});

describe('class-assignments — capForBucket', () => {
  it('tiny → 2', () => { expect(capForBucket('tiny')).toBe(2); });
  it('small → 4', () => { expect(capForBucket('small')).toBe(4); });
  it('medium → 6', () => { expect(capForBucket('medium')).toBe(6); });
  it('large → 12', () => { expect(capForBucket('large')).toBe(12); });
  it('xlarge → 24', () => { expect(capForBucket('xlarge')).toBe(24); });
});

describe('class-assignments — visibleColumnsForBucket', () => {
  const allCols: AssignmentColumn[] = ['title', 'class', 'due', 'status'];

  it('tiny keeps title + due', () => {
    expect(visibleColumnsForBucket(allCols, 'tiny')).toEqual(['title', 'due']);
  });

  it('small drops class', () => {
    expect(visibleColumnsForBucket(allCols, 'small')).toEqual(['title', 'due', 'status']);
  });

  it('medium and larger preserve every column', () => {
    expect(visibleColumnsForBucket(allCols, 'medium')).toEqual(allCols);
    expect(visibleColumnsForBucket(allCols, 'large')).toEqual(allCols);
    expect(visibleColumnsForBucket(allCols, 'xlarge')).toEqual(allCols);
  });
});

describe('class-assignments — dueStatusFor', () => {
  const NOW = Date.parse('2026-05-29T12:00:00Z');

  it('past due date → overdue', () => {
    expect(dueStatusFor('2026-05-28T12:00:00Z', NOW)).toBe('overdue');
  });

  it('within the next 24h → today', () => {
    expect(dueStatusFor('2026-05-29T20:00:00Z', NOW)).toBe('today');
  });

  it('between 24h and 7d → week', () => {
    expect(dueStatusFor('2026-06-02T12:00:00Z', NOW)).toBe('week');
  });

  it('beyond 7d → future', () => {
    expect(dueStatusFor('2026-06-20T12:00:00Z', NOW)).toBe('future');
  });

  it('unparseable date → no-due', () => {
    expect(dueStatusFor('not a date', NOW)).toBe('no-due');
  });
});

describe('class-assignments — chipMetaFor', () => {
  it('overdue tint uses danger', () => {
    expect(chipMetaFor('overdue', '2026-05-28').color).toBe('var(--theme-danger)');
  });

  it('today tint uses warning', () => {
    expect(chipMetaFor('today', '2026-05-29').color).toBe('var(--theme-warning)');
  });

  it('week tint uses info', () => {
    expect(chipMetaFor('week', '2026-06-01').color).toBe('var(--theme-info)');
  });

  it('future tint uses secondary fg', () => {
    expect(chipMetaFor('future', '2026-06-20').color).toBe('var(--theme-fg-secondary)');
  });

  it('no-due → "No due date" label, muted color', () => {
    const meta = chipMetaFor('no-due', null);
    expect(meta.label).toBe('No due date');
    expect(meta.color).toBe('var(--theme-fg-muted)');
  });
});

describe('class-assignments — filterByDueWithin', () => {
  const NOW = Date.parse('2026-05-29T12:00:00Z');
  const list = [
    { id: 'a', due_date: '2026-05-28T12:00:00Z' },                                  // overdue
    { id: 'b', due_date: '2026-05-29T20:00:00Z' },                                  // today
    { id: 'c', due_date: '2026-06-02T12:00:00Z' },                                  // this week
    { id: 'd', due_date: '2026-06-20T12:00:00Z' },                                  // future (3 weeks)
    { id: 'e', due_date: null },                                                    // no date
  ];

  it('window=today keeps overdue + today (not future, not no-date)', () => {
    expect(filterByDueWithin(list, 'today', NOW).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('window=week keeps overdue, today, week (not future)', () => {
    expect(filterByDueWithin(list, 'week', NOW).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('window=month keeps overdue, today, week, future-in-month', () => {
    expect(filterByDueWithin(list, 'month', NOW).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('window=all returns the list unchanged', () => {
    expect(filterByDueWithin(list, 'all', NOW).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('class-assignments — sortAssignments', () => {
  const list = [
    { id: 'a', due_date: '2026-06-10', created_at: '2026-05-25', lesson_title: 'Calc' },
    { id: 'b', due_date: '2026-05-30', created_at: '2026-05-28', lesson_title: 'Algebra', module_title: 'Math' },
    { id: 'c', due_date: undefined,    created_at: '2026-05-29', lesson_title: 'Bio',     module_title: 'Science' },
  ];

  it('due sorts soonest first; nulls last', () => {
    expect(sortAssignments(list, 'due').map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('created sorts newest first', () => {
    expect(sortAssignments(list, 'created').map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('title sorts alphabetically by lesson_title (or module_title fallback)', () => {
    expect(sortAssignments(list, 'title').map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('class sorts alphabetically by module_title', () => {
    expect(sortAssignments(list, 'class').map((x) => x.id)).toEqual(['a', 'b', 'c']);
    // 'a' has no module_title (empty string sorts first), then Math, Science.
  });
});

describe('class-assignments — labelForColumn', () => {
  it('returns labels for every column', () => {
    for (const c of ALL_ASSIGNMENT_COLUMNS) {
      expect(labelForColumn(c).length).toBeGreaterThan(0);
    }
  });
});
