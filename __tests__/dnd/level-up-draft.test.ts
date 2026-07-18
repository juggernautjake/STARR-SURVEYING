// __tests__/dnd/level-up-draft.test.ts — AI/custom + vanilla single-level level-up for an existing character.
import { describe, it, expect } from 'vitest';
import {
  parseLevelUpDraft, abilityIncreaseTotal, isLegalAsi, standardLevelUpOptions,
} from '@/lib/dnd/classes/level-up-draft';
import { findClass, subclassesFor } from '@/lib/dnd/classes/registry';

describe('parseLevelUpDraft (custom / AI path)', () => {
  it('pins the target to currentLevel+1 and normalizes features', () => {
    const d = parseLevelUpDraft({
      features: [{ name: 'Chrome Reflexes', body: 'Add your PB to initiative.' }, { name: '', body: 'dropped' }],
      hpGained: 9, abilityIncreases: { dex: 1, con: 1 }, mode: 'custom',
    }, { currentLevel: 4 });
    expect(d.fromLevel).toBe(4);
    expect(d.toLevel).toBe(5);
    expect(d.features).toEqual([{ name: 'Chrome Reflexes', body: 'Add your PB to initiative.' }]); // nameless dropped
    expect(d.hpGained).toBe(9);
    expect(d.abilityIncreases).toEqual({ dex: 1, con: 1 });
    expect(d.mode).toBe('custom');
  });

  it('never throws on garbage and clamps out-of-range values', () => {
    const d = parseLevelUpDraft({ features: 'nope', hpGained: 99999, abilityIncreases: { str: 7, xyz: 3 } }, { currentLevel: 19 });
    expect(d.toLevel).toBe(20); // capped at 20
    expect(d.features).toEqual([]);
    expect(d.hpGained).toBe(1000); // clamped
    expect(d.abilityIncreases).toEqual({ str: 2 }); // +7 clamped to +2, bogus key dropped
    expect(d.mode).toBe('custom'); // default when unspecified
  });

  it('honors an explicit vanilla mode', () => {
    expect(parseLevelUpDraft({ mode: 'vanilla' }, { currentLevel: 2 }).mode).toBe('vanilla');
  });
});

describe('ASI legality', () => {
  it('totals ability increases', () => {
    expect(abilityIncreaseTotal({ str: 1, con: 1 })).toBe(2);
    expect(abilityIncreaseTotal({})).toBe(0);
  });
  it('accepts a +2 or +1/+1, rejects an over-spend', () => {
    expect(isLegalAsi({ str: 2 })).toBe(true);
    expect(isLegalAsi({ str: 1, dex: 1 })).toBe(true);
    expect(isLegalAsi({ str: 2, dex: 1 })).toBe(false); // 3 points
    expect(isLegalAsi({})).toBe(false);
  });
});

describe('standardLevelUpOptions (vanilla path, reusing planLevelUp)', () => {
  it('lists the class features gained on the new level for a real 2024 class', () => {
    const fighter = findClass('dnd5e-2024', 'Fighter')!;
    // Level 4→5: Fighter gains Extra Attack. Provide the subclass already chosen so it isn't "outstanding".
    const opts = standardLevelUpOptions(fighter, {
      from: 4, to: 5,
      recorded: [{ level: 3, kind: 'subclass', value: 'champion' }],
      subclasses: subclassesFor('dnd5e-2024', fighter.key),
    });
    expect(opts.gained.some((f) => /extra attack/i.test(f.name))).toBe(true);
    expect(opts.empty).toBe(false);
  });

  it('surfaces the ASI choice a level owes', () => {
    const fighter = findClass('dnd5e-2024', 'Fighter')!;
    const opts = standardLevelUpOptions(fighter, {
      from: 3, to: 4,
      recorded: [{ level: 3, kind: 'subclass', value: 'champion' }],
      subclasses: subclassesFor('dnd5e-2024', fighter.key),
    });
    expect(opts.outstanding.some((c) => c.kind === 'asi')).toBe(true);
  });

  it('reports empty when the class grants nothing new (custom path is natural)', () => {
    // A minimal homebrew-shaped class with only a level-1 feature: level 5→6 grants nothing.
    const bare = {
      key: 'bare', name: 'Bare', system: 'dnd5e-2024', hitDie: 8, primaryAbility: ['str'], savingThrows: ['str', 'con'],
      skillChoices: { count: 2, from: ['athletics'] }, armorProficiencies: [], weaponProficiencies: [],
      asiLevels: [], subclassLevel: 3, subclassLabel: 'Path', description: 'x',
      features: [{ level: 1, name: 'Start', body: 'You begin.' }],
    } as unknown as Parameters<typeof standardLevelUpOptions>[0];
    const opts = standardLevelUpOptions(bare, { from: 5, to: 6, recorded: [] });
    expect(opts.empty).toBe(true);
  });
});
