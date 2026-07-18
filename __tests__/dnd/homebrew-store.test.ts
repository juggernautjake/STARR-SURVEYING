import { describe, it, expect } from 'vitest';
import { upsertHomebrewClass, removeHomebrewClass, homebrewClassesForSystem, readHomebrewClasses, upsertHomebrewFeat, readHomebrewFeats, upsertHomebrewSubclass, readHomebrewSubclasses } from '@/lib/dnd/classes/homebrew-store';
import { findClass, subclassesFor } from '@/lib/dnd/classes/registry';
import { buildCustomClass, buildCustomFeat, buildCustomSubclass } from '@/lib/dnd/classes/custom';
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

describe('homebrew feat store', () => {
  const feat = (key: string) => buildCustomFeat({ name: key, system: 'dnd5e-2024', category: 'general', body: 'x', custom: {}, key });
  it('upsert by key + defensive read', () => {
    let list = upsertHomebrewFeat(undefined, feat('custom-a'));
    list = upsertHomebrewFeat(list, feat('custom-b'));
    expect(list).toHaveLength(2);
    list = upsertHomebrewFeat(list, feat('custom-a')); // replace, not dup
    expect(list).toHaveLength(2);
    expect(readHomebrewFeats({ homebrewFeats: list })).toHaveLength(2);
    expect(readHomebrewFeats({})).toEqual([]);
    expect(readHomebrewFeats({ homebrewFeats: [{ nope: 1 }, feat('good')] })).toHaveLength(1);
  });
});

describe('homebrew subclass store + registry resolution', () => {
  const sub = (name: string, classKey = 'barbarian') => buildCustomSubclass({
    name, classKey, system: 'dnd5e-2024', description: '', features: [{ level: 3, name: 'F', body: 'b' }],
  });
  it('upsert by key + defensive read', () => {
    let list = upsertHomebrewSubclass(undefined, sub('Storm Herald'));
    list = upsertHomebrewSubclass(list, sub('Zealot'));
    expect(list).toHaveLength(2);
    list = upsertHomebrewSubclass(list, sub('Storm Herald')); // replace
    expect(list).toHaveLength(2);
    expect(readHomebrewSubclasses({ homebrewSubclasses: list })).toHaveLength(2);
    expect(readHomebrewSubclasses({})).toEqual([]);
  });
  it('a saved subclass resolves via subclassesFor(..., extra) for its parent class', () => {
    const s = sub('Storm Herald', 'barbarian');
    const data = { homebrewSubclasses: [s] };
    const extra = readHomebrewSubclasses(data).filter((x) => x.classKey === 'barbarian');
    const subs = subclassesFor('dnd5e-2024', 'barbarian', extra);
    expect(subs.some((x) => x.name === 'Storm Herald')).toBe(true);
    // Not offered under a different parent class.
    expect(subclassesFor('dnd5e-2024', 'wizard', readHomebrewSubclasses(data).filter((x) => x.classKey === 'wizard')).some((x) => x.name === 'Storm Herald')).toBe(false);
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
