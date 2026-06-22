import { describe, it, expect } from 'vitest';
import { dedupeTagsByLabel, resolvePayMultiplier, type ActivityTag } from '@/lib/work-mode/activity-tags';

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

// activity-tag-dedupe-2026-06-22 — the seed re-ran without a matching
// unique constraint, so the catalog could return 4x copies of the same
// label. The helper collapses them by case-insensitive trimmed label.
describe('activity-tags — dedupeTagsByLabel', () => {
  it('keeps a single row per label', () => {
    const out = dedupeTagsByLabel([
      { id: 'a', label: 'Drafting', system: true },
      { id: 'b', label: 'Drafting', system: true },
      { id: 'c', label: 'Drafting', system: true },
    ]);
    expect(out).toHaveLength(1);
  });

  it('treats whitespace + case-only differences as the same tag', () => {
    const out = dedupeTagsByLabel([
      { id: 'a', label: 'Field work', system: true },
      { id: 'b', label: '  field work', system: true },
      { id: 'c', label: 'FIELD WORK', system: true },
    ]);
    expect(out).toHaveLength(1);
  });

  it('prefers the system row when system + user rows collide', () => {
    const out = dedupeTagsByLabel([
      { id: 'u', label: 'Office', system: false },
      { id: 's', label: 'Office', system: true },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('s');
  });

  it('falls back to the lower id when both rows are the same `system` value', () => {
    const out = dedupeTagsByLabel([
      { id: 'zz', label: 'Drafting', system: true },
      { id: 'aa', label: 'Drafting', system: true },
    ]);
    expect(out[0].id).toBe('aa');
  });

  it('preserves distinct labels', () => {
    const out = dedupeTagsByLabel([
      { id: 'a', label: 'Drafting', system: true },
      { id: 'b', label: 'Drafting', system: true },
      { id: 'c', label: 'Office',   system: true },
    ]);
    expect(out).toHaveLength(2);
    const labels = out.map((t) => t.label).sort();
    expect(labels).toEqual(['Drafting', 'Office']);
  });

  it('drops rows with an empty label', () => {
    const out = dedupeTagsByLabel([
      { id: 'a', label: '',    system: true },
      { id: 'b', label: '   ', system: true },
      { id: 'c', label: 'Office', system: true },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('c');
  });
});
