import { describe, it, expect } from 'vitest';
import { resolvePayMultiplier, type ActivityTag } from '@/lib/work-mode/activity-tags';

const CATALOG: ActivityTag[] = [
  { id: 'field',  label: 'Field',  color: '#10B981', system: true, work_type_key: 'field' },
  { id: 'travel', label: 'Travel', color: '#F59E0B', system: true, work_type_key: 'travel' },
  { id: 'mtg',    label: 'Meeting', color: '#7C3AED', system: true, work_type_key: null },
];

const MULTIPLIERS = { field: 1.2, travel: 0.5 };

describe('activity-tags — resolvePayMultiplier', () => {
  it('returns 1.0 for empty tag set', () => {
    expect(resolvePayMultiplier([], CATALOG, MULTIPLIERS)).toBe(1.0);
  });

  it('uses the work_type_key multiplier', () => {
    expect(resolvePayMultiplier(['field'], CATALOG, MULTIPLIERS)).toBe(1.2);
  });

  it('multiplies multiple tags together', () => {
    expect(resolvePayMultiplier(['field', 'travel'], CATALOG, MULTIPLIERS)).toBeCloseTo(0.6, 4);
  });

  it('tags without a work_type_key are 1.0', () => {
    expect(resolvePayMultiplier(['mtg'], CATALOG, MULTIPLIERS)).toBe(1.0);
  });

  it('unknown tag ids are skipped', () => {
    expect(resolvePayMultiplier(['nonexistent'], CATALOG, MULTIPLIERS)).toBe(1.0);
  });

  it('missing multipliers default to 1.0 (no NaN propagation)', () => {
    expect(resolvePayMultiplier(['field'], CATALOG, {})).toBe(1.0);
  });
});
