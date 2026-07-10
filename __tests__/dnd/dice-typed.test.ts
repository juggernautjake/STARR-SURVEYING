import { describe, it, expect } from 'vitest';
import { rollTyped, type TypedSegmentInput } from '@/app/dnd/_sheet/lib/dice';

// Slice 2 of DND_ITEM_BUILDER: typed multi-part damage. Assertions are range/structure
// based (rollDie uses Math.random) — bounds are exact so there's no flakiness.

describe('rollTyped — per-damage-type breakdown', () => {
  it('rolls 2d8 slashing + 1d6 poison as two parts that sum to the total', () => {
    const r = rollTyped([
      { dice: '2d8', type: 'slashing' },
      { dice: '1d6', type: 'poison' },
    ]);
    expect(r.parts.map((p) => p.type)).toEqual(['slashing', 'poison']);
    const slash = r.parts.find((p) => p.type === 'slashing')!;
    const poison = r.parts.find((p) => p.type === 'poison')!;
    expect(slash.total).toBeGreaterThanOrEqual(2);
    expect(slash.total).toBeLessThanOrEqual(16);
    expect(poison.total).toBeGreaterThanOrEqual(1);
    expect(poison.total).toBeLessThanOrEqual(6);
    expect(r.total).toBe(slash.total + poison.total);
    expect(r.breakdown).toContain('slashing');
    expect(r.breakdown).toContain('poison');
  });

  it('doubles each segment on a crit', () => {
    const r = rollTyped([{ dice: '2d8', type: 'slashing' }], true);
    expect(r.crit).toBe(true);
    // 4d8 → [4, 32]
    expect(r.parts[0].total).toBeGreaterThanOrEqual(4);
    expect(r.parts[0].total).toBeLessThanOrEqual(32);
  });

  it('folds a flat modifier into its segment/type (2d8+3 slashing → [5,19])', () => {
    const r = rollTyped([{ dice: '2d8+3', type: 'slashing' }]);
    expect(r.parts[0].total).toBeGreaterThanOrEqual(5);
    expect(r.parts[0].total).toBeLessThanOrEqual(19);
  });

  it('merges same-type segments into one part (1d6 + 1d4 poison → [2,10])', () => {
    const r = rollTyped([
      { dice: '1d6', type: 'poison' },
      { dice: '1d4', type: 'poison' },
    ]);
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].type).toBe('poison');
    expect(r.parts[0].total).toBeGreaterThanOrEqual(2);
    expect(r.parts[0].total).toBeLessThanOrEqual(10);
  });

  it('skips empty/blank segments', () => {
    const segs: TypedSegmentInput[] = [
      { dice: '', type: 'poison' },
      { dice: '   ', type: 'fire' },
      { dice: '1d4', type: 'acid' },
    ];
    const r = rollTyped(segs);
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].type).toBe('acid');
  });

  it('handles a single untyped-ish component (back-compat)', () => {
    const r = rollTyped([{ dice: '1d10', type: '' }]);
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].type).toBe('untyped');
    expect(r.total).toBeGreaterThanOrEqual(1);
    expect(r.total).toBeLessThanOrEqual(10);
  });
});
