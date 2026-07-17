import { describe, it, expect } from 'vitest';
import { parseCustomClassDraft, CUSTOM_CLASS_TOOL } from '@/lib/dnd/classes/custom-ai';
import { buildCustomClass, reviewCustomClass } from '@/lib/dnd/classes/custom';

// Slice 5 — the AI-assist path proposes a draft; the EXISTING engine adjudicates it.
describe('parseCustomClassDraft (defensive normalizer)', () => {
  it('coerces a messy LLM object into a valid draft', () => {
    const d = parseCustomClassDraft({
      name: '  Warden ', hitDie: 12, primaryAbility: ['con', 'bogus'], savingThrows: ['con', 'wis'],
      skillChoices: { count: 99, from: ['Athletics', ''] }, subclassLevel: 3, subclassLabel: 'Sworn Path',
      features: [{ level: 5, name: 'Bulwark', body: 'Resist.' }, { level: 1, name: 'Guard', body: 'Protect.' }],
    }, 'dnd5e-2024');
    expect(d.name).toBe('Warden');
    expect(d.hitDie).toBe(12);              // exact legal die kept
    expect(d.primaryAbility).toEqual(['con']); // bogus dropped
    expect(d.skillChoices.count).toBe(10);  // clamped
    expect(d.skillChoices.from).toEqual(['Athletics']); // blank dropped
    expect(d.features.map((f) => f.name)).toEqual(['Guard', 'Bulwark']); // sorted by level
    expect(d.system).toBe('dnd5e-2024');
  });

  it('fills required fields from garbage so the engine never throws', () => {
    const d = parseCustomClassDraft(null, 'dnd5e-2024');
    expect(d.name).toBe('Homebrew Class');
    expect(d.hitDie).toBe(8);
    expect(d.primaryAbility.length).toBeGreaterThan(0);
    expect(d.savingThrows.length).toBeGreaterThan(0);
    expect(d.subclassLevel).toBe(3);
  });

  it('parses a spellcaster block', () => {
    const d = parseCustomClassDraft({ name: 'Mage', primaryAbility: ['int'], caster: { kind: 'full', ability: 'int' } }, 'dnd5e-2024');
    expect(d.caster).toMatchObject({ kind: 'full', ability: 'int' });
  });
});

describe('the AI draft flows through the existing engine', () => {
  it('builds a real ClassDefinition and reviewCustomClass runs on it', () => {
    const draft = parseCustomClassDraft({
      name: 'Spellblade', hitDie: 10, primaryAbility: ['int'], savingThrows: ['con', 'int'],
      skillChoices: { count: 2, from: ['Arcana', 'Athletics', 'Acrobatics'] },
      armorProficiencies: ['Light armor'], weaponProficiencies: ['Simple weapons', 'Martial weapons'],
      subclassLevel: 3, subclassLabel: 'Blade Order',
      features: [
        { level: 1, name: 'Arcane Strike', body: 'Add force damage on a hit.' },
        { level: 2, name: 'Spellbinding', body: 'Bind a spell to your blade.' },
      ],
    }, 'dnd5e-2024');

    const def = buildCustomClass(draft);
    expect(def.name).toBe('Spellblade');
    expect(def.hitDie).toBe(10);
    // The engine auto-adds the subclass-choice + ASI features, so a homebrew class can't be born broken.
    expect(def.features.some((f) => f.choice === 'subclass')).toBe(true);
    expect(def.features.some((f) => f.choice === 'asi')).toBe(true);

    const review = reviewCustomClass(def);
    expect(Array.isArray(review)).toBe(true); // errors block, warnings advise — either way it runs
  });
});

describe('CUSTOM_CLASS_TOOL schema', () => {
  it('requires the load-bearing fields and enumerates hit dice + abilities', () => {
    expect(CUSTOM_CLASS_TOOL.input_schema.required).toEqual(expect.arrayContaining(['name', 'hitDie', 'subclassLevel', 'features']));
    expect((CUSTOM_CLASS_TOOL.input_schema.properties.hitDie as { enum: number[] }).enum).toEqual([6, 8, 10, 12]);
  });
});
