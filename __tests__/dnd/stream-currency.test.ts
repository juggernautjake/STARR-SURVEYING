// __tests__/dnd/stream-currency.test.ts — chat currency + super chats (Phase R).
import { describe, it, expect } from 'vitest';
import {
  NUGGETS_PER_NOTE, nuggetsToNotes, nuggetsRemainder, notesToNuggets,
  superTier, SUPER_TIERS, rollDonationAmount, GENEROSITY, formatNuggets,
} from '@/lib/dnd/stream-currency';

describe('NeoNuggets ↔ notes', () => {
  it('converts whole notes with a remainder (10,000 per note)', () => {
    expect(NUGGETS_PER_NOTE).toBe(10_000);
    expect(nuggetsToNotes(25_000)).toBe(2);
    expect(nuggetsRemainder(25_000)).toBe(5_000);
    expect(nuggetsToNotes(9_999)).toBe(0);
    expect(notesToNuggets(3)).toBe(3 * NUGGETS_PER_NOTE);
  });
  it('never goes negative', () => {
    expect(nuggetsToNotes(-100)).toBe(0);
    expect(nuggetsRemainder(-5)).toBe(0);
  });
});

describe('superTier', () => {
  it('bands by amount and is monotonic', () => {
    expect(superTier(1).label).toBe('Blue');
    expect(superTier(9_999).label).toBe('Blue');
    expect(superTier(10_000).label).toBe('Teal'); // one note
    expect(superTier(5_000_000).label).toBe('Red');
    expect(superTier(1e12).label).toBe('Red'); // caps at the top tier
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

describe('formatNuggets', () => {
  it('compacts big numbers with the 🪙 symbol', () => {
    expect(formatNuggets(50)).toBe('🪙 50');
    expect(formatNuggets(1500)).toBe('🪙 1.5K');
    expect(formatNuggets(2_000_000)).toBe('🪙 2M');
  });
});
