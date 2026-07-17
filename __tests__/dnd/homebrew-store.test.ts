import { describe, it, expect } from 'vitest';
import { upsertHomebrewClass, removeHomebrewClass, homebrewClassesForSystem, readHomebrewClasses } from '@/lib/dnd/classes/homebrew-store';
import { findClass } from '@/lib/dnd/classes/registry';
import { buildCustomClass } from '@/lib/dnd/classes/custom';
import type { ClassDefinition } from '@/lib/dnd/classes/types';

const cls = (key: string, system = 'dnd5e-2024', over: Partial<ClassDefinition> = {}): ClassDefinition => ({
  key, name: key, system, hitDie: 8, primaryAbility: ['str'], savingThrows: ['str'],
  skillChoices: { count: 2, from: [] }, armorProficiencies: [], weaponProficiencies: [],
  subclassLevel: 3, subclassLabel: 'Subclass', features: [], ...over,
} as ClassDefinition);

describe('homebrew class store', () => {
  it('upsert adds a new class and replaces one with the same key', () => {
    let list = upsertHomebrewClass(undefined, cls('custom-warden'));
    expect(list).toHaveLength(1);
    list = upsertHomebrewClass(list, cls('custom-mage'));
    expect(list).toHaveLength(2);
    // re-save an edited warden → replaces, not duplicates
    list = upsertHomebrewClass(list, cls('custom-warden', 'dnd5e-2024', { hitDie: 12 }));
    expect(list).toHaveLength(2);
    expect(list.find((c) => c.key === 'custom-warden')!.hitDie).toBe(12);
  });

  it('remove drops a class by key', () => {
    const list = [cls('a'), cls('b')];
    expect(removeHomebrewClass(list, 'a').map((c) => c.key)).toEqual(['b']);
    expect(removeHomebrewClass(undefined, 'x')).toEqual([]);
  });

  it('homebrewClassesForSystem filters by system (Ground Rule 1)', () => {
    const list = [cls('a', 'dnd5e-2024'), cls('b', 'pathfinder2e'), cls('c', 'dnd5e-2024')];
    expect(homebrewClassesForSystem(list, 'dnd5e-2024').map((c) => c.key)).toEqual(['a', 'c']);
    expect(homebrewClassesForSystem(list, 'pathfinder2e').map((c) => c.key)).toEqual(['b']);
  });

  it('readHomebrewClasses defensively reads the character data blob', () => {
    expect(readHomebrewClasses({ homebrewClasses: [cls('a')] })).toHaveLength(1);
    expect(readHomebrewClasses({})).toEqual([]);
    expect(readHomebrewClasses(null)).toEqual([]);
    expect(readHomebrewClasses({ homebrewClasses: [{ nope: 1 }, cls('good')] })).toHaveLength(1); // junk filtered
  });
});

describe('a saved homebrew class resolves in the level builder (the levels-route path)', () => {
  it('findClass resolves it via readHomebrewClasses(data) as `extra` — like an official one', () => {
    const def = buildCustomClass({
      name: 'Spellblade', system: 'dnd5e-2024', description: '', hitDie: 10,
      primaryAbility: ['int'], savingThrows: ['con', 'int'], skillChoices: { count: 2, from: [] },
      armorProficiencies: [], weaponProficiencies: [], subclassLevel: 3, subclassLabel: 'Order',
      features: [{ level: 1, name: 'Blade Bond', body: 'Bond a weapon.' }],
    });
    const data = { meta: { className: 'Spellblade' }, homebrewClasses: [def] };
    // Not in the official roster…
    expect(findClass('dnd5e-2024', 'Spellblade')).toBeNull();
    // …but resolves once the character's saved homebrew is passed as extra (what the route does).
    const resolved = findClass('dnd5e-2024', 'Spellblade', readHomebrewClasses(data));
    expect(resolved?.name).toBe('Spellblade');
    expect(resolved?.hitDie).toBe(10);
    // Ground Rule 1: it must NOT resolve under a different system.
    expect(findClass('pathfinder2e', 'Spellblade', readHomebrewClasses(data))).toBeNull();
  });
});
