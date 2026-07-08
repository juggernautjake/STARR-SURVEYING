// __tests__/dnd/stream-moods.test.ts — chat mood pool builder (Phase K).
import { describe, it, expect } from 'vitest';
import { MOODS, MOOD_IDS, moodById, buildMoodPool } from '@/lib/dnd/stream-moods';

const BASE = ['base-a', 'base-b', 'base-c', 'base-d', 'base-e', 'base-f', 'base-g', 'base-h'];

describe('MOODS', () => {
  it('defines the 10 expected moods with non-empty line pools', () => {
    expect(MOODS).toHaveLength(10);
    expect(MOOD_IDS).toEqual(['hype', 'backseat', 'simp', 'roast', 'panic', 'copium', 'flirty', 'conspiracy', 'hungry', 'wholesome']);
    for (const m of MOODS) {
      expect(m.lines.length).toBeGreaterThanOrEqual(10);
      expect(m.label).toBeTruthy();
      expect(m.icon).toBeTruthy();
    }
  });
  it('moodById resolves known ids and rejects unknown', () => {
    expect(moodById('hype')?.label).toBe('Hype');
    expect(moodById('nope')).toBeUndefined();
  });
});

describe('buildMoodPool', () => {
  it('returns the base pool (a copy) when no moods are selected', () => {
    const pool = buildMoodPool(BASE, []);
    expect(pool).toEqual(BASE);
    expect(pool).not.toBe(BASE); // copy, not the same reference
    expect(buildMoodPool(BASE, null)).toEqual(BASE);
  });
  it('uses a single mood\'s lines plus a light base seasoning', () => {
    const pool = buildMoodPool(BASE, ['hype']);
    const hype = moodById('hype')!;
    for (const l of hype.lines) expect(pool).toContain(l);
    // seasoned with some base lines so it never feels stuck
    expect(pool.some((l) => BASE.includes(l))).toBe(true);
  });
  it('blends multiple moods together', () => {
    const pool = buildMoodPool(BASE, ['hype', 'panic']);
    expect(pool).toContain('LETS GOOO'); // hype
    expect(pool).toContain('BEHIND YOU'); // panic
  });
  it('folds in AI-generated lines for the selected moods only', () => {
    const pool = buildMoodPool(BASE, ['hype'], { hype: ['ai-hype-1'], panic: ['ai-panic-unused'] });
    expect(pool).toContain('ai-hype-1');
    expect(pool).not.toContain('ai-panic-unused'); // panic not selected
  });
  it('ignores unknown mood ids', () => {
    expect(buildMoodPool(BASE, ['bogus'])).toEqual(BASE); // all filtered → default
  });
});
