// __tests__/dnd/pf2-resolve.test.ts — S13b: everything catalogued reaches the MATHS.
//
// Every assertion here is a RESOLVED NUMBER, not a rendered field. The doc is explicit about why:
// "A weapon rolls with the right multiple-attack penalty, a rune contributes, a numeric condition
// moves every affected number, and the roller names its sources." A test that checks a field exists
// would have passed against the code these tests were written to fix — the sheet DID display an AC,
// it was just an AC that no condition could move.
import { describe, it, expect } from 'vitest';
import { blankPF2Character, type PF2Character, type PF2Attack } from '@/lib/dnd/systems/pathfinder2e/model';
import {
  pf2ResolveAc, pf2ResolveSave, pf2ResolveSkill, pf2ResolvePerception,
  pf2ResolveSpellDc, pf2ResolveSpellAttack, pf2ResolveStrikeInPlay, pf2ResolveAll,
  pf2FeatModifiers, pf2ConditionModifiers,
} from '@/lib/dnd/systems/pathfinder2e/resolve';

/** A level-5 fighter-ish character: DEX +3, STR +4, trained armor, Dex-capped breastplate. */
function hero(): PF2Character {
  const c = blankPF2Character('Test');
  c.identity.level = 5;
  c.attributes = { STR: 4, DEX: 3, CON: 2, INT: 0, WIS: 1, CHA: 0 };
  c.combat.armorRank = 'trained';
  c.combat.dexCap = 2;
  c.combat.acItemBonus = 0;
  c.combat.armorName = 'Breastplate';
  c.saves.Fortitude = { rank: 'expert', itemBonus: 0 };
  c.saves.Reflex = { rank: 'trained', itemBonus: 0 };
  c.saves.Will = { rank: 'trained', itemBonus: 0 };
  c.perception = { rank: 'expert' };
  return c;
}

describe('proficiency = rank bonus + level, on every statistic (S13b)', () => {
  it('a level-5 expert save resolves to attribute + 4 + 5', () => {
    const c = hero();
    // CON +2, expert (+4) + level 5 = 9 → 11.
    expect(pf2ResolveSave('Fortitude', c).total).toBe(11);
  });

  it('untrained adds NEITHER the rank bonus NOR the level', () => {
    const c = hero();
    c.saves.Will = { rank: 'untrained', itemBonus: 0 };
    // WIS +1 only. If level leaked in for untrained this would be 6.
    expect(pf2ResolveSave('Will', c).total).toBe(1);
  });
});

describe('armour and runes reach AC (S13b)', () => {
  it('AC = 10 + capped Dex + proficiency + item bonus', () => {
    const c = hero();
    c.combat.acItemBonus = 4;
    // 10 + min(3, dexCap 2) + (trained 2 + level 5) + 4 = 23.
    expect(pf2ResolveAc(c).total).toBe(23);
  });

  it('an armor potency rune DERIVES the item bonus — the rune contributes', () => {
    const c = hero();
    c.combat.armorRunes = ['+2 armor potency'];
    // 10 + 2 + 7 + 2 = 21. Before this slice `armorRunes` did not exist and the rune could only be
    // hand-copied into acItemBonus, where it drifted the moment the rune changed.
    expect(pf2ResolveAc(c).total).toBe(21);
  });

  it('runes WIN over the hand-entered bonus rather than adding to it', () => {
    const c = hero();
    c.combat.acItemBonus = 1;
    c.combat.armorRunes = ['+2 armor potency'];
    // A suit has ONE potency rune. Summing would give 24; the right answer is 21.
    expect(pf2ResolveAc(c).total).toBe(21);
  });

  it('a resilient rune reaches every save — the saveBonus that nothing used to read', () => {
    const c = hero();
    c.combat.armorRunes = ['greater resilient'];
    // Fortitude 11 + 2 = 13.
    expect(pf2ResolveSave('Fortitude', c).total).toBe(13);
    expect(pf2ResolveSave('Reflex', c).total).toBe(3 + 2 + 5 + 2);
  });
});

