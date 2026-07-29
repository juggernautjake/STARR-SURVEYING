// __tests__/dnd/bestiary-variants.test.ts — the weak/elite derivation (P13-10).
//
// The plan's requirement is that the formula be STATED and TESTABLE. These are the tests; the `derivation`
// string is the statement, and it ships on every row so a DM can see where the numbers came from.
import { describe, it, expect } from 'vitest';
import { deriveVariant, shiftModifiers, pf2HpDelta, DAMAGE_UNVERIFIED } from '@/lib/dnd/bestiary/variants';

const pf2 = {
  name: 'Vampire', system: 'pathfinder2e', cr: '6', type: 'undead',
  statblock: { ac: 24, hp: 100, saves: 'Fort +14, Ref +12', entries: [{ kind: 'action' as const, name: 'Fangs', body: 'Bites.', toHit: '+16' }] },
};
const dnd = {
  name: 'Owlbear', system: 'dnd5e-2024', cr: '3', type: 'beast',
  statblock: { ac: 13, hp: 59, entries: [{ kind: 'action' as const, name: 'Beak', body: 'Pecks.', toHit: '+7' }] },
};

describe('Pathfinder 2e uses the PUBLISHED adjustment', () => {
  it('elite: +2 to AC, saves and attacks; HP by level band', () => {
    const v = deriveVariant(pf2, 'elite', 'scaling-family')!;
    expect(v.statblock.ac).toBe(26);
    expect(v.statblock.hp).toBe(120);           // level 6 → +20
    expect(v.statblock.saves).toBe('Fort +16, Ref +14');
    expect(v.statblock.entries![0].toHit).toBe('+18');
  });

  it('weak: the same numbers, downward', () => {
    const v = deriveVariant(pf2, 'weak', 'scaling-family')!;
    expect(v.statblock.ac).toBe(22);
    expect(v.statblock.hp).toBe(80);
    expect(v.statblock.saves).toBe('Fort +12, Ref +10');
  });

  it('bands HP by level, as published', () => {
    expect(pf2HpDelta(1)).toBe(10);
    expect(pf2HpDelta(3)).toBe(15);
    expect(pf2HpDelta(6)).toBe(20);
    expect(pf2HpDelta(20)).toBe(30);
  });

  it('says it is Pathfinder’s rule', () => {
    expect(deriveVariant(pf2, 'elite', 'scaling-family')!.derivation).toMatch(/Pathfinder 2e Elite adjustment/);
  });
});

describe('5e uses a HOUSE formula and says so', () => {
  it('labels itself as not an official rule', () => {
    // Ground Rule 3. 5e publishes no Weak/Elite adjustment, so presenting ours as the game's would be an
    // invented rule on a page a DM trusts.
    const v = deriveVariant(dnd, 'elite', 'named-tier')!;
    expect(v.derivation).toMatch(/house formula \(not an official rule\)/);
  });

  it('moves HP by 25% and AC/attack by 1', () => {
    const up = deriveVariant(dnd, 'elite', 'named-tier')!;
    expect(up.statblock.hp).toBe(74);           // 59 * 1.25 = 73.75 → 74
    expect(up.statblock.ac).toBe(14);
    expect(up.statblock.entries![0].toHit).toBe('+8');
    const down = deriveVariant(dnd, 'weak', 'named-tier')!;
    expect(down.statblock.hp).toBe(44);
    expect(down.statblock.ac).toBe(12);
  });

  it('uses a SMALLER step than PF2, deliberately', () => {
    // 5e's bounded accuracy makes ±2 AC roughly a 10% swing on every attack; the same number compounds
    // far faster than it does in PF2. If these ever match, the reasoning has been lost.
    const d = deriveVariant(dnd, 'elite', 'named-tier')!;
    const p = deriveVariant(pf2, 'elite', 'scaling-family')!;
    expect(d.statblock.ac! - dnd.statblock.ac).toBeLessThan(p.statblock.ac! - pf2.statblock.ac);
  });

  it('does not invent a CR', () => {
    const v = deriveVariant(dnd, 'elite', 'named-tier')!;
    expect(v.statblock.cr).toBeUndefined();
    expect(v.notes.join(' ')).toMatch(/Challenge rating is left as written/);
  });
});

describe('what it refuses to do', () => {
  it('returns null for `base` — the parent IS the base', () => {
    // Storing a duplicate base row would give two places to fix one typo.
    expect(deriveVariant(pf2, 'base', 'scaling-family')).toBeNull();
  });

  it('returns null for an ineligible creature', () => {
    // So the caller cannot accidentally generate three versions of a rabbit.
    expect(deriveVariant(dnd, 'elite', 'none')).toBeNull();
  });

  it('leaves damage alone, and says why', () => {
    // The honest hole: the published per-attack damage rule has not been verified against its source, so
    // it is flagged rather than guessed. A wrong-but-visible number beats a silently invented one.
    const v = deriveVariant(pf2, 'elite', 'scaling-family')!;
    expect(v.notes).toContain(DAMAGE_UNVERIFIED);
  });

  it('never drives HP or AC below a legal floor', () => {
    const tiny = { name: 'Rat', system: 'dnd5e-2024', cr: '0', type: 'undead', statblock: { ac: 1, hp: 1 } };
    const v = deriveVariant(tiny, 'weak', 'scaling-family')!;
    expect(v.statblock.hp).toBeGreaterThanOrEqual(1);
    expect(v.statblock.ac).toBeGreaterThanOrEqual(0);
  });
});

describe('shiftModifiers', () => {
  it('shifts every signed number and leaves prose alone', () => {
    expect(shiftModifiers('Fort +14, Ref +12', 2)).toBe('Fort +16, Ref +14');
    expect(shiftModifiers('+1', -3)).toBe('-2');
    expect(shiftModifiers('darkvision 60 ft.', 2)).toBe('darkvision 60 ft.');
  });
});
