// __tests__/dnd/pf2-progression-ranks.test.ts — proficiency ranks must ADVANCE with level.
//
// THE BUG THIS LOCKS DOWN. The builder assembled every proficiency rank from content.ts's `initial`
// field, which is the LEVEL-1 snapshot only. The full level 1–20 rank schedule already lived in
// data/classes.ts (and `pf2RankAtLevel` already walked it) but was never wired into the builder — the
// exact "the data exists but was never connected to the stat" class of bug found in the IG background
// HP. So a level-9 Wizard saved and cast as though freshly made: its Reflex (expert at 5), Fortitude
// (expert at 9) and spell proficiency (expert at 7) each read TWO points low on the card and the roll.
//
// These assertions carry the resolved NUMBERS, not just the ranks, so a regression that quietly reverts
// the wiring fails here with a concrete wrong total rather than a vague shrug.
import { describe, it, expect } from 'vitest';
import { assemblePF2VanillaCharacter } from '@/lib/dnd/systems/pathfinder2e/builder';
import { pf2Derived } from '@/lib/dnd/systems/pathfinder2e/rules';

describe('PF2 proficiency ranks advance with character level', () => {
  it('a level-9 Wizard has its level-appropriate saves and spell proficiency, not level-1 ranks', () => {
    // Elf Wizard, INT 5 / DEX 2 / CON 1 / WIS 1 — Jacob's Orin Sallowmere shape.
    const c = assemblePF2VanillaCharacter({
      name: 'Orin', className: 'Wizard', ancestry: 'Elf', background: 'Scholar', level: 9,
      keyAttribute: 'INT', attributes: { STR: 0, DEX: 2, CON: 1, INT: 5, WIS: 1, CHA: 0 },
    });
    const p = c.pf2e;
    // Fortitude: Magical Fortitude at 9 → expert. CON 1 + (4 + 9) = 14, not trained's 12.
    expect(p.saves.Fortitude.rank).toBe('expert');
    // Reflex: Reflex Expertise at 5 → expert. DEX 2 + (4 + 9) = 15, not trained's 13.
    expect(p.saves.Reflex.rank).toBe('expert');
    // Will: initial expert, Prodigious Will not until 17 → still expert at 9.
    expect(p.saves.Will.rank).toBe('expert');
    // Spell DC/attack proficiency: Expert Spellcaster at 7 → expert.
    expect(p.spellcasting.rank).toBe('expert');
    // Ranks that legitimately have NOT advanced by 9 stay put (no over-advancement):
    expect(p.perception.rank).toBe('trained');        // Perception Expertise not until 11
    expect(p.combat.armorRank).toBe('trained');       // Defensive Robes not until 13
    expect(p.combat.attackRank).toBe('trained');      // Wizard Weapon Expertise not until 11

    const d = pf2Derived(p);
    expect(d.saves.Fortitude).toBe(14);
    expect(d.saves.Reflex).toBe(15);
    expect(d.saves.Will).toBe(14);
    expect(d.spellDc).toBe(28);      // 10 + INT 5 + expert(4+9)
    expect(d.spellAttack).toBe(18);  //      INT 5 + expert(4+9)
  });

  it('a martial class advances its ATTACK rank at the class-defined level', () => {
    // Barbarian: Brutality grants expert attacks at level 5 (an unscoped, whole-track step).
    const lvl5 = assemblePF2VanillaCharacter({ name: 'B', className: 'Barbarian', level: 5 });
    expect(lvl5.pf2e.combat.attackRank).toBe('expert');
    // At level 4 it is still the level-1 trained.
    const lvl4 = assemblePF2VanillaCharacter({ name: 'B', className: 'Barbarian', level: 4 });
    expect(lvl4.pf2e.combat.attackRank).toBe('trained');
  });

  it('a defensive step advances the armor rank (Champion Armor Expertise at 7)', () => {
    const c = assemblePF2VanillaCharacter({ name: 'C', className: 'Champion', level: 7 });
    expect(c.pf2e.combat.armorRank).toBe('expert');
  });

  it('a full caster spell DC climbs to master at 15 and legendary at 19', () => {
    const master = assemblePF2VanillaCharacter({ name: 'D', className: 'Druid', level: 15 });
    expect(master.pf2e.spellcasting.rank).toBe('master');
    const legend = assemblePF2VanillaCharacter({ name: 'D', className: 'Druid', level: 19 });
    expect(legend.pf2e.spellcasting.rank).toBe('legendary');
  });

  it('at level 1 every rank equals the content.ts initial (no regression)', () => {
    const c = assemblePF2VanillaCharacter({ name: 'W', className: 'Wizard', level: 1 });
    const p = c.pf2e;
    expect(p.saves.Fortitude.rank).toBe('trained');
    expect(p.saves.Reflex.rank).toBe('trained');
    expect(p.saves.Will.rank).toBe('expert');
    expect(p.spellcasting.rank).toBe('trained');
    expect(p.combat.attackRank).toBe('trained');
  });

  it('the Fighter attack rank stays expert past 13 — conservative, by design', () => {
    // The Fighter's level-5/13/19 attack steps are per-step NOTED (they advance a subset of weapons
    // or a chosen weapon group), so the builder deliberately does NOT advance the whole attack track
    // through them. That UNDER-counts a high-level Fighter's general attacks rather than over-counts
    // — the safe direction. Recorded in PF2_CLASS_PROGRESSION_GAPS. This test pins the choice so it is
    // not "fixed" into a silent over-count.
    const c = assemblePF2VanillaCharacter({ name: 'F', className: 'Fighter', level: 13 });
    expect(c.pf2e.combat.attackRank).toBe('expert');
  });

  it('an unmodelled (custom) class falls back to level-1 defaults without throwing', () => {
    const c = assemblePF2VanillaCharacter({ name: 'X', className: 'Homebrew Warlock', level: 9 });
    expect(c.pf2e.saves.Fortitude.rank).toBe('trained');
    expect(c.pf2e.combat.attackRank).toBe('trained');
  });
});