describe("PF2's bonus stacking — highest of each TYPE, never the sum (S13b)", () => {
  it('two item bonuses do not stack: the better one wins', () => {
    const c = hero();
    c.saves.Fortitude = { rank: 'expert', itemBonus: 1 };
    c.combat.armorRunes = ['greater resilient']; // +2 item to saves
    // 11 base. A naive sum gives 14; PF2 gives 13, because both are ITEM bonuses.
    const r = pf2ResolveSave('Fortitude', c);
    expect(r.total).toBe(13);
    // And the loser is NAMED rather than silently dropped.
    expect(r.suppressed.map((m) => m.source)).toContain('item bonus');
  });

  it('two STATUS penalties do not stack: Frightened 2 + Sickened 1 is −2, not −3', () => {
    const c = hero();
    c.combat.conditions = [{ name: 'Frightened', value: 2 }, { name: 'Sickened', value: 1 }];
    expect(pf2ResolveSave('Will', c).total).toBe(1 + 2 + 5 - 2);
  });

  it('a STATUS penalty and a CIRCUMSTANCE penalty DO stack — different types add', () => {
    const c = hero();
    // Frightened 2 is status; Off-Guard is circumstance. Both bite AC.
    c.combat.conditions = [{ name: 'Frightened', value: 2 }, { name: 'Off-Guard' }];
    // Base AC 10 + 2 + 7 = 19, minus 2 status minus 2 circumstance = 15.
    expect(pf2ResolveAc(c).total).toBe(15);
  });

  it('the armor check penalty is UNTYPED, so an item bonus never suppresses it', () => {
    const c = hero();
    c.combat.armorCheckPenalty = -2;
    c.skills = [{ name: 'Athletics', attribute: 'STR', rank: 'trained', itemBonus: 1, armorPenalty: true }];
    // STR 4 + (2+5) + item 1 − 2 = 10. If the penalty were typed 'item' it would lose to the +1
    // and the number would read 12.
    expect(pf2ResolveSkill(c.skills[0], c).total).toBe(10);
  });
});

describe('numeric conditions move EVERY affected number (S13b)', () => {
  it('Off-Guard lowers AC — the headline number no condition could previously touch', () => {
    const c = hero();
    const before = pf2ResolveAc(c).total;
    c.combat.conditions = [{ name: 'Off-Guard' }];
    expect(pf2ResolveAc(c).total).toBe(before - 2);
  });

  it('Clumsy hits Reflex (Dex) and leaves Fortitude (Con) alone', () => {
    const c = hero();
    c.combat.conditions = [{ name: 'Clumsy', value: 2 }];
    expect(pf2ResolveSave('Reflex', c).total).toBe(3 + 2 + 5 - 2);
    expect(pf2ResolveSave('Fortitude', c).total).toBe(11); // untouched
  });

  it('Drained hits Fortitude (Con) and leaves Reflex alone', () => {
    const c = hero();
    c.combat.conditions = [{ name: 'Drained', value: 1 }];
    expect(pf2ResolveSave('Fortitude', c).total).toBe(10);
    expect(pf2ResolveSave('Reflex', c).total).toBe(3 + 2 + 5);
  });

  it('Clumsy penalises a DEX skill and NOT a STR skill', () => {
    const c = hero();
    c.combat.conditions = [{ name: 'Clumsy', value: 2 }];
    const acro = { name: 'Acrobatics', attribute: 'DEX' as const, rank: 'trained' as const, itemBonus: 0 };
    const athl = { name: 'Athletics', attribute: 'STR' as const, rank: 'trained' as const, itemBonus: 0 };
    // The shared conditions module flattens every attribute-scoped condition to one 'skill' bucket,
    // so Clumsy used to penalise Athletics — a Strength skill it has nothing to do with.
    expect(pf2ResolveSkill(acro, c).total).toBe(3 + 7 - 2);
    expect(pf2ResolveSkill(athl, c).total).toBe(4 + 7);
  });

  it('Stupefied reaches the spell DC and the spell attack, as its own text says', () => {
    const c = hero();
    c.spellcasting = { tradition: 'arcane', kind: 'prepared', attribute: 'INT', rank: 'expert', slots: [], spells: [] };
    c.attributes.INT = 4;
    const clean = pf2ResolveSpellDc(c)!.total;   // 10 + 4 + (4+5) = 23
    expect(clean).toBe(23);
    c.combat.conditions = [{ name: 'Stupefied', value: 2 }];
    expect(pf2ResolveSpellDc(c)!.total).toBe(21);
    expect(pf2ResolveSpellAttack(c)!.total).toBe(4 + 9 - 2);
  });

  it('Frightened hits Perception too — "all your checks"', () => {
    const c = hero();
    const clean = pf2ResolvePerception(c).total; // WIS 1 + (4+5) = 10
    expect(clean).toBe(10);
    c.combat.conditions = [{ name: 'Frightened', value: 3 }];
    expect(pf2ResolvePerception(c).total).toBe(7);
  });

  it('a non-caster resolves no spell statistics at all', () => {
    expect(pf2ResolveSpellDc(hero())).toBeNull();
    expect(pf2ResolveSpellAttack(hero())).toBeNull();
  });
});

