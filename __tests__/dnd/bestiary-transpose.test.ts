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

  it('reads the type line a publisher actually prints, not a bare word', () => {
    // Both sources decorate the type: the SRD writes "Medium swarm of Tiny beasts" and "humanoid
    // (goblinoid)". Matching those raw strings against the map missed, and the creature was reported as
    // having no counterpart in a system that names it perfectly well — 8 of Intuitive Games' 200 arrived
    // typed `swarm of Tiny beasts` with a spurious warning attached.
    const swarm = { ...ogre5e, type: 'swarm of Tiny beasts' };
    const r = transposeCreature(swarm, 'intuitive-games');
    expect(r.type).toBe('swarm');
    expect(r.unmapped.join(' ')).not.toMatch(/no counterpart/);

    expect(transposeCreature({ ...ogre5e, type: 'humanoid (goblinoid)' }, 'pathfinder2e').type).toBe('humanoid');
  });

  it('names the systems in play and no others', () => {
    // The AC, saves and CR warnings were written when Pathfinder was the only possible target, so they said
    // so outright. With Intuitive Games as a fourth system every one of its 200 transposed creatures told
    // its reader that "Pathfinder 2e climbs with level to the 50s" — a true sentence about a game they are
    // not playing, attached to the numbers they most need to trust.
    const r = transposeCreature(ogre5e, 'intuitive-games');
    const text = r.unmapped.join(' ');
    expect(text).not.toMatch(/Pathfinder/);
    expect(text).toMatch(/Intuitive Games/);

    // …and the concrete PF2 detail is still there when Pathfinder actually is one of the two.
    expect(transposeCreature(ogre5e, 'pathfinder2e').unmapped.join(' ')).toMatch(/Pathfinder 2e climbs with level/);
  });

  it('does not cry wolf between the two 5e editions', () => {
    // 2024 is a REVISION of 2014, not a different game: AC still spans 10-25, hit points follow the same
    // curve, and a CR 5 creature is a CR 5 creature. Flagging AC, HP and CR there put three items on the
    // "needs a human" list of every one of the 300 transposed 2024 creatures that did not belong on it —
    // and a warning list that is wrong two thirds of the time is one a DM stops reading. The 5e-to-PF2
    // warnings are load-bearing precisely because they are rare enough to be believed.
    const r = transposeCreature(ogre5e, 'dnd5e-2024');
    const text = r.unmapped.join(' ');
    expect(text).not.toMatch(/AC \d+ was carried over/);
    expect(text).not.toMatch(/HP \d+ was carried over/);
    expect(text).not.toMatch(/is kept as-is/);
    // The prose note stays, because it is the one thing that genuinely differs across the revision.
    expect(text).toMatch(/renamed some conditions/);
  });

  it('knows 2024 uses the same type words as 2014', () => {
    // TYPE_MAP had no `dnd5e-2024` column at all, so every one of the 300 creatures transposed into 2024
    // was told its type "has no counterpart in the target system" — about `monstrosity`, a classification
    // 2024 prints on its own pages. The type still displayed correctly, because the caller falls back to
    // the source value, which is exactly why only reading the rendered page caught it.
    const r = transposeCreature({ ...ogre5e, type: 'monstrosity' }, 'dnd5e-2024');
    expect(r.type).toBe('monstrosity');
    expect(r.unmapped.join(' ')).not.toMatch(/no counterpart/);
  });

  it('does not turn that into an identity fallback', () => {
    // The 2024 column reads 2014's, which is a statement about those two editions — not permission to map
    // any word to itself. A Pathfinder-only type has no 2014 entry and must stay unmapped.
    const r = transposeCreature({ ...goblinPf2, type: 'petitioner' }, 'dnd5e-2024');
    expect(r.type).toBeUndefined();
    expect(r.unmapped.join(' ')).toMatch(/no counterpart/);
  });

  it('keeps the flags for Intuitive Games, which shares 5e\'s abilities but not its scales', () => {
    // The predicate is "same numeric scale", not "same publisher" or "same family" — IG uses ability
    // SCORES like 5e and does not use 5e's AC or HP curves, so silencing it there would be the invention
    // G5 forbids wearing the costume of a simplification.
    const text = transposeCreature(ogre5e, 'intuitive-games').unmapped.join(' ');
    expect(text).toMatch(/AC \d+ was carried over/);
    expect(text).toMatch(/HP \d+ was carried over/);
  });

  it('still marks a word it does not recognise rather than coercing it', () => {
    // The normalisation must not become a way of always finding SOMETHING. An invented type has to keep
    // falling through to the warning, or G5's "never invents rules" is enforced nowhere.
    const r = transposeCreature({ ...ogre5e, type: 'chronovore' }, 'pathfinder2e');
    expect(r.type).toBeUndefined();
    expect(r.unmapped.join(' ')).toMatch(/no counterpart/);
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
