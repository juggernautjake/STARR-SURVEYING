// __tests__/hub/field-priority.test.ts
//
// Slice 3 of hub-widget-excellence-02-shared-infra. Locks the
// size-aware field-priority helper: deterministic prefixes per bucket,
// the tiny→xlarge progression is monotonic + nested, and custom caps
// work.

import { describe, it, expect } from 'vitest';
import { ALL_BUCKETS } from '@/lib/hub/size-bucket';
import {
  pickFields,
  fieldCountForBucket,
  DEFAULT_FIELD_CAPS,
} from '@/lib/hub/widgets/_shared/field-priority';

const FIELDS = ['name', 'number', 'due', 'stage', 'customer', 'address', 'quote', 'tags', 'crew', 'notes'];

describe('fieldCountForBucket — default caps', () => {
  it('tiny shows 1, small 3, medium 5, large 8, xlarge all', () => {
    expect(fieldCountForBucket('tiny')).toBe(1);
    expect(fieldCountForBucket('small')).toBe(3);
    expect(fieldCountForBucket('medium')).toBe(5);
    expect(fieldCountForBucket('large')).toBe(8);
    expect(fieldCountForBucket('xlarge')).toBe(Infinity);
  });
});

describe('pickFields — prefix per bucket', () => {
  it('tiny returns just the single most important field', () => {
    expect(pickFields(FIELDS, 'tiny')).toEqual(['name']);
  });

  it('small returns the top 3', () => {
    expect(pickFields(FIELDS, 'small')).toEqual(['name', 'number', 'due']);
  });

  it('medium returns the top 5', () => {
    expect(pickFields(FIELDS, 'medium')).toEqual(['name', 'number', 'due', 'stage', 'customer']);
  });

  it('large returns the top 8', () => {
    expect(pickFields(FIELDS, 'large')).toHaveLength(8);
  });

  it('xlarge returns every field', () => {
    expect(pickFields(FIELDS, 'xlarge')).toEqual(FIELDS);
  });
});

describe('pickFields — progression invariants', () => {
  it('is monotonic + nested (each bucket ⊇ the smaller one)', () => {
    let prevLen = -1;
    let prev: string[] = [];
    for (const bucket of ALL_BUCKETS) {
      const picked = pickFields(FIELDS, bucket);
      // Non-decreasing length as the widget grows.
      expect(picked.length).toBeGreaterThanOrEqual(prevLen);
      // The smaller bucket's fields are a prefix of this one.
      expect(picked.slice(0, prev.length)).toEqual(prev);
      prevLen = picked.length;
      prev = picked;
    }
  });

  it('the most-important field survives down to tiny', () => {
    expect(pickFields(FIELDS, 'tiny')[0]).toBe('name');
  });

  it('never returns more fields than exist', () => {
    const few = ['only', 'two'];
    expect(pickFields(few, 'xlarge')).toEqual(few);
    expect(pickFields(few, 'large')).toEqual(few);
  });

  it('returns a copy, not the original array', () => {
    const out = pickFields(FIELDS, 'xlarge');
    expect(out).not.toBe(FIELDS);
    out.push('mutated');
    expect(FIELDS).not.toContain('mutated');
  });
});

describe('pickFields — custom caps', () => {
  it('honors a per-widget cap override', () => {
    const caps = { ...DEFAULT_FIELD_CAPS, tiny: 2, small: 2 };
    expect(pickFields(FIELDS, 'tiny', caps)).toEqual(['name', 'number']);
    expect(pickFields(FIELDS, 'small', caps)).toEqual(['name', 'number']);
  });

  it('a zero cap yields an empty list', () => {
    const caps = { ...DEFAULT_FIELD_CAPS, tiny: 0 };
    expect(pickFields(FIELDS, 'tiny', caps)).toEqual([]);
  });
});
