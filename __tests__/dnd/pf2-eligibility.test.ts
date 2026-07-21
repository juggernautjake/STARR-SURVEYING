// __tests__/dnd/pf2-eligibility.test.ts — the PF2 eligibility core (PF2 buildout S2).
//
// The Area MV audit found PF2 had "nothing to gate": no feat carried a level and no edit op could
// add content. Feat levels arrived with PF2FeatFull (S1); this turns them into a decision.
//
// PF2's schedule is strict and unlike 5e's — four feat tracks on four different level schedules,
// with a feat's own level as a hard floor on all of them. A level comparison alone is not enough,
// which is the whole reason this core exists.
import { describe, it, expect } from 'vitest';
import {
  pf2FeatEligibility, pf2SpellEligibility, pf2MaxSpellRank, pf2FeatLevelsFor, pf2FeatBudget,
  annotatePF2Feats, type PF2EligibilityContext,
} from '@/lib/dnd/systems/pathfinder2e/eligibility';
import type { PF2FeatFull, PF2SpellFull } from '@/lib/dnd/systems/pathfinder2e/defs';

const feat = (o: Partial<PF2FeatFull> & { name: string; level: number; track: PF2FeatFull['track'] }): PF2FeatFull =>
  ({ traits: [], effect: 'x', source: 'Player Core', ...o });

const spell = (o: Partial<PF2SpellFull> & { name: string; rank: number }): PF2SpellFull =>
  ({ traditions: ['arcane'], traits: [], cast: '2', effect: 'x', source: 'Player Core', ...o });

const wizard = (level: number, over: Partial<PF2EligibilityContext> = {}): PF2EligibilityContext =>
  ({ className: 'Wizard', level, tradition: 'arcane', ...over });

describe('the feat-slot schedule', () => {
  it('ancestry feats come at 1/5/9/13/17', () => {
    expect(pf2FeatLevelsFor('ancestry', 20)).toEqual([1, 5, 9, 13, 17]);
  });

  it('skill feats at even levels, general at 3/7/11/15/19', () => {
    expect(pf2FeatLevelsFor('skill', 10)).toEqual([2, 4, 6, 8, 10]);
    expect(pf2FeatLevelsFor('general', 20)).toEqual([3, 7, 11, 15, 19]);
  });

  it('truncates at the character’s level', () => {
    expect(pf2FeatLevelsFor('ancestry', 4)).toEqual([1]);
    expect(pf2FeatLevelsFor('general', 2)).toEqual([]);
  });

  it('a class can override the class-feat schedule', () => {
    // Most classes take class feats at even levels; a few differ at level 1, so the class table
    // wins over the default rather than the default being assumed universal.
    expect(pf2FeatLevelsFor('class', 4, [1, 2, 4])).toEqual([1, 2, 4]);
  });

  it('the budget counts each track separately', () => {
    const b = pf2FeatBudget(5);
    expect(b.ancestry).toBe(2); // 1, 5
    expect(b.skill).toBe(2);    // 2, 4
    expect(b.general).toBe(1);  // 3
    expect(b.class).toBe(2);    // 2, 4
  });
});

describe('a feat’s own level is a hard floor', () => {
  it('refuses a feat above the character’s level', () => {
    const v = pf2FeatEligibility(feat({ name: 'Big Feat', level: 8, track: 'general' }), wizard(4));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('level-8');
  });

  it('allows it at exactly its level', () => {
    expect(pf2FeatEligibility(feat({ name: 'F', level: 4, track: 'general' }), wizard(4)).ok).toBe(true);
  });
});

describe('class and ancestry scoping', () => {
  it('a class feat belongs to its class and nobody else’s', () => {
    const f = feat({ name: 'Power Attack', level: 1, track: 'class', className: 'Fighter' });
    expect(pf2FeatEligibility(f, wizard(5)).ok).toBe(false);
    expect(pf2FeatEligibility(f, { className: 'Fighter', level: 5 }).ok).toBe(true);
  });

  it('refuses a class feat when no class is set rather than allowing it', () => {
    // Fails CLOSED, unlike the IG core — a PF2 class list is complete, so a missing class means
    // bad input, not absent data.
    const f = feat({ name: 'Power Attack', level: 1, track: 'class', className: 'Fighter' });
    expect(pf2FeatEligibility(f, { className: '', level: 5 }).ok).toBe(false);
  });

  it('an ancestry feat belongs to its ancestry', () => {
    const f = feat({ name: 'Unburdened Iron', level: 1, track: 'ancestry', ancestry: 'Dwarf' });
    expect(pf2FeatEligibility(f, { className: 'Fighter', level: 5, ancestry: 'Elf' }).ok).toBe(false);
    expect(pf2FeatEligibility(f, { className: 'Fighter', level: 5, ancestry: 'Dwarf' }).ok).toBe(true);
  });
});

