import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { byDueAscending, capForBucket, filterByDueWindow } from '@/lib/hub/widgets/assignments-due';

describe('assignments-due — registry', () => {
  it('registers in work category', () => {
    expect(getWidget('assignments-due')?.category).toBe('work');
  });
});

describe('assignments-due — capForBucket', () => {
  it('counts per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('small')).toBe(4);
    expect(capForBucket('medium')).toBe(6);
    expect(capForBucket('large')).toBe(12);
    expect(capForBucket('xlarge')).toBe(24);
  });
});

describe('assignments-due — filterByDueWindow', () => {
  const NOW = Date.parse('2026-05-29T12:00:00Z');
  const list = [
    { id: 'a', title: 'overdue', due_date: '2026-05-28T12:00:00Z' },
    { id: 'b', title: 'today',   due_date: '2026-05-29T20:00:00Z' },
    { id: 'c', title: 'week',    due_date: '2026-06-02T12:00:00Z' },
    { id: 'd', title: 'future',  due_date: '2026-06-20T12:00:00Z' },
    { id: 'e', title: 'no date' },
  ];

  it('today keeps overdue + today', () => {
    expect(filterByDueWindow(list, 'today', NOW).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('week keeps overdue + today + week', () => {
    expect(filterByDueWindow(list, 'week', NOW).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('month keeps overdue/today/week/future-in-month', () => {
    expect(filterByDueWindow(list, 'month', NOW).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('all returns everything', () => {
    expect(filterByDueWindow(list, 'all', NOW).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('assignments-due — byDueAscending', () => {
  it('soonest first; missing dates last', () => {
    const sorted = [
      { id: 'a', title: 'x', due_date: '2026-06-10' },
      { id: 'b', title: 'x', due_date: '2026-06-01' },
      { id: 'c', title: 'x' },
    ].sort(byDueAscending);
    expect(sorted.map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });
});
