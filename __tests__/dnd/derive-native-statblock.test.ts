// __tests__/dnd/derive-native-statblock.test.ts — N1-4 + N2-1.
//
// Two things are being pinned, and they are different in kind:
//
//   · the TIER MAP's arithmetic, which is a claim about how two systems' scales line up; and
//   · the DERIVATION's promises, which are claims about what it will and will not invent.
//
// The second matters more. A derivation that quietly guesses a tier, hides a clamp, or carries a 5e save
// into a Pathfinder block produces something that LOOKS like a stat block and is wrong in a way no reader
// can see. Every refusal below is there because the alternative is a plausible lie.
import { describe, it, expect } from 'vitest';

import {
  clampTier, crToLevel, formatTier, levelToCr, mapTier, nativeScaleFor, parseTier, rowFor, TIER_RANGE,
} from '@/lib/dnd/statblocks/tier';
import {
  deriveNativeStatblock, isRefusal, proficiencyFor, type DeriveInput,
} from '@/lib/dnd/statblocks/derive-native';
import { DND5E_TIERS, PF2_TIERS } from '@/lib/dnd/statblocks/tiers';
import type { Statblock } from '@/lib/dnd/homebrew/statblock';

const skunk: DeriveInput = {
  name: 'Skunk',
  system: 'dnd5e-2014',
  type: 'beast',
  size: 'tiny',
  cr: '1/4',
  statblock: {
    ac: 12, hp: 5, hitDice: '2d4', speed: '20 ft.', senses: 'darkvision 30 ft.',
    abilities: { str: 4, dex: 15, con: 11, int: 2, wis: 12, cha: 5 },
    saves: 'DEX +4',
    entries: [
      { kind: 'trait', name: 'Keen Smell', body: 'Advantage on Perception checks that rely on smell.' },
      { kind: 'action', name: 'Bite', body: 'Melee Weapon Attack.', toHit: '+4', damage: '1 piercing' },
    ],
  },
};

describe('the tier map — reading a creature onto another scale', () => {
  it('parses every shape a stat block writes a tier in', () => {
    expect(parseTier('1/4')).toBe(0.25);
    expect(parseTier('1/8')).toBe(0.125);
    expect(parseTier('13')).toBe(13);
    expect(parseTier('-1')).toBe(-1);
    expect(parseTier('CR 5')).toBe(5);
    expect(parseTier('Level 7')).toBe(7);
    expect(parseTier('5 (1,800 XP)')).toBe(5);
    expect(parseTier(3)).toBe(3);
  });

  it('says nothing rather than zero when the tier is absent', () => {
    // The N1-1 bug in one line: `Number('')` is 0 and `isFinite(0)` is true, so an unguarded read turns
    // "no tier" into "tier 0" — the weakest creature in the game, silently.
    for (const v of ['', '   ', '—', 'unknown', null, undefined, NaN]) {
      expect(parseTier(v as string), `${String(v)} must not parse`).toBeNull();
    }
  });

  it('is identity across the range both systems share', () => {
    for (let t = 1; t <= 20; t++) {
      expect(crToLevel(t)).toBe(t);
      expect(levelToCr(t)).toBe(t);
    }
  });

  it('collapses 5e’s three fractions onto Pathfinder’s two sub-1 integers, and says so', () => {
    expect(crToLevel(0)).toBe(-1);
    expect(crToLevel(0.125)).toBe(-1);
    expect(crToLevel(0.25)).toBe(-1);
    expect(crToLevel(0.5)).toBe(0);
    // Not a round trip, and it cannot be — three values do not fit in two.
    expect(levelToCr(-1)).toBe(0.25);
    expect(levelToCr(0)).toBe(0.5);
    expect(crToLevel(0.125)).toBe(crToLevel(0.25));
  });

  it('clamps beyond each system’s published range instead of extrapolating', () => {
    expect(crToLevel(30)).toBe(TIER_RANGE.pf2.max);
    expect(clampTier(40, 'dnd')).toBe(30);
    expect(clampTier(-9, 'pf2')).toBe(-1);
    expect(clampTier(-9, 'dnd')).toBe(0);
  });

  it('reports the clamp rather than hiding it', () => {
    // The property that lets a derived block say "held at the ceiling" instead of implying an exact match.
    expect(mapTier(30, 'dnd', 'pf2')).toEqual({ tier: 24, clamped: true });
    expect(mapTier(10, 'dnd', 'pf2')).toEqual({ tier: 10, clamped: false });
    expect(mapTier(7, 'dnd', 'dnd')).toEqual({ tier: 7, clamped: false });
  });

  it('finds the nearest measured row and says whether it was exact', () => {
    const exact = rowFor(5, 'dnd');
    expect(exact?.exact).toBe(true);
    expect(exact?.row.tier).toBe(5);
    // A tier the table omits (too few creatures to measure) still answers, and flags itself.
    const missing = rowFor(29.5, 'dnd');
    expect(missing).not.toBeNull();
    expect(missing?.exact).toBe(false);
  });

  it('writes a tier the way its own system writes it', () => {
    expect(formatTier(0.25, 'dnd')).toBe('1/4');
    expect(formatTier(0.125, 'dnd')).toBe('1/8');
    expect(formatTier(0.5, 'dnd')).toBe('1/2');
    expect(formatTier(12, 'dnd')).toBe('12');
    expect(formatTier(-1, 'pf2')).toBe('-1');
  });

  it('knows Intuitive Games has no table, and does not lend it one', () => {
    expect(nativeScaleFor('intuitive-games')).toBeNull();
    expect(nativeScaleFor('pathfinder2e')).toBe('pf2');
    expect(nativeScaleFor('dnd5e-2014')).toBe('dnd');
    expect(nativeScaleFor('dnd5e-2024')).toBe('dnd');
  });
});

