import { describe, it, expect } from 'vitest';
import { igCarryingCapacity } from '@/lib/dnd/systems/intuitive-games/rules';

// The IG encumbrance chart lives only as an image on intuitivegames.net; these pin the exact numbers read
// from that image (STR 6–20), so the helper stays faithful to Brendan's table. Source:
// docs/reference/intuitive-games/stat-tables-from-images.md.

describe('igCarryingCapacity — matches the site encumbrance image', () => {
  const rows: [number, number, number, number, number, number][] = [
    // STR, comfHeld, comfCarry, maxHeld, maxCarry, maxDrag
    [6, 5, 10, 10, 20, 30],
    [10, 25, 50, 50, 100, 150],
    [12, 35, 70, 70, 140, 210],
    [16, 55, 110, 110, 220, 330],
    [20, 75, 150, 150, 300, 450],
  ];
  it('reproduces the image table row-for-row', () => {
    for (const [str, ch, cc, mh, mc, md] of rows) {
      const c = igCarryingCapacity(str);
      expect(c).toEqual({ comfortableHeld: ch, comfortableCarry: cc, maximumHeld: mh, maximumCarry: mc, maximumDrag: md });
    }
  });

  it('STR 19 (a listed row) works via the continuous base formula', () => {
    expect(igCarryingCapacity(19)).toEqual({ comfortableHeld: 70, comfortableCarry: 140, maximumHeld: 140, maximumCarry: 280, maximumDrag: 420 });
  });

  it('quadrupeds triple every limit (per the rules text)', () => {
    expect(igCarryingCapacity(10, { quadruped: true })).toEqual({ comfortableHeld: 75, comfortableCarry: 150, maximumHeld: 150, maximumCarry: 300, maximumDrag: 450 });
  });

  it('a very low Strength clamps to 0 (never negative)', () => {
    expect(igCarryingCapacity(5)).toEqual({ comfortableHeld: 0, comfortableCarry: 0, maximumHeld: 0, maximumCarry: 0, maximumDrag: 0 });
    expect(igCarryingCapacity(3).maximumDrag).toBe(0);
  });
});
