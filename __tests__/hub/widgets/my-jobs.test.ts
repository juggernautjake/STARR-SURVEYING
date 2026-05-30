// __tests__/hub/widgets/my-jobs.test.ts
//
// Slice 108 — My Jobs widget helpers + registry round-trip.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import {
  ALL_JOB_COLUMNS,
  capForBucket,
  labelForColumn,
  sortJobs,
  visibleColumnsForBucket,
  formatDue,
  formatQuote,
  type JobColumn,
} from '@/lib/hub/widgets/my-jobs';

describe('my-jobs widget — registry', () => {
  it('registers under id "my-jobs" in the work category', () => {
    const def = getWidget('my-jobs');
    expect(def).toBeDefined();
    expect(def?.id).toBe('my-jobs');
    expect(def?.category).toBe('work');
    expect(def?.iconName).toBe('FolderOpen');
  });

  it('default size 6×3, min 3×2, max 12×6', () => {
    const def = getWidget('my-jobs');
    expect(def?.defaultSize).toEqual({ w: 4, h: 3 });
    expect(def?.minSize).toEqual({ w: 1, h: 1 });  // Slice 217
    expect(def?.maxSize).toEqual({ w: 8, h: 8 });
  });
});

describe('my-jobs — capForBucket', () => {
  it('tiny → 2', () => { expect(capForBucket('tiny')).toBe(2); });
  it('small → 4', () => { expect(capForBucket('small')).toBe(4); });
  it('medium → 6', () => { expect(capForBucket('medium')).toBe(6); });
  it('large → 10', () => { expect(capForBucket('large')).toBe(10); });
  it('xlarge → 25', () => { expect(capForBucket('xlarge')).toBe(25); });
});

describe('my-jobs — visibleColumnsForBucket (field-priority)', () => {
  // Build/Wire (doc 10): returns the user's selected columns in
  // importance order, capped per bucket.
  it('small shows the user-listed "name+number, due, stage" set', () => {
    const cols: JobColumn[] = ['jobNumber', 'name', 'stage', 'client', 'due', 'address', 'quote', 'updated'];
    expect(visibleColumnsForBucket(cols, 'small')).toEqual(['name', 'jobNumber', 'due', 'stage']);
  });

  it('grows the column set as the widget grows (nested supersets)', () => {
    const cols: JobColumn[] = ['jobNumber', 'name', 'stage', 'client', 'due', 'address', 'quote', 'updated'];
    expect(visibleColumnsForBucket(cols, 'medium')).toEqual(['name', 'jobNumber', 'due', 'stage', 'client']);
    expect(visibleColumnsForBucket(cols, 'large')).toEqual(['name', 'jobNumber', 'due', 'stage', 'client', 'address', 'quote']);
    expect(visibleColumnsForBucket(cols, 'xlarge')).toEqual(['name', 'jobNumber', 'due', 'stage', 'client', 'address', 'quote', 'updated']);
  });

  it('orders by importance, not by the user\'s checkbox order', () => {
    expect(visibleColumnsForBucket(['updated', 'stage', 'name'], 'xlarge')).toEqual(['name', 'stage', 'updated']);
  });

  it('only ever returns columns the user selected', () => {
    expect(visibleColumnsForBucket(['name'], 'small')).toEqual(['name']);
    expect(visibleColumnsForBucket(['client'], 'small')).toEqual(['client']);
  });
});

describe('my-jobs — sortJobs', () => {
  const jobs = [
    { id: 'a', job_number: '2025-001', name: 'Alpha', stage: 'fieldwork', updated_at: '2025-03-01T00:00:00Z', created_at: '2025-02-01T00:00:00Z' },
    { id: 'b', job_number: '2025-002', name: 'Beta',  stage: 'quote',     updated_at: '2025-04-01T00:00:00Z', created_at: '2025-03-15T00:00:00Z' },
    { id: 'c', job_number: '2025-003', name: 'Charlie', stage: 'drawing', updated_at: '2025-01-15T00:00:00Z', created_at: '2025-01-01T00:00:00Z' },
  ];

  it('updated puts most recent first', () => {
    expect(sortJobs(jobs, 'updated').map((j) => j.id)).toEqual(['b', 'a', 'c']);
  });

  it('created puts most recently created first', () => {
    expect(sortJobs(jobs, 'created').map((j) => j.id)).toEqual(['b', 'a', 'c']);
  });

  it('stage sorts alphabetically', () => {
    expect(sortJobs(jobs, 'stage').map((j) => j.stage)).toEqual(['drawing', 'fieldwork', 'quote']);
  });

  it('name sorts alphabetically', () => {
    expect(sortJobs(jobs, 'name').map((j) => j.name)).toEqual(['Alpha', 'Beta', 'Charlie']);
  });

  it('due sorts soonest-first, deadline-less jobs last', () => {
    const withDue = [
      { id: 'x', job_number: '1', name: 'X', stage: 'quote', deadline: '2026-06-10T00:00:00Z' },
      { id: 'y', job_number: '2', name: 'Y', stage: 'quote', deadline: null },
      { id: 'z', job_number: '3', name: 'Z', stage: 'quote', deadline: '2026-06-01T00:00:00Z' },
    ];
    expect(sortJobs(withDue, 'due').map((j) => j.id)).toEqual(['z', 'x', 'y']);
  });
});

describe('my-jobs — labelForColumn', () => {
  it('returns a human label for every column (incl. due/address/quote)', () => {
    for (const c of ALL_JOB_COLUMNS) {
      expect(labelForColumn(c).length).toBeGreaterThan(0);
    }
    expect(ALL_JOB_COLUMNS).toContain('due');
    expect(ALL_JOB_COLUMNS).toContain('address');
    expect(ALL_JOB_COLUMNS).toContain('quote');
  });
});

describe('my-jobs — formatDue + formatQuote', () => {
  const NOW = Date.UTC(2026, 4, 30, 12, 0, 0);

  it('formats relative due dates', () => {
    expect(formatDue('2026-05-28', NOW)).toBe('overdue 2d');
    expect(formatDue('2026-05-30', NOW)).toBe('due today');
    expect(formatDue('2026-06-02', NOW)).toBe('in 3d');
  });

  it('formats quote as whole dollars', () => {
    expect(formatQuote(12500)).toBe('$12,500');
    expect(formatQuote('9999.6')).toBe('$10,000');
    expect(formatQuote('nope')).toBe('');
  });
});
