// __tests__/dnd/ig-content.test.ts — the Intuitive Games vanilla content library is well-formed and
// covers the system's content (IG builder Slice 1). It is the recognition key for provenance flagging.
import { describe, it, expect } from 'vitest';
import {
  IG_STANCES, IG_FEATS, IG_POWERS, IG_DEFENSIVE_POWERS, IG_WEAPON_TYPES, IG_MOVEMENT_TYPES,
  igIsVanilla, igVanillaNames, igContentSummary,
} from '@/lib/dnd/systems/intuitive-games/content';
import { systemRulesBlock } from '@/lib/dnd/system-rules';

describe('Intuitive Games vanilla content library (Slice 1)', () => {
  it('has the 10 stances, each with an effect', () => {
    expect(IG_STANCES).toHaveLength(10);
    for (const s of IG_STANCES) { expect(s.name).toBeTruthy(); expect(s.effect).toBeTruthy(); }
    expect(IG_STANCES.map((s) => s.name)).toEqual(expect.arrayContaining(['Offensive', 'Defensive', 'Precise', 'Menacing']));
  });

  it('has the powers grouped by school and the defensive powers', () => {
    expect(IG_POWERS.length).toBeGreaterThan(30);
    const schools = new Set(IG_POWERS.map((p) => p.category));
    expect(schools).toEqual(new Set(['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Transmutation']));
    expect(IG_POWERS.map((p) => p.name)).toEqual(expect.arrayContaining(['Elemental Blast', 'Mirror Image', 'Teleportation']));
    expect(IG_DEFENSIVE_POWERS.map((d) => d.name)).toEqual(expect.arrayContaining(['Redirect', 'Sidestep', 'Counterattack']));
  });

  it('generates the 15-entry weapon-type taxonomy and the movement types', () => {
    expect(IG_WEAPON_TYPES).toHaveLength(15); // 5 classes × 3 damage types
    expect(IG_WEAPON_TYPES).toEqual(expect.arrayContaining(['Light Slashing', 'Heavy Bludgeoning', 'Ranged Piercing']));
    expect(IG_MOVEMENT_TYPES).toEqual(expect.arrayContaining(['Fast', 'Fly 30', 'Burrow 10', 'Swim 20']));
    expect(IG_FEATS.length).toBeGreaterThan(15);
  });

  it('igIsVanilla recognizes real content (case/space-insensitive) and rejects invented content', () => {
    expect(igIsVanilla('stance', 'Offensive')).toBe(true);
    expect(igIsVanilla('stance', '  offensive ')).toBe(true);
    expect(igIsVanilla('power', 'Mirror Image')).toBe(true);
    expect(igIsVanilla('weapon-type', 'Light Slashing')).toBe(true);
    expect(igIsVanilla('feat', 'Toughness')).toBe(true);
    // Invented content is not vanilla.
    expect(igIsVanilla('stance', 'Berserker Fury')).toBe(false);
    expect(igIsVanilla('power', 'Fireball Supreme')).toBe(false);
    expect(igIsVanilla('feat', 'My Homebrew Feat')).toBe(false);
    expect(igVanillaNames('spell')).toEqual(igVanillaNames('power')); // spell is an alias for power
  });

  it('the content summary exposes every kind and grounding lists the vanilla options', () => {
    const summary = igContentSummary();
    expect(Object.keys(summary)).toEqual(expect.arrayContaining(['stance', 'power', 'feat', 'defensive-power', 'weapon-type', 'movement-type']));
    const block = systemRulesBlock('intuitive-games');
    expect(block).toMatch(/Stances \(adopt one/);
    expect(block).toMatch(/Elemental Blast/);
    expect(block).toMatch(/Defensive Powers: /);
  });
});
