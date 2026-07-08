// __tests__/dnd/stream-currency.test.ts — chat currency + donations (Phase R).
import { describe, it, expect } from 'vitest';
import {
  KIBBLES_PER_GOLD, kibblesToGold, kibblesRemainder, goldToKibbles,
  superTier, SUPER_TIERS, rollDonationAmount, GENEROSITY, formatKibbles,
} from '@/lib/dnd/stream-currency';

describe('kibbles ↔ gold', () => {
  it('converts whole gold with a remainder', () => {
    expect(kibblesToGold(250)).toBe(2);
    expect(kibblesRemainder(250)).toBe(50);
    expect(kibblesToGold(99)).toBe(0);
    expect(goldToKibbles(3)).toBe(3 * KIBBLES_PER_GOLD);
  });
  it('never goes negative', () => {
    expect(kibblesToGold(-100)).toBe(0);
    expect(kibblesRemainder(-5)).toBe(0);
  });
});

describe('superTier', () => {
  it('bands by amount and is monotonic', () => {
    expect(superTier(1).label).toBe('Blue');
    expect(superTier(49).label).toBe('Blue');
    expect(superTier(50).label).toBe('Teal');
    expect(superTier(20000).label).toBe('Red');
    expect(superTier(1e9).label).toBe('Red'); // caps at the top tier
    let prevMin = -1;
    for (const t of SUPER_TIERS) { expect(t.min).toBeGreaterThan(prevMin); prevMin = t.min; }
  });
});

describe('rollDonationAmount', () => {
  it('off always yields 0', () => {
    for (const r of [0, 0.5, 0.99]) expect(rollDonationAmount('off', r, r)).toBe(0);
  });
  it('on-levels always yield ≥ 1 and scale with generosity', () => {
    for (const g of ['stingy', 'normal', 'generous', 'overgiving'] as const) {
      for (const r of [0, 0.3, 0.7, 0.99]) expect(rollDonationAmount(g, r, 0.99)).toBeGreaterThanOrEqual(1);
    }
    // averaged, more-generous levels give more (sample the mid roll, no whale)
    const mid = (g: 'stingy' | 'normal' | 'generous' | 'overgiving') => rollDonationAmount(g, 0.5, 0.99);
    expect(mid('stingy')).toBeLessThan(mid('normal'));
    expect(mid('normal')).toBeLessThan(mid('generous'));
    expect(mid('generous')).toBeLessThan(mid('overgiving'));
  });
});

describe('generosity config', () => {
  it('off is the zero level; rates rise with generosity', () => {
    expect(GENEROSITY.off.perMin).toBe(0);
    expect(GENEROSITY.stingy.perMin).toBeLessThan(GENEROSITY.normal.perMin);
    expect(GENEROSITY.generous.perMin).toBeLessThan(GENEROSITY.overgiving.perMin);
  });
});

describe('formatKibbles', () => {
  it('compacts big numbers with the 🐟 symbol', () => {
    expect(formatKibbles(50)).toBe('🐟 50');
    expect(formatKibbles(1500)).toBe('🐟 1.5K');
    expect(formatKibbles(2_000_000)).toBe('🐟 2M');
  });
});
