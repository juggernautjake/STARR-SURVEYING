// __tests__/dnd/death-save.test.ts — the life-or-death rule, now pinned. applyDeathSave is the single
// source the store's rollDeathSave uses for BOTH the roll-log label and the tracked success/failure
// counts (they used to be two separate inline copies of these branches, free to drift). A regression here
// — nat 1 giving one failure, a lost cap, nat 20 not regaining HP — would silently mis-handle a dying PC.
import { describe, it, expect } from 'vitest';
import { applyDeathSave } from '@/app/dnd/_sheet/lib/death-save';

const S = (deathSuccess: number, deathFail: number, currentHp = 0) => ({ deathSuccess, deathFail, currentHp });

describe('applyDeathSave', () => {
  it('a natural 20 regains 1 HP and CLEARS both tracks (waking up)', () => {
    const r = applyDeathSave(S(1, 2, 0), 20, 20);
    expect(r).toMatchObject({ deathSuccess: 0, deathFail: 0, currentHp: 1, label: 'NAT 20 — regain 1 HP!' });
  });

  it('a natural 20 never lowers an already-positive HP (Math.max)', () => {
    expect(applyDeathSave(S(0, 0, 5), 20, 20).currentHp).toBe(5);
  });

  it('a natural 1 adds TWO failures', () => {
    const r = applyDeathSave(S(0, 0), 1, 1);
    expect(r).toMatchObject({ deathSuccess: 0, deathFail: 2, label: 'NAT 1 — two failures' });
  });

  it('total ≥ 10 is a success; total < 10 is a failure (DC 10, using the folded total not the raw die)', () => {
    expect(applyDeathSave(S(0, 0), 12, 10)).toMatchObject({ deathSuccess: 1, deathFail: 0, label: 'Success' });
    expect(applyDeathSave(S(0, 0), 9, 9)).toMatchObject({ deathSuccess: 0, deathFail: 1, label: 'Failure' });
    // The threshold is the TOTAL, not the natural: a die of 12 folded down to 8 by exhaustion FAILS.
    expect(applyDeathSave(S(0, 0), 12, 8)).toMatchObject({ deathFail: 1, label: 'Failure' });
  });

  it('caps each track at 3 — a second nat 1 at 2 failures lands on 3, never 4', () => {
    expect(applyDeathSave(S(0, 2), 1, 1).deathFail).toBe(3);
    expect(applyDeathSave(S(3, 0), 15, 15).deathSuccess).toBe(3); // already stable, stays 3
  });

  it('does not touch the OTHER track (a failure leaves successes alone, and vice versa)', () => {
    expect(applyDeathSave(S(2, 0), 5, 5)).toMatchObject({ deathSuccess: 2, deathFail: 1 }); // fail keeps 2 successes
    expect(applyDeathSave(S(0, 2), 15, 15)).toMatchObject({ deathSuccess: 1, deathFail: 2 }); // success keeps 2 fails
  });
});
