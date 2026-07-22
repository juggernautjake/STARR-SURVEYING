// __tests__/dnd/ig-builder-grants.test.ts — the IG builder folds in every CONCRETE contributor grant,
// not just HP (owner audit, 2026-07-21).
//
// The HP fix closed one instance of a class of bug: a contributor (class / subclass / background /
// ancestry) states a value the builder must wire into the model, and leaving it unset makes the character
// read as though that contributor gave nothing. This file pins the OTHER concrete grants the same audit
// found — a background's stance and skill proficiencies, a subclass's granted stance and defensive power,
// a class's starting power, and the Intelligence-scaled skill-rank budget — so they cannot silently regress
// to "defaults to nothing" again. The player CHOICES the same contributors carry (ability boosts, which
// class power a subclass grants, which ancestry trait you take) are asserted ABSENT: wiring those would be
// the mirror-image bug.
import { describe, it, expect } from 'vitest';
import { assembleIGVanillaCharacter, buildIGModel } from '@/lib/dnd/systems/intuitive-games/builder';
import { igAbilityMod } from '@/lib/dnd/systems/intuitive-games/rules';

// Jacob's live test subject: Vashti Kelln, a level-6 Fighter (Freebooter subclass, Human, Soldier).
const VASHTI = {
  name: 'Vashti Kelln', className: 'Fighter', subclass: 'Freebooter', ancestry: 'Human', background: 'Soldier',
  level: 6, abilities: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
} as const;

describe('IG builder wires concrete contributor grants (owner audit)', () => {
  it("teaches the background's AND the subclass's granted stance as KNOWN stances", () => {
    const { ig } = assembleIGVanillaCharacter(VASHTI as never);
    // Soldier grants Menacing (IG_BACKGROUND_DEFS); Freebooter grants Mobile (IG_CLASS_DETAILS).
    expect(ig.stances).toContain('Menacing');
    expect(ig.stances).toContain('Mobile');
    // …but neither is auto-ACTIVATED — the active-stance slot (combat.stances) stays empty, because a
    // stance costs an action to adopt. Being taught a stance is not being in it.
    expect(ig.combat.stances).toEqual([]);
  });

  it("defaults the defensive power to the subclass's when the player picked none", () => {
    const { ig } = assembleIGVanillaCharacter(VASHTI as never);
    expect(ig.combat.defensivePower).toBe('Redirect'); // Freebooter's granted defensive power
  });

  it('never overrides an explicit defensive-power pick with the subclass default', () => {
    const { ig } = assembleIGVanillaCharacter({ ...VASHTI, defensivePower: 'Sidestep' } as never);
    expect(ig.combat.defensivePower).toBe('Sidestep');
  });

  it('folds the class starting power into the known powers (Wizard → Elemental Blast)', () => {
    const { ig } = assembleIGVanillaCharacter({ className: 'Wizard', background: 'Academic', level: 3 } as never);
    expect(ig.powers).toContain('Elemental Blast');
  });

  it('names the starting power cleanly, stripping the descriptive tail (Conduit → Redistribution)', () => {
    // startingPower reads "Redistribution — rearrange matter…"; only the name should reach the list.
    const ig = buildIGModel({ className: 'Conduit', level: 2 });
    expect(ig.powers).toContain('Redistribution');
    expect(ig.powers.some((p) => p.includes('—'))).toBe(false);
  });

  it('sets skill proficiency from a background that grants SKILL proficiencies (Academic)', () => {
    const ig = buildIGModel({ className: 'Wizard', background: 'Academic', level: 1 });
    // Academic → Arcane, Lore, Linguistics, Religion — all real skills, all now trained.
    for (const name of ['Arcane', 'Lore', 'Linguistics', 'Religion']) {
      expect(ig.skills.find((s) => s.name === name)?.proficient, `${name} should be trained`).toBe(true);
    }
    // A skill the background does NOT grant stays untrained.
    expect(ig.skills.find((s) => s.name === 'Stealth')?.proficient).toBe(false);
  });

  it("leaves a background's ITEM proficiencies unwired (Soldier → Armor/Shields have no skill/flag)", () => {
    const ig = buildIGModel({ className: 'Fighter', subclass: 'Freebooter', background: 'Soldier', level: 6 });
    // Soldier's proficiencies (Armor, Shields) are not skills and the model has no armor-proficiency
    // field, so NO skill is flagged from them — the honest outcome, recorded as a gap rather than forced
    // onto a wrong skill. (This is why Vashti gains no skill proficiency from her background.)
    expect(ig.skills.every((s) => !s.proficient)).toBe(true);
  });

  it('scales the skill-rank budget by Intelligence and level, not a flat 2', () => {
    const ig = buildIGModel({ className: 'Wizard', level: 4, abilities: { INT: 16 } });
    // (2 + INT mod +3) × level 4 = 20 — a blank character would have read 2.
    expect(ig.skillRanksAvailable).toBe((2 + igAbilityMod(16)) * 4);
    // Vashti: (2 + 0) × 6 = 12.
    expect(buildIGModel(VASHTI as never).skillRanksAvailable).toBe(12);
  });

  it('does NOT wire the player CHOICES — no auto ability boosts, no invented trait', () => {
    const { ig } = assembleIGVanillaCharacter(VASHTI as never);
    // The Soldier background grants "Constitution or Strength, plus any one" boosts and Human has two
    // ancestry-trait options — both are the player's decision, so the builder leaves scores as entered
    // and adds no feat/power the player did not pick beyond the concrete class starting power.
    expect(ig.abilities).toMatchObject({ STR: 16, CON: 14, DEX: 12, INT: 10, WIS: 10, CHA: 10 });
    expect(ig.feats.general).toEqual([]);
    expect(ig.feats.combat).toEqual([]);
  });

  it('an off-catalog class/background contributes no grant rather than a fabricated one', () => {
    const ig = buildIGModel({ className: 'Interdimensional Bard', background: 'Time Tourist', level: 2 });
    expect(ig.stances).toEqual([]);
    expect(ig.combat.defensivePower).toBe('');
    expect(ig.powers).toEqual([]);
    expect(ig.skills.every((s) => !s.proficient)).toBe(true);
  });
});
