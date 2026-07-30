// __tests__/dnd/bestiary-transpose.test.ts — carrying a creature between systems (B4-1).
//
// G5: *"Transposition never invents rules. Converting a 5e creature to PF2 maps what maps and MARKS what
// does not. A silently plausible PF2 stat block is worse than a flagged approximate one."*
//
// So most of these tests assert what the module REFUSES to do. It would be easy — and wrong — to turn a
// CR 5 ogre into a "level 5 PF2 ogre" by copying the numbers: 5e AC spans roughly 10–25 across the whole
// game while PF2 AC climbs with level into the 50s, so a copied 18 makes a level-15 creature hit-on-a-2.
// There is no published conversion for that, and deriving one would be inventing rules that read as
// authoritative on a stat block someone uses mid-combat.
import { describe, it, expect } from 'vitest';
import {
  modToScore, scoreToMod, sharesAbilityConvention, transposeCreature, type TransposeInput,
} from '@/lib/dnd/bestiary/transpose';

const ogre5e: TransposeInput = {
  name: 'Ogre', system: 'dnd5e-2014', type: 'giant', size: 'Large', cr: '2',
  statblock: {
    ac: 11, hp: 59, hitDice: '7d10 + 21', speed: '40 ft.',
    abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 },
    saves: 'STR +6', senses: 'darkvision 60 ft., passive Perception 8', languages: 'Common, Giant',
    entries: [{ kind: 'action', name: 'Greatclub', body: 'Melee Weapon Attack.', toHit: '+6', damage: '2d8 + 4 bludgeoning' }],
  },
};

const goblinPf2: TransposeInput = {
  name: 'Goblin Warrior', system: 'pathfinder2e', type: 'humanoid', size: 'Small', cr: '-1',
  statblock: {
    ac: 16, hp: 6, speed: '25 feet',
    abilityMods: { str: 0, dex: 3, con: 1, int: 0, wis: -1, cha: 1 },
    saves: 'Fort +5, Ref +7, Will +3', senses: 'Perception +2; darkvision',
    entries: [{ kind: 'action', name: 'Dogslicer', body: 'Traits: agile, finesse', toHit: '+7', damage: '1d6 slashing' }],
  },
};

describe('scoreToMod / modToScore', () => {
  it("uses 5e's own published rule", () => {
    expect(scoreToMod(10)).toBe(0);
    expect(scoreToMod(19)).toBe(4);
    expect(scoreToMod(8)).toBe(-1);
    expect(scoreToMod(1)).toBe(-5);
  });

  it('the inverse is lossy, and picks the even score', () => {
    // +3 could have come from 16 or 17. That ambiguity is why every use of it is flagged.
    expect(modToScore(3)).toBe(16);
    expect(scoreToMod(modToScore(3))).toBe(3);
    expect(scoreToMod(17)).toBe(3);
  });
});

