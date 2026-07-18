// __tests__/dnd/ig-companions.test.ts — the scraped IG companion-creature system (Area companions). The full
// build data (types, features, aspects, size table, rules) + the pure derivations that let the app build a
// companion sheet. Cross-checked against the site's worked Tiger example.
import { describe, it, expect } from 'vitest';
import {
  IG_COMPANION_TYPE_DEFS, IG_COMPANION_FEATURES, IG_COMPANION_ASPECTS, IG_COMPANION_SIZES,
  IG_COMPANION_EXAMPLE_TIGER, igCompanionHp, igCompanionSize, igCompanionAbility,
} from '@/lib/dnd/systems/intuitive-games/companions';

describe('IG companion catalog', () => {
  it('has the four Archon companion types', () => {
    expect(IG_COMPANION_TYPE_DEFS.map((t) => t.name).sort()).toEqual(['Beast Companion', 'Elemental', 'Familiar', 'Swarm']);
    for (const t of IG_COMPANION_TYPE_DEFS) expect(t.effect.length).toBeGreaterThan(20);
  });

  it('carries the scraped features + aspects with effect text', () => {
    expect(IG_COMPANION_FEATURES.map((f) => f.name)).toContain('Natural Armor');
    expect(IG_COMPANION_FEATURES.map((f) => f.name)).toContain('Poison/Venom');
    expect(IG_COMPANION_ASPECTS.map((a) => a.name)).toContain('Massive');
    expect(igCompanionAbility('Favored Strike')).toMatch(/1d6/);
    expect(igCompanionAbility('Sorcerous')).toMatch(/Wizard list/);
    expect(igCompanionAbility('nope')).toBeUndefined();
  });

  it('models the size table (Large has 10-ft reach, +1 STR, one damage step up)', () => {
    const large = igCompanionSize('large');
    expect(large.reachFt).toBe(10);
    expect(large.strMod).toBe(1);
    expect(large.damageStep).toBe(1);
    expect(IG_COMPANION_SIZES).toHaveLength(4);
  });
});

describe('IG companion HP derivation matches the rules', () => {
  it('level 1 HP equals the Constitution score (Tiger CON 16 → 16 HP)', () => {
    const t = IG_COMPANION_EXAMPLE_TIGER;
    expect(igCompanionHp(t.abilities.CON, 1)).toBe(t.hp);
    expect(igCompanionHp(t.abilities.CON, 1)).toBe(16);
  });

  it('each level after 1 adds 2 + the Constitution modifier', () => {
    // CON 16 → +3 mod → 5 per level. Level 3 = 16 + 5 + 5 = 26.
    expect(igCompanionHp(16, 3)).toBe(26);
    // A low-CON companion still gains at least 1 HP per level.
    expect(igCompanionHp(8, 3)).toBe(8 + 1 + 1);
  });
});
