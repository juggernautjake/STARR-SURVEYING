import { describe, it, expect } from 'vitest';
import { rollTyped, weaponSegments, type TypedSegmentInput } from '@/app/dnd/_sheet/lib/dice';

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

  it('a crit on a segment WITH a flat doubles the DICE but adds the flat ONCE (the weapon-crit path)', () => {
    // rollWeaponDamage folds the ability modifier into the segment (weaponSegments → e.g. 2d8+3) and then
    // crits via rollTyped — so the everyday martial critical hit takes THIS path, not rollDamage's. The
    // "double the dice, never the flat" rule is pinned for rollDamage (dice-core) but was untested here,
    // where doubling the +3 would silently inflate every weapon crit by the wielder's ability mod. This is
    // deterministic: it reads the ACTUAL rolled dice out of the breakdown and checks the arithmetic, so it
    // proves the flat wasn't doubled regardless of what the dice came up.
    const r = rollTyped([{ dice: '2d8+3', type: 'slashing' }], true);
    expect(r.crit).toBe(true);
    const part = r.parts[0];
    const diceVals = (part.breakdown.match(/\[([0-9,]+)\]/)?.[1] ?? '').split(',').filter(Boolean).map(Number);
    expect(diceVals).toHaveLength(4); // 2d8 doubled to 4d8
    for (const v of diceVals) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(8); }
    // The flat is added exactly once: total minus the four actual dice equals 3 (never 6).
    expect(part.total - diceVals.reduce((a, b) => a + b, 0)).toBe(3);
    expect(part.breakdown).toContain('+3');
    expect(part.breakdown).not.toContain('+6');
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

describe('weaponSegments — item → typed roll composition (as rollWeaponDamage uses it)', () => {
  it('folds the flat (ability mod + rage) into the primary type and appends typed bonus dice', () => {
    // A sword: 2d8 slashing + 1d6 poison, drinker has STR mod +3.
    const segs = weaponSegments({ dice: '2d8', type: 'slashing' }, [{ dice: '1d6', type: 'poison' }], 3);
    expect(segs).toEqual<TypedSegmentInput[]>([
      { dice: '2d8+3', type: 'slashing' },
      { dice: '1d6', type: 'poison' },
    ]);
    // And the full roll produces a slashing part (incl. +3) and a separate poison part.
    const r = rollTyped(segs);
    expect(r.parts.map((p) => p.type)).toEqual(['slashing', 'poison']);
    expect(r.parts[0].total).toBeGreaterThanOrEqual(5); // 2d8 min 2 + 3
    expect(r.parts[1].total).toBeGreaterThanOrEqual(1); // 1d6, no mod
  });

  it('omits the flat when zero and skips blank bonus dice', () => {
    expect(weaponSegments({ dice: '1d6', type: 'bludgeoning' }, [{ dice: '', type: 'fire' }], 0)).toEqual([
      { dice: '1d6', type: 'bludgeoning' },
    ]);
  });

  it('applies a negative flat correctly', () => {
    expect(weaponSegments({ dice: '1d4', type: 'piercing' }, undefined, -1)).toEqual([
      { dice: '1d4-1', type: 'piercing' },
    ]);
  });
});
