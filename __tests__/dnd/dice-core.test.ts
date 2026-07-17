// __tests__/dnd/dice-core.test.ts — the two most fundamental dice rules, which were only covered
// indirectly. crit-range.test.ts exercises rollD20 in 'flat' mode only (crit threshold), and the crit
// damage test uses a die-only expression — so the advantage/disadvantage KEEP rule and the
// "a crit doubles the DICE, not the flat modifier" rule weren't directly pinned. Both are exact
// invariants regardless of the random values, so we can assert them deterministically over many rolls.
import { describe, it, expect } from 'vitest';
import { rollD20, rollDamage } from '@/app/dnd/_sheet/lib/dice';

describe('rollD20 advantage / disadvantage keep the right die', () => {
  it('advantage rolls two dice and keeps the HIGHER; disadvantage keeps the LOWER', () => {
    for (let i = 0; i < 300; i++) {
      const adv = rollD20(0, 'adv');
      expect(adv.rolls).toHaveLength(2);
      expect(adv.natural).toBe(Math.max(...adv.rolls));

      const dis = rollD20(0, 'dis');
      expect(dis.rolls).toHaveLength(2);
      expect(dis.natural).toBe(Math.min(...dis.rolls));
    }
  });

  it('flat mode rolls one die; the total folds the modifier', () => {
    for (let i = 0; i < 100; i++) {
      const r = rollD20(5, 'flat');
      expect(r.rolls).toHaveLength(1);
      expect(r.natural).toBe(r.rolls[0]);
      expect(r.total).toBe(r.natural + 5);
    }
  });
});

describe('a critical hit doubles the DICE, not the flat modifier (5e)', () => {
  it('2d6+3 on a crit rolls 4 dice but adds +3 once (never +6)', () => {
    for (let i = 0; i < 200; i++) {
      const r = rollDamage('2d6+3', true);
      expect(r.crit).toBe(true);
      expect(r.dice).toHaveLength(4); // 2d6 doubled
      expect(r.flat).toBe(3); // flat NEVER doubled
      expect(r.total).toBeGreaterThanOrEqual(4 * 1 + 3); // 7
      expect(r.total).toBeLessThanOrEqual(4 * 6 + 3); // 27 — would be 30 if the flat doubled
    }
  });

  it('the same expression un-critted rolls 2 dice and the same +3', () => {
    for (let i = 0; i < 100; i++) {
      const r = rollDamage('2d6+3', false);
      expect(r.dice).toHaveLength(2);
      expect(r.flat).toBe(3);
      expect(r.total).toBeGreaterThanOrEqual(2 + 3);
      expect(r.total).toBeLessThanOrEqual(12 + 3);
    }
  });
});
