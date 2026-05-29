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
    expect(def?.minSize).toEqual({ w: 2, h: 2 });
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

describe('my-jobs — visibleColumnsForBucket', () => {
  const allCols: JobColumn[] = ['jobNumber', 'name', 'stage', 'client', 'updated'];

  it('tiny keeps only name + stage', () => {
    expect(visibleColumnsForBucket(allCols, 'tiny')).toEqual(['name', 'stage']);
  });

  it('small drops the client column', () => {
    expect(visibleColumnsForBucket(allCols, 'small')).toEqual(['jobNumber', 'name', 'stage', 'updated']);
  });

  it('medium and larger preserve every selected column', () => {
    expect(visibleColumnsForBucket(allCols, 'medium')).toEqual(allCols);
    expect(visibleColumnsForBucket(allCols, 'large')).toEqual(allCols);
    expect(visibleColumnsForBucket(allCols, 'xlarge')).toEqual(allCols);
  });

  it('tiny respects user removal of the chosen columns', () => {
    expect(visibleColumnsForBucket(['name'], 'tiny')).toEqual(['name']);
    expect(visibleColumnsForBucket(['client'], 'tiny')).toEqual([]);
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
});

describe('my-jobs — labelForColumn', () => {
  it('returns a human label for every column', () => {
    for (const c of ALL_JOB_COLUMNS) {
      expect(labelForColumn(c).length).toBeGreaterThan(0);
    }
  });
});