describe('prerequisites', () => {
  it('enforces a skill rank', () => {
    const f = feat({ name: 'Assurance', level: 1, track: 'skill', prereqs: [{ kind: 'skill', skill: 'Athletics', rank: 'trained' }] });
    expect(pf2FeatEligibility(f, wizard(5, { skills: { Athletics: 'untrained' } })).ok).toBe(false);
    expect(pf2FeatEligibility(f, wizard(5, { skills: { Athletics: 'expert' } })).ok).toBe(true);
  });

  it('enforces a required feat', () => {
    const f = feat({ name: 'Follow-Up', level: 2, track: 'class', prereqs: [{ kind: 'feat', name: 'Base Feat' }] });
    expect(pf2FeatEligibility(f, wizard(5)).ok).toBe(false);
    expect(pf2FeatEligibility(f, wizard(5, { featNames: ['Base Feat'] })).ok).toBe(true);
  });

  it('does not refuse when there is nothing to judge against', () => {
    // A sheet mid-build has no scores or skills set yet. Refusing there would block a legal pick,
    // which is the worse failure — a player can work around permissiveness, not a false refusal.
    const f = feat({ name: 'Strong', level: 1, track: 'general', prereqs: [{ kind: 'attribute', attribute: 'STR', value: 18 }] });
    expect(pf2FeatEligibility(f, wizard(5)).ok).toBe(true);
    expect(pf2FeatEligibility(f, wizard(5, { attributes: { STR: 10 } })).ok).toBe(false);
  });

  it('never enforces unstructured prose', () => {
    // prereqText is displayed, never checked — refusing on unparsed English would block legal
    // choices, exactly the trap the IG feat gate was left out to avoid.
    const f = feat({ name: 'Odd', level: 1, track: 'general', prereqText: 'something a parser cannot know' });
    expect(pf2FeatEligibility(f, wizard(5)).ok).toBe(true);
  });
});

describe('retakes and archetypes', () => {
  it('blocks retaking a non-repeatable feat', () => {
    const f = feat({ name: 'Toughness', level: 1, track: 'general' });
    expect(pf2FeatEligibility(f, wizard(5, { featNames: ['Toughness'] })).ok).toBe(false);
  });

  it('allows retaking a repeatable one', () => {
    const f = feat({ name: 'Ancestral Paragon', level: 3, track: 'general', repeatable: true });
    expect(pf2FeatEligibility(f, wizard(5, { featNames: ['Ancestral Paragon'] })).ok).toBe(true);
  });

  it('an archetype feat requires its Dedication first', () => {
    // The rule that makes an archetype a commitment rather than a free pick.
    const f = feat({ name: 'Basic Wizard Spellcasting', level: 4, track: 'archetype', archetype: 'Wizard' });
    expect(pf2FeatEligibility(f, wizard(6)).ok).toBe(false);
    expect(pf2FeatEligibility(f, wizard(6, { featNames: ['Wizard Dedication'] })).ok).toBe(true);
  });

  it('the Dedication itself does not require itself', () => {
    const d = feat({ name: 'Wizard Dedication', level: 2, track: 'archetype', archetype: 'Wizard' });
    expect(pf2FeatEligibility(d, wizard(6)).ok).toBe(true);
  });
});

describe('spell rank ceilings come from the class, not the level', () => {
  it('a non-caster has no slots at all', () => {
    // pf2SpellSlots takes only a level and returns the full-caster table, so calling it blind
    // would hand a Fighter rank-5 slots. The class definition decides first.
    expect(pf2MaxSpellRank('Fighter', 20)).toBe(0);
  });

  it('a full caster’s ceiling rises with level', () => {
    expect(pf2MaxSpellRank('Wizard', 1)).toBe(1);
    expect(pf2MaxSpellRank('Wizard', 5)).toBe(3);
    expect(pf2MaxSpellRank('Wizard', 20)).toBe(10);
  });

  it('refuses a spell above the ceiling, naming both numbers', () => {
    const v = pf2SpellEligibility(spell({ name: 'Wall of Stone', rank: 5 }), wizard(4));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('rank 5');
  });

  it('allows one at or below it', () => {
    expect(pf2SpellEligibility(spell({ name: 'Fireball', rank: 3 }), wizard(5)).ok).toBe(true);
  });

  it('refuses every ranked spell to a non-caster', () => {
    expect(pf2SpellEligibility(spell({ name: 'Fireball', rank: 3 }), { className: 'Fighter', level: 10 }).ok).toBe(false);
  });
});

describe('traditions are PF2’s class list', () => {
  it('refuses a spell off the character’s tradition', () => {
    const v = pf2SpellEligibility(spell({ name: 'Heal', rank: 1, traditions: ['divine', 'primal'] }), wizard(5));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('arcane');
  });

  it('allows one on it', () => {
    expect(pf2SpellEligibility(spell({ name: 'Fireball', rank: 3, traditions: ['arcane', 'primal'] }), wizard(5)).ok).toBe(true);
  });
});

describe('cantrips and focus spells are not slot-gated', () => {
  it('a cantrip is always allowed on-tradition', () => {
    expect(pf2SpellEligibility(spell({ name: 'Electric Arc', rank: 0 }), wizard(1)).ok).toBe(true);
  });

  it('a cantrip off-tradition is still refused', () => {
    expect(pf2SpellEligibility(spell({ name: 'Guidance', rank: 0, traditions: ['divine'] }), wizard(1)).ok).toBe(false);
  });

  it('a focus spell is judged on ownership, never on the slot ceiling', () => {
    // A level-1 character's focus spell is legal even though a rank-1 slot would be their limit.
    const f = spell({ name: 'Lay on Hands', rank: 1, focus: true, focusClass: 'Champion', traditions: ['divine'] });
    expect(pf2SpellEligibility(f, { className: 'Champion', level: 1 }).ok).toBe(true);
    expect(pf2SpellEligibility(f, wizard(20)).ok).toBe(false);
  });
});

describe('annotation keeps ineligible entries visible', () => {
  it('returns every feat with its verdict rather than filtering', () => {
    // So a builder can grey a row WITH its reason instead of hiding it and looking arbitrary.
    const pool = [feat({ name: 'A', level: 1, track: 'general' }), feat({ name: 'B', level: 20, track: 'general' })];
    const out = annotatePF2Feats(pool, wizard(3));
    expect(out).toHaveLength(2);
    expect(out[0].eligibility.ok).toBe(true);
    expect(out[1].eligibility.ok).toBe(false);
    expect(out[1].eligibility.reason).toBeTruthy();
  });
});
