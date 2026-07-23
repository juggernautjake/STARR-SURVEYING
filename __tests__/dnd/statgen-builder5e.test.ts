// __tests__/dnd/statgen-builder5e.test.ts — the 5e manual-builder logic layer (MB-2).
//
// Runs against the REAL catalogs, so it also proves the catalog APIs are wired correctly (the point of a pure
// logic layer the UI can trust).
import { describe, it, expect } from 'vitest';
import {
  dnd5eSpeciesIncreases,
  dnd5eBackgroundAbilities,
  dnd5eSubclassLevelFor,
  dnd5eFeatLevelsFor,
  dnd5eFeatSlotsAtLevel,
  dnd5eSubclassOptions,
  dnd5eValidatePicks,
} from '@/lib/dnd/statgen/builder5e';
import { backgroundsForSystem } from '@/lib/dnd/backgrounds/index';

const T14 = 'dnd5e-2014';
const T24 = 'dnd5e-2024';

describe('species increases', () => {
  it('2014 races grant racial ability increases', () => {
    // A 2014 base race resolves to some increase (the catalog carries them for 2014).
    const inc = dnd5eSpeciesIncreases(T14, 'Human');
    expect(Object.keys(inc).length).toBeGreaterThan(0);
  });
  it('2024 species grant NO ability increase (they moved to background)', () => {
    expect(dnd5eSpeciesIncreases(T24, 'Human')).toEqual({});
  });
  it('an unknown / empty species yields no increase', () => {
    expect(dnd5eSpeciesIncreases(T14, '')).toEqual({});
    expect(dnd5eSpeciesIncreases(T14, 'Nonesuch')).toEqual({});
  });
});

describe('background ability options', () => {
  it('2024 backgrounds expose three abilities for the spread', () => {
    const list = dnd5eBackgroundAbilities(T24, dnd5eBackgroundName24());
    expect(list.length).toBe(3);
  });
  it('2014 backgrounds grant no ability spread', () => {
    expect(dnd5eBackgroundAbilities(T14, 'Acolyte')).toEqual([]);
  });
});

describe('subclass + feat levels', () => {
  it('a class reports its subclass level and ASI/feat levels', () => {
    const sub = dnd5eSubclassLevelFor(T24, 'Fighter');
    expect(sub).toBeGreaterThan(0);
    const feats = dnd5eFeatLevelsFor(T24, 'Fighter');
    expect(feats.length).toBeGreaterThan(0);
    expect(feats).toContain(4); // every class gets an ASI at 4
  });
  it('counts feat slots earned by a given level', () => {
    const at3 = dnd5eFeatSlotsAtLevel(T24, 'Fighter', 3);
    const at8 = dnd5eFeatSlotsAtLevel(T24, 'Fighter', 8);
    expect(at8).toBeGreaterThan(at3); // more ASIs unlocked by 8
  });
  it('lists a class\'s subclass options', () => {
    const opts = dnd5eSubclassOptions(T24, 'Fighter');
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0]).toHaveProperty('name');
  });
  it('an unknown class reports 0 / empty', () => {
    expect(dnd5eSubclassLevelFor(T24, 'Nonesuch')).toBe(0);
    expect(dnd5eFeatLevelsFor(T24, 'Nonesuch')).toEqual([]);
    expect(dnd5eSubclassOptions(T24, 'Nonesuch')).toEqual([]);
  });
});

describe('validatePicks', () => {
  it('requires a class and a 1–20 level', () => {
    expect(dnd5eValidatePicks({ system: T24, level: 1 }).errors.some((e) => /Choose a class/.test(e))).toBe(true);
    expect(dnd5eValidatePicks({ system: T24, level: 21, className: 'Fighter' }).errors.some((e) => /Level must be/.test(e))).toBe(true);
  });
  it('requires a subclass once the subclass level is reached', () => {
    const subLevel = dnd5eSubclassLevelFor(T24, 'Fighter');
    const below = dnd5eValidatePicks({ system: T24, level: Math.max(1, subLevel - 1), className: 'Fighter' });
    expect(below.subclassUnlocked).toBe(false); // no subclass required yet
    const at = dnd5eValidatePicks({ system: T24, level: subLevel, className: 'Fighter' });
    expect(at.subclassUnlocked).toBe(true);
    expect(at.errors.some((e) => /chooses a subclass/.test(e))).toBe(true);
  });
  it('passes a complete, legal set of picks', () => {
    const subLevel = dnd5eSubclassLevelFor(T24, 'Fighter');
    const sub = dnd5eSubclassOptions(T24, 'Fighter')[0];
    const v = dnd5eValidatePicks({ system: T24, level: subLevel, className: 'Fighter', subclass: sub.key });
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});

// A real 2024 background name to test the spread; pulled from the catalog so the test isn't brittle.
function dnd5eBackgroundName24(): string {
  return backgroundsForSystem('dnd5e-2024')[0].name;
}
