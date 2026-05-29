// __tests__/hub/widgets/my-jobs-aggregator.test.ts
//
// Slice 198 — locks the gate that decides whether `my-jobs` can use
// the aggregator-fed cached payload or has to run its own fetch.

import { describe, it, expect } from 'vitest';
import { matchesAggregatorDefaults } from '@/lib/hub/widgets/my-jobs';

describe('matchesAggregatorDefaults — my-jobs', () => {
  it('returns true when the surveyor uses defaults', () => {
    expect(matchesAggregatorDefaults({
      filter: 'mine',
      stage: 'fieldwork',
      columns: ['name'],
      sortBy: 'updated',
      rowLimit: 10,
      showStageColors: true,
    })).toBe(true);
  });

  it('returns false when the surveyor switched filter away from "mine"', () => {
    expect(matchesAggregatorDefaults({
      filter: 'all',
      stage: 'fieldwork',
      columns: ['name'],
      sortBy: 'updated',
      rowLimit: 10,
      showStageColors: true,
    })).toBe(false);
  });

  it('returns false when the surveyor switched filter to by-stage', () => {
    expect(matchesAggregatorDefaults({
      filter: 'by-stage',
      stage: 'drawing',
      columns: ['name'],
      sortBy: 'updated',
      rowLimit: 10,
      showStageColors: true,
    })).toBe(false);
  });

  it('returns false when the surveyor changed rowLimit', () => {
    expect(matchesAggregatorDefaults({
      filter: 'mine',
      stage: 'fieldwork',
      columns: ['name'],
      sortBy: 'updated',
      rowLimit: 25,
      showStageColors: true,
    })).toBe(false);
  });

  it('treats sortBy / columns / showStageColors as client-only — they do NOT bust the cache', () => {
    expect(matchesAggregatorDefaults({
      filter: 'mine',
      stage: 'fieldwork',
      columns: ['jobNumber', 'name'],
      sortBy: 'name',
      rowLimit: 10,
      showStageColors: false,
    })).toBe(true);
  });
});