describe('the multiple attack penalty finally reaches a Strike (S13b)', () => {
  const longsword = (): PF2Attack => ({
    id: 'w1', name: 'Longsword', attribute: 'STR', rank: 'expert',
    weaponBonus: 0, damage: '1d8', damageType: 'slashing', traits: ['versatile P'],
  });
  const shortsword = (): PF2Attack => ({
    id: 'w2', name: 'Shortsword', attribute: 'STR', rank: 'expert',
    weaponBonus: 0, damage: '1d6', damageType: 'piercing', traits: ['agile', 'finesse'],
  });

  it('the first Strike takes no penalty', () => {
    const c = hero();
    // STR 4 + expert (4+5) = 13.
    expect(pf2ResolveStrikeInPlay(longsword(), c, 0).total).toBe(13);
  });

  it('the second Strike is −5, and the third −10', () => {
    const c = hero();
    expect(pf2ResolveStrikeInPlay(longsword(), c, 1).total).toBe(8);
    expect(pf2ResolveStrikeInPlay(longsword(), c, 2).total).toBe(3);
  });

  it('an AGILE weapon takes −4 / −8 instead', () => {
    const c = hero();
    // Finesse switches to DEX only when it helps; STR 4 > DEX 3, so STR stands and the base is 13.
    expect(pf2ResolveStrikeInPlay(shortsword(), c, 1).total).toBe(9);
    expect(pf2ResolveStrikeInPlay(shortsword(), c, 2).total).toBe(5);
  });

  it('the penalty stops growing after the third Strike', () => {
    const c = hero();
    expect(pf2ResolveStrikeInPlay(longsword(), c, 3).total).toBe(pf2ResolveStrikeInPlay(longsword(), c, 2).total);
  });

  it('a potency rune contributes to the attack AND a striking rune to the damage dice', () => {
    const c = hero();
    const w = { ...longsword(), runes: ['+1 weapon potency', 'greater striking'] };
    const r = pf2ResolveStrikeInPlay(w, c, 0);
    expect(r.total).toBe(14);              // 13 + 1 item
    expect(r.strike.damage).toBe('3d8+4 slashing'); // greater striking = 3 weapon dice, +STR
  });

  it('Enfeebled bites a Strength Strike and not a Dexterity one', () => {
    const c = hero();
    c.combat.conditions = [{ name: 'Enfeebled', value: 2 }];
    expect(pf2ResolveStrikeInPlay(longsword(), c, 0).total).toBe(11);
    const bow: PF2Attack = {
      id: 'w3', name: 'Shortbow', attribute: 'DEX', rank: 'expert',
      weaponBonus: 0, damage: '1d6', damageType: 'piercing', traits: ['ranged'],
    };
    // DEX 3 + 9 = 12, untouched by Enfeebled.
    expect(pf2ResolveStrikeInPlay(bow, c, 0).total).toBe(12);
  });
});

describe('feats: typed bonuses are parsed, and deliberately NOT summed (S13b)', () => {
  it('a typed bonus is extracted with its value, type and scope', () => {
    const mods = pf2FeatModifiers({
      name: 'Toxin Resister',
      body: 'You gain a +1 status bonus to saves against poisons.',
    });
    expect(mods).toHaveLength(1);
    expect(mods[0]).toMatchObject({ value: 1, type: 'status', source: 'Toxin Resister' });
    expect(mods[0].when).toContain('poisons');
  });

  it('a conditional feat bonus does NOT move the save total', () => {
    const c = hero();
    c.feats = [{ id: 'f1', name: 'Toxin Resister', level: 1, track: 'general', traits: [], body: 'You gain a +1 status bonus to saves against poisons.' }];
    const r = pf2ResolveSave('Fortitude', c);
    // THE POINT OF THE SLICE: "+1 vs poison" folded into the card would apply against everything.
    expect(r.total).toBe(11);
    // But it is carried and surfaced, so the player can apply it when it actually bites.
    expect(r.conditional).toHaveLength(1);
    expect(r.conditional[0].when).toContain('poisons');
  });

  it('a feat granting no typed bonus yields nothing and stays prose', () => {
    expect(pf2FeatModifiers({ name: 'Sudden Charge', body: 'Stride twice, then make a Strike.' })).toEqual([]);
  });
});

describe('the roller shows its work, and the card cannot disagree with it (S13b)', () => {
  it('the breakdown names every contributing source', () => {
    const c = hero();
    c.combat.armorRunes = ['+1 armor potency'];
    c.combat.conditions = [{ name: 'Frightened', value: 1 }];
    const r = pf2ResolveAc(c);
    expect(r.breakdown).toContain('DEX');
    expect(r.breakdown).toContain('trained');
    expect(r.breakdown).toContain('Frightened 1');
    // 10 + 2 + 7 + 1 − 1 = 19.
    expect(r.total).toBe(19);
  });

  it('pf2ResolveAll returns the SAME totals the individual resolvers do', () => {
    // The sheet renders from pf2ResolveAll and rolls from the same object. If these ever diverged,
    // the card-vs-roll bug would be back in a new place.
    const c = hero();
    c.combat.conditions = [{ name: 'Frightened', value: 2 }];
    const all = pf2ResolveAll(c);
    expect(all.ac.total).toBe(pf2ResolveAc(c).total);
    expect(all.saves.Will.total).toBe(pf2ResolveSave('Will', c).total);
    expect(all.perception.total).toBe(pf2ResolvePerception(c).total);
  });

  it('condition modifiers come back TYPED, so they stack against runes correctly', () => {
    const mods = pf2ConditionModifiers([{ name: 'Frightened', value: 2 }], 'will', 'WIS');
    expect(mods).toEqual([{ type: 'status', value: -2, source: 'Frightened 2' }]);
  });
});