describe('deriveNativeStatblock — what it refuses to invent', () => {
  it('refuses Intuitive Games, with the reason a reader can act on', () => {
    const r = deriveNativeStatblock(skunk, 'intuitive-games');
    expect(isRefusal(r)).toBe(true);
    if (isRefusal(r)) expect(r.reason).toMatch(/no creature-building table/i);
  });

  it('refuses a creature with no tier rather than guessing one', () => {
    const r = deriveNativeStatblock({ ...skunk, cr: null, statblock: { ...skunk.statblock, cr: undefined } }, 'pathfinder2e');
    expect(isRefusal(r)).toBe(true);
    // A guessed tier would silently decide every number after it.
    if (isRefusal(r)) expect(r.reason).toMatch(/without guessing/i);
  });

  it('falls back to the stat block’s own cr when the row has none', () => {
    const r = deriveNativeStatblock({ ...skunk, cr: null, statblock: { ...skunk.statblock, cr: '1/4' } }, 'pathfinder2e');
    expect(isRefusal(r)).toBe(false);
  });
});

describe('deriveNativeStatblock — the numbers are the target’s, not the source’s', () => {
  const r = deriveNativeStatblock(skunk, 'pathfinder2e');
  if (isRefusal(r)) throw new Error(r.reason);

  it('takes AC and HP from the target’s measured row for the mapped tier', () => {
    const row = PF2_TIERS.find((t) => t.tier === -1);
    expect(row, 'PF2 must have a level -1 row for this test to mean anything').toBeTruthy();
    expect(r.statblock.ac).toBe(row!.ac);
    expect(r.statblock.hp).toBe(row!.hp);
    // The whole point: NOT the source's.
    expect(r.statblock.ac).not.toBe(skunk.statblock.ac);
  });

  it('states the tier on the target’s scale', () => {
    expect(r.tier).toBe('-1');
    expect(r.statblock.cr).toBe('-1');
  });

  it('drops hit dice, which described a different HP total', () => {
    expect(r.statblock.hitDice).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/hit dice dropped/i);
  });

  it('says in words that the numbers were rebuilt', () => {
    expect(r.notes.join(' ')).toMatch(/measured median/i);
    expect(r.notes.join(' ')).toMatch(/not the source's numbers/i);
  });

  it('carries the sample size, so a thin tier is a visibly weaker claim', () => {
    expect(r.sample).toBeGreaterThan(0);
    expect(r.sample).toBe(PF2_TIERS.find((t) => t.tier === -1)!.sample);
  });
});

