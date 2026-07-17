import { describe, it, expect } from 'vitest';
import {
  normalizeCustomClass, customClassSummary, customClassFeatureBlocks, HIT_DICE,
} from '@/lib/dnd/homebrew/customClass';

// Slice 5 foundation — a homebrew class is a validated, well-formed definition, not a loose pile.
describe('normalizeCustomClass', () => {
  it('coerces a clean input faithfully', () => {
    const def = normalizeCustomClass({
      name: 'Spellblade', hitDie: 10, keyAbility: 'int', saveProficiencies: ['con', 'int'],
      skillCount: 3, caster: 'prepared', primaryAbilities: ['int', 'dex'],
      features: [{ level: 3, name: 'Arcane Strike', text: 'Add 1d6 force to a hit.' }, { level: 1, name: 'Blade Bond', text: 'Bond a weapon.' }],
    });
    expect(def.name).toBe('Spellblade');
    expect(def.hitDie).toBe(10);
    expect(def.keyAbility).toBe('int');
    expect(def.saveProficiencies).toEqual(['con', 'int']);
    expect(def.caster).toBe('prepared');
    // features sorted by level
    expect(def.features.map((f) => f.name)).toEqual(['Blade Bond', 'Arcane Strike']);
  });

  it('clamps the hit die to the nearest legal value and skillCount to 0..10', () => {
    expect(normalizeCustomClass({ hitDie: 7 }).hitDie).toBe(6);   // 7 → nearest {6,8} → 6
    expect(normalizeCustomClass({ hitDie: 9 }).hitDie).toBe(8);   // ties resolve low (8 seen before 10)
    expect(normalizeCustomClass({ hitDie: 20 }).hitDie).toBe(12);
    expect(HIT_DICE).toContain(normalizeCustomClass({ hitDie: 'x' }).hitDie);
    expect(normalizeCustomClass({ skillCount: 99 }).skillCount).toBe(10);
    expect(normalizeCustomClass({ skillCount: -3 }).skillCount).toBe(0);
  });

  it('drops invalid ability keys and defaults sensibly', () => {
    const def = normalizeCustomClass({ keyAbility: 'luck', saveProficiencies: ['str', 'bogus'] });
    expect(def.keyAbility).toBe('str'); // invalid → default
    expect(def.saveProficiencies).toEqual(['str']); // bogus dropped
  });

  it('defaults an empty save list to the key ability’s save', () => {
    expect(normalizeCustomClass({ keyAbility: 'wis' }).saveProficiencies).toEqual(['wis']);
  });

  it('drops nameless features and clamps their levels', () => {
    const def = normalizeCustomClass({ features: [{ name: '', text: 'x' }, { name: 'Big', level: 99, text: 'y' }] });
    expect(def.features).toHaveLength(1);
    expect(def.features[0]).toMatchObject({ name: 'Big', level: 20 });
  });

  it('survives garbage input', () => {
    expect(normalizeCustomClass(null).name).toBe('Homebrew Class');
    expect(normalizeCustomClass('nope').caster).toBe('none');
  });
});

describe('customClassSummary + feature projection', () => {
  const def = normalizeCustomClass({
    name: 'Warden', hitDie: 12, keyAbility: 'con', saveProficiencies: ['con', 'wis'], skillCount: 2, caster: 'none',
    features: [{ level: 1, name: 'Stone Skin', text: 'Resistance while unarmored.' }],
  });
  it('summary reads the headline facts', () => {
    expect(customClassSummary(def)).toMatch(/Warden — d12 hit die; key CON; saves CON\/WIS; 2 skills; non-caster\./);
  });
  it('projects features into sheet-ready blocks (renders like an official class)', () => {
    const blocks = customClassFeatureBlocks(def);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ name: 'Stone Skin', source: 'Warden 1' });
    expect(blocks[0].body[0]).toMatch(/Resistance/);
    expect(blocks[0].id).toContain('hbclass-warden-1-stone-skin');
  });
});