describe('5e → PF2', () => {
  const r = transposeCreature(ogre5e, 'pathfinder2e');

  it('converts ability SCORES to MODIFIERS exactly', () => {
    expect(r.statblock.abilityMods).toEqual({ str: 4, dex: -1, con: 3, int: -3, wis: -2, cha: -2 });
    expect(r.statblock.abilities).toBeUndefined();
  });

  it('MARKS the AC rather than converting it', () => {
    expect(r.statblock.ac).toBe(11);                       // carried, not transformed
    expect(r.unmapped.join(' ')).toMatch(/AC 11 was carried over unchanged/);
    expect(r.unmapped.join(' ')).toMatch(/different scales/);
  });

  it('marks HP, saves and the tier', () => {
    const all = r.unmapped.join(' ');
    expect(all).toMatch(/HP 59 was carried over/);
    expect(all).toMatch(/Saves are 5e's per-ability bonuses/);
    expect(all).toMatch(/CR 2 is kept as-is/);
  });

  it('carries prose through untouched', () => {
    expect(r.statblock.speed).toBe('40 ft.');
    expect(r.statblock.entries?.[0].damage).toBe('2d8 + 4 bludgeoning');
  });

  it('warns that action text may reference mechanics the target lacks', () => {
    expect(r.unmapped.join(' ')).toMatch(/quoted verbatim/);
  });

  it('maps the type across the shared vocabulary', () => {
    expect(r.type).toBe('giant');
    expect(r.size).toBe('Large');                          // both systems use the same size words
  });
});

describe('PF2 → 5e', () => {
  const r = transposeCreature(goblinPf2, 'dnd5e-2014');

  it('RECONSTRUCTS scores from modifiers, and says so', () => {
    expect(r.statblock.abilities).toEqual({ str: 10, dex: 16, con: 12, int: 10, wis: 8, cha: 12 });
    expect(r.unmapped.join(' ')).toMatch(/reconstructed from modifiers/);
  });

  it('never produces a score below 1, even from a very negative modifier', () => {
    const awful = { ...goblinPf2, statblock: { ...goblinPf2.statblock, abilityMods: { int: -6 } } };
    expect(transposeCreature(awful, 'dnd5e-2014').statblock.abilities?.int).toBeGreaterThanOrEqual(1);
  });

  it("maps PF2's `animal` onto 5e's `beast`", () => {
    const wolf = { ...goblinPf2, type: 'animal' };
    expect(transposeCreature(wolf, 'dnd5e-2014').type).toBe('beast');
  });

  it('explains the three-saves-versus-six problem instead of splitting them', () => {
    expect(r.unmapped.join(' ')).toMatch(/Fort→CON, Ref→DEX, Will→WIS/);
  });

  it('says a level is not a challenge rating', () => {
    expect(r.unmapped.join(' ')).toMatch(/not the same quantity|not interchangeable/);
  });
});

describe('G5 — nothing is invented', () => {
  it('EVERY numeric field that crosses a scale boundary is flagged', () => {
    for (const [input, target] of [[ogre5e, 'pathfinder2e'], [goblinPf2, 'dnd5e-2014']] as const) {
      const r = transposeCreature(input, target);
      const text = r.unmapped.join(' ');
      for (const field of ['AC', 'HP', 'Saves']) {
        expect(text, `${input.system}→${target} did not flag ${field}`).toContain(field);
      }
    }
  });

  it('a real conversion produces a non-empty unmapped list', () => {
    // An empty list would mean either a trivial conversion or a lie. Asserting it directly keeps a future
    // refactor from "simplifying" the warnings away.
    expect(transposeCreature(ogre5e, 'pathfinder2e').unmapped.length).toBeGreaterThan(3);
  });

  it('the note states the direction and the count, so a reader knows what they hold', () => {
    const r = transposeCreature(ogre5e, 'pathfinder2e');
    expect(r.note).toContain('dnd5e-2014');
    expect(r.note).toContain('pathfinder2e');
    expect(r.note).toMatch(/need a human/);
  });

  it('marks a creature type the target system does not have', () => {
    const ooze = { ...goblinPf2, type: 'petitioner' };     // PF2-only; no 5e counterpart
    expect(transposeCreature(ooze, 'dnd5e-2014').unmapped.join(' ')).toMatch(/no counterpart/);
  });
});

describe('edge cases', () => {
  it('a same-system transpose is a no-op with nothing to warn about', () => {
    const r = transposeCreature(ogre5e, 'dnd5e-2014');
    expect(r.unmapped).toEqual([]);
    expect(r.statblock.ac).toBe(11);
  });

  it('handles an empty statblock without throwing', () => {
    const bare = { name: 'Thing', system: 'dnd5e-2014', statblock: {} };
    expect(() => transposeCreature(bare, 'pathfinder2e')).not.toThrow();
    expect(transposeCreature(bare, 'pathfinder2e').unmapped).toEqual([]);
  });

  it('knows which system pairs share the ability convention', () => {
    expect(sharesAbilityConvention('dnd5e-2014', 'dnd5e-2024')).toBe(true);
    expect(sharesAbilityConvention('dnd5e-2014', 'pathfinder2e')).toBe(false);
  });
});