describe('deriveNativeStatblock — each system’s shape (N2-2)', () => {
  it('gives Pathfinder ability MODIFIERS, never scores', () => {
    const r = deriveNativeStatblock(skunk, 'pathfinder2e');
    if (isRefusal(r)) throw new Error(r.reason);
    expect(r.statblock.abilityMods).toBeDefined();
    expect(r.statblock.abilities).toBeUndefined();
    // dex 15 → +2, by 5e's own rule. Writing 15 into a PF2 block would be a +15 creature.
    expect(r.statblock.abilityMods!.dex).toBe(2);
    expect(r.statblock.abilityMods!.str).toBe(-3);
  });

  it('gives D&D scores, and labels the reconstruction when it only had modifiers', () => {
    const pf2Source: DeriveInput = {
      name: 'Skunk', system: 'pathfinder2e', cr: '-1',
      statblock: { ac: 15, hp: 6, abilityMods: { str: -3, dex: 2 } },
    };
    const r = deriveNativeStatblock(pf2Source, 'dnd5e-2024');
    if (isRefusal(r)) throw new Error(r.reason);
    expect(r.statblock.abilities).toBeDefined();
    expect(r.statblock.abilityMods).toBeUndefined();
    expect(r.statblock.abilities!.dex).toBe(14); // +2 → 14, the even score
    // LOSSY, and said so: +2 could have been 14 or 15.
    expect(r.notes.join(' ')).toMatch(/reconstructed/i);
  });

  it('gives D&D a proficiency bonus and Pathfinder none', () => {
    const d = deriveNativeStatblock({ ...skunk, system: 'pathfinder2e', cr: '5' }, 'dnd5e-2024');
    const p = deriveNativeStatblock(skunk, 'pathfinder2e');
    if (isRefusal(d) || isRefusal(p)) throw new Error('both should derive');
    expect(d.statblock.proficiencyBonus).toBe(3);
    expect(p.statblock.proficiencyBonus).toBeUndefined();
  });

  it('follows 5e’s published proficiency progression', () => {
    // In the SRD, so stated rather than measured: +2 through CR 4, then +1 every four.
    expect(proficiencyFor(0)).toBe(2);
    expect(proficiencyFor(4)).toBe(2);
    expect(proficiencyFor(5)).toBe(3);
    expect(proficiencyFor(9)).toBe(4);
    expect(proficiencyFor(17)).toBe(6);
  });

  it('drops saves when crossing systems, because the two do not have the same ones', () => {
    const r = deriveNativeStatblock(skunk, 'pathfinder2e');
    if (isRefusal(r)) throw new Error(r.reason);
    // A Pathfinder block listing "DEX +4" names a save Pathfinder has not got.
    expect(r.statblock.saves).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/saving throws dropped/i);
  });

  it('keeps saves when the systems are the same family', () => {
    const r = deriveNativeStatblock({ ...skunk, system: 'dnd5e-2014' }, 'dnd5e-2024');
    if (isRefusal(r)) throw new Error(r.reason);
    expect(r.statblock.saves).toBe('DEX +4');
  });
});

describe('deriveNativeStatblock — the prose is the source’s', () => {
  const r = deriveNativeStatblock(skunk, 'pathfinder2e');
  if (isRefusal(r)) throw new Error(r.reason);

  it('keeps what the creature IS', () => {
    expect(r.statblock.speed).toBe('20 ft.');
    expect(r.statblock.senses).toBe('darkvision 30 ft.');
    expect(r.statblock.entries?.map((e) => e.name)).toEqual(['Keen Smell', 'Bite']);
    expect(r.statblock.entries?.[0].body).toBe(skunk.statblock.entries![0].body);
  });

  it('re-pitches an attack’s to-hit and leaves its damage alone', () => {
    const bite = r.statblock.entries!.find((e) => e.name === 'Bite')!;
    const row = PF2_TIERS.find((t) => t.tier === -1)!;
    expect(bite.toHit).toBe(`+${row.attack}`);
    // Damage untouched: the corpus supports a median to-hit, not a median damage expression.
    expect(bite.damage).toBe('1 piercing');
  });

  it('does NOT give a to-hit to something that never had one', () => {
    // "Keen Smell +5" is nonsense a reader notices immediately.
    const keen = r.statblock.entries!.find((e) => e.name === 'Keen Smell')!;
    expect(keen.toHit).toBeUndefined();
  });
});

describe('deriveNativeStatblock — the property that makes it worth having', () => {
  it('produces genuinely different numbers per system for the same creature', () => {
    // The owner's actual complaint: "the skunk has the same stat block for all four systems".
    const pf2 = deriveNativeStatblock(skunk, 'pathfinder2e');
    const d24 = deriveNativeStatblock(skunk, 'dnd5e-2024');
    if (isRefusal(pf2) || isRefusal(d24)) throw new Error('both should derive');
    expect(pf2.statblock.ac).not.toBe(d24.statblock.ac);
    expect(pf2.statblock.cr).not.toBe(d24.statblock.cr);
  });

  it('is pure — the same input derives the same block every time', () => {
    const a = deriveNativeStatblock(skunk, 'pathfinder2e');
    const b = deriveNativeStatblock(skunk, 'pathfinder2e');
    expect(a).toEqual(b);
  });

  it('does not mutate the source', () => {
    const before = JSON.parse(JSON.stringify(skunk));
    deriveNativeStatblock(skunk, 'pathfinder2e');
    expect(skunk).toEqual(before);
  });

  it('lands inside its own table’s band for every tier of both systems', () => {
    // N4-1's check, applied to the derivation itself: a derived block that falls outside the table it was
    // built from would mean the build path and the table disagree.
    for (const [sys, table] of [['dnd5e-2024', DND5E_TIERS], ['pathfinder2e', PF2_TIERS]] as const) {
      for (const row of table) {
        const src: DeriveInput = {
          name: 'Probe', system: sys, cr: String(row.tier),
          statblock: { ac: 1, hp: 1 } as Statblock,
        };
        const r = deriveNativeStatblock(src, sys);
        if (isRefusal(r)) throw new Error(`${sys} ${row.tier}: ${r.reason}`);
        expect(r.statblock.ac, `${sys} tier ${row.tier} AC`).toBe(row.ac);
        expect(r.statblock.hp, `${sys} tier ${row.tier} HP`).toBe(row.hp);
      }
    }
  });
});
