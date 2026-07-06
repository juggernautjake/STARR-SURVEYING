// __tests__/dnd/initiative.test.ts — initiative order + turn advance (Phase G4).
import { describe, it, expect } from 'vitest';
import { orderEntries, advanceTurn } from '@/lib/dnd/initiative';

describe('orderEntries', () => {
  it('sorts by initiative desc, ties by sort_order', () => {
    const entries = [
      { id: 'a', initiative: 12, sort_order: 0 },
      { id: 'b', initiative: 20, sort_order: 1 },
      { id: 'c', initiative: 12, sort_order: 2 },
      { id: 'd', initiative: null, sort_order: 3 },
    ];
    expect(orderEntries(entries).map((e) => e.id)).toEqual(['b', 'a', 'c', 'd']);
  });
  it('does not mutate the input', () => {
    const entries = [{ initiative: 1, sort_order: 0 }, { initiative: 2, sort_order: 1 }];
    orderEntries(entries);
    expect(entries[0].initiative).toBe(1);
  });
});

describe('advanceTurn', () => {
  it('next within range just moves the cursor', () => {
    expect(advanceTurn(4, 1, 3, 'next')).toEqual({ index: 2, round: 3 });
  });
  it('next past the end starts a new round', () => {
    expect(advanceTurn(4, 3, 3, 'next')).toEqual({ index: 0, round: 4 });
  });
  it('prev within range moves back', () => {
    expect(advanceTurn(4, 2, 3, 'prev')).toEqual({ index: 1, round: 3 });
  });
  it('prev before the start goes to the previous round (min 1)', () => {
    expect(advanceTurn(4, 0, 3, 'prev')).toEqual({ index: 3, round: 2 });
    expect(advanceTurn(4, 0, 1, 'prev')).toEqual({ index: 3, round: 1 }); // round floored at 1
  });
  it('empty encounter is a no-op', () => {
    expect(advanceTurn(0, 0, 1, 'next')).toEqual({ index: 0, round: 1 });
  });
});
