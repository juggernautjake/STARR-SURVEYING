// __tests__/dnd/spell-mechanics.test.ts — the "how spellcasting works" explainers.
// These back the AI's ability to explain a RULE (what breaks concentration, how upcasting
// differs from cantrip scaling) rather than just restate a spell's text.
import { describe, it, expect } from 'vitest';
import { SPELL_MECHANICS, MECHANIC_TOPICS, spellMechanic, spellMechanicsByTopic } from '@/lib/dnd/spells/mechanics';
import { CONDITION_MECHANICS_5E, conditionMechanics5e } from '@/lib/dnd/conditions/dnd5e';

describe('spell mechanics explainers', () => {
  it('has a unique key for every entry', () => {
    const keys = SPELL_MECHANICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('pairs every rule with a concrete worked example', () => {
    // The example is the whole point — a rule without one is the thing people already
    // struggle to apply.
    for (const m of SPELL_MECHANICS) {
      expect(m.rule.length, m.key).toBeGreaterThan(20);
      expect(m.example.length, `${m.key} needs a worked example`).toBeGreaterThan(40);
    }
  });

  it('uses concrete numbers in its examples', () => {
    // "You take some damage and might lose it" helps nobody; "22 damage, so DC 11" does.
    const numeric = SPELL_MECHANICS.filter((m) => /\d/.test(m.example));
    expect(numeric.length).toBe(SPELL_MECHANICS.length);
  });

  it('uses only declared topics, and every topic has at least one entry', () => {
    for (const m of SPELL_MECHANICS) expect(MECHANIC_TOPICS).toContain(m.topic);
    for (const t of MECHANIC_TOPICS) {
      expect(spellMechanicsByTopic(t).length, `topic ${t} has no entries`).toBeGreaterThan(0);
    }
  });

  it('attributes every entry', () => {
    for (const m of SPELL_MECHANICS) expect(m.source, m.key).toBe('PHB 2024');
  });

  it('covers the mechanics players actually get wrong', () => {
    for (const k of ['concentration-save', 'upcasting', 'cantrip-scaling', 'spell-save-dc', 'save-for-half', 'costly-materials', 'ritual-casting']) {
      expect(spellMechanic(k), k).toBeDefined();
    }
  });

  it('gets the concentration save DC rule right', () => {
    const c = spellMechanic('concentration-save');
    expect(c?.rule).toContain('Constitution');
    // DC 10 or half the damage, whichever is HIGHER — the half that trips people up.
    expect(c?.rule.toLowerCase()).toContain('higher');
    expect(c?.example).toContain('22');
  });

  it('separates cantrip scaling from slot-based upcasting', () => {
    // Conflating these is the single most common spellcasting misunderstanding.
    expect(spellMechanic('cantrip-scaling')?.rule).toMatch(/character/i);
    expect(spellMechanic('upcasting')?.rule).toMatch(/slot/i);
  });

  it('returns undefined for an unknown key rather than guessing', () => {
    expect(spellMechanic('how-do-i-win')).toBeUndefined();
  });
});

describe('conditions carry worked examples too', () => {
  it('every modelled condition has an example', () => {
    for (const c of CONDITION_MECHANICS_5E) {
      expect(c.example, `${c.name} has no worked example`).toBeDefined();
      expect(c.example!.length, c.name).toBeGreaterThan(40);
    }
  });

  it('examples are concrete scenarios, not restatements of the note', () => {
    for (const c of CONDITION_MECHANICS_5E) {
      expect(c.example, c.name).not.toBe(c.note);
    }
  });

  it('spot-checks the ones with the most confusing interactions', () => {
    // Frightened only applies while you can SEE the source — the detail people miss.
    expect(conditionMechanics5e('Frightened')?.example).toMatch(/line of sight|see/i);
    // Grappled is speed 0, and Dash does not help.
    expect(conditionMechanics5e('Grappled')?.example).toMatch(/speed 0/i);
    // Unconscious auto-crits within 5 feet, which costs two death save failures.
    expect(conditionMechanics5e('Unconscious')?.example).toMatch(/critical/i);
  });
});
