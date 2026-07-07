// __tests__/dnd/attack-roll.test.ts — attack builder → roll engine (Phase C18).
// Math.random is mocked so every die is deterministic:
//   0.5   → d20 = 11, d6 = 4, d8 = 5   (floor(r*sides)+1)
//   0.999 → d20 = 20 (crit), d6 = 6
//   0     → d20 = 1  (fumble), d6 = 1
import { describe, it, expect, vi, afterEach } from 'vitest';
import { rollAttack, rollSaveAttack, rollMode } from '@/app/dnd/_sheet/engine/attack-roll';
import type { AttackEntry } from '@/app/dnd/_sheet/engine/weapons';

const greatsword: AttackEntry = {
  id: 'g', name: 'Greatsword', ability: 'str', toHit: 6,
  damageDice: '2d6', damageType: 'slashing', damageMod: 4, properties: [], proficient: true,
};

const fixedRandom = (v: number) => vi.spyOn(Math, 'random').mockReturnValue(v);
afterEach(() => vi.restoreAllMocks());

describe('rollMode', () => {
  it('advantage + disadvantage cancel to flat', () => {
    expect(rollMode({ advantage: true, disadvantage: true })).toBe('flat');
    expect(rollMode({ advantage: true })).toBe('adv');
    expect(rollMode({ disadvantage: true })).toBe('dis');
  });
});

describe('rollAttack: to-hit', () => {
  it('applies the entry to-hit bonus + situational', () => {
    fixedRandom(0.5); // nat 11
    const r = rollAttack(greatsword, { situationalToHit: 2 });
    expect(r.toHit.natural).toBe(11);
    expect(r.toHit.total).toBe(11 + 6 + 2); // 19
    expect(r.crit).toBe(false);
  });
  it('reports hit/miss vs a target AC', () => {
    fixedRandom(0.5); // total 17
    expect(rollAttack(greatsword, { targetAC: 15 }).hit).toBe(true);
    fixedRandom(0.5);
    expect(rollAttack(greatsword, { targetAC: 18 }).hit).toBe(false);
  });
});

describe('rollAttack: crit doubles dice (not mods)', () => {
  it('nat 20 crits and doubles the damage dice', () => {
    fixedRandom(0.999); // nat 20; d6 = 6
    const r = rollAttack(greatsword);
    expect(r.crit).toBe(true);
    // 2d6 -> 4d6 all sixes = 24, + damageMod 4 = 28 (mod NOT doubled)
    expect(r.damage.dice).toHaveLength(4);
    expect(r.damageTotal).toBe(28);
  });
  it('nat 1 always misses vs any AC', () => {
    fixedRandom(0); // nat 1
    const r = rollAttack(greatsword, { targetAC: 1 });
    expect(r.fumble).toBe(true);
    expect(r.hit).toBe(false);
  });
});

describe('rollAttack: extra damage dice', () => {
  it('adds extra dice (e.g. a flametongue) to the pool', () => {
    fixedRandom(0.5); // d6 = 4
    const r = rollAttack(greatsword, { extraDamageDice: '1d6' });
    // 2d6 + 1d6 = 3 dice * 4 = 12, + mod 4 = 16
    expect(r.damage.dice).toHaveLength(3);
    expect(r.damageTotal).toBe(16);
  });
});

describe('rollSaveAttack: uses the computed DC', () => {
  it('passes the DC through and halves on save', () => {
    fixedRandom(0.999); // d6 = 6
    const r = rollSaveAttack({ saveDC: 15, saveAbility: 'dex', damageDice: '8d6' });
    expect(r.saveDC).toBe(15);
    expect(r.fullDamage).toBe(48); // 8 * 6
    expect(r.halfDamage).toBe(24);
  });
});
