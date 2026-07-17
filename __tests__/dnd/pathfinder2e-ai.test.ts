import { describe, it, expect } from 'vitest';
import { parsePF2Picks, PF2_PICKS_TOOL, pf2BuilderSystemPrompt } from '@/lib/dnd/systems/pathfinder2e/ai';
import { buildPF2Character } from '@/lib/dnd/systems/pathfinder2e/builder';

describe('parsePF2Picks (defensive normalizer)', () => {
  it('coerces a messy LLM object into safe picks', () => {
    const picks = parsePF2Picks({
      name: '  Seelah ', level: 99, className: 'Champion', ancestry: 'Human',
      keyAttribute: 'str', attributes: { STR: 4, DEX: '1', CON: 2, junk: 5 },
      freeBoosts: ['con', 'wis', 'bogus'], trainedSkills: ['Religion', '', 'Diplomacy'],
    });
    expect(picks.name).toBe('Seelah');
    expect(picks.level).toBe(20);                 // clamped
    expect(picks.keyAttribute).toBe('STR');        // upper-cased + validated
    expect(picks.attributes).toMatchObject({ STR: 4, DEX: 1, CON: 2 });
    expect(picks.attributes).not.toHaveProperty('junk');
    expect(picks.freeBoosts).toEqual(['CON', 'WIS']); // bogus dropped
    expect(picks.trainedSkills).toEqual(['Religion', 'Diplomacy']);
  });
  it('accepts `class` as an alias for className and survives garbage', () => {
    expect(parsePF2Picks({ name: 'X', class: 'Wizard' }).className).toBe('Wizard');
    expect(parsePF2Picks(null).level).toBe(1);
    expect(parsePF2Picks('nope').name).toBeUndefined();
  });
  it('produces picks that build a valid character', () => {
    const picks = parsePF2Picks({ name: 'Val', className: 'Cleric', ancestry: 'Dwarf', background: 'Acolyte', attributes: { WIS: 4, CON: 2 } });
    const char = buildPF2Character(picks);
    expect(char.spellcasting.tradition).toBe('divine');
    expect(char.identity.name).toBe('Val');
  });
});

describe('PF2_PICKS_TOOL schema', () => {
  it('requires a name and enumerates attributes for keyAttribute', () => {
    expect(PF2_PICKS_TOOL.input_schema.required).toContain('name');
    expect((PF2_PICKS_TOOL.input_schema.properties.keyAttribute as any).enum).toContain('STR');
  });
});

describe('pf2BuilderSystemPrompt grounding', () => {
  const prompt = pf2BuilderSystemPrompt();
  it('pins to PF2 and forbids cross-system leakage', () => {
    expect(prompt).toContain('PATHFINDER 2e');
    expect(prompt).toMatch(/never mix in D&D 5e/i);
  });
  it('lists the vanilla catalog classes for the model', () => {
    expect(prompt).toContain('Fighter');
    expect(prompt).toContain('Wizard');
  });
});
