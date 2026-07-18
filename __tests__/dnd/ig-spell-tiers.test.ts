// __tests__/dnd/ig-spell-tiers.test.ts — the scraped IG spell Advanced/Expert tier text (A19).
import { describe, it, expect } from 'vitest';
import { IG_SPELL_TIERS, igSpellTiers } from '@/lib/dnd/systems/intuitive-games/spell-tiers';
import { IG_SPELL_ROSTER } from '@/lib/dnd/systems/intuitive-games/content';

describe('IG spell tiers', () => {
  it('carries a substantial set of spells with both tiers', () => {
    const names = Object.keys(IG_SPELL_TIERS);
    expect(names.length).toBeGreaterThan(40);
    for (const [, t] of Object.entries(IG_SPELL_TIERS)) {
      expect(typeof t.advanced).toBe('string');
      expect(typeof t.expert).toBe('string');
    }
  });

  it('looks up tiers case-insensitively', () => {
    const burst = igSpellTiers('Burst');
    expect(burst?.advanced).toMatch(/three times your speed/i);
    expect(igSpellTiers('burst')).toEqual(burst); // case-insensitive
    expect(igSpellTiers('not a spell')).toBeUndefined();
    expect(igSpellTiers(null)).toBeUndefined();
  });

  it('covers most of the roster (tiers exist for known spells)', () => {
    const rosterNames = new Set(Object.values(IG_SPELL_ROSTER).flat().map((n) => n.toLowerCase()));
    const covered = Object.keys(IG_SPELL_TIERS).filter((n) => rosterNames.has(n.toLowerCase()));
    // Not every tier name must be on the roster (the site lists some off-roster), but a healthy overlap proves
    // the keys line up with the app's power names.
    expect(covered.length).toBeGreaterThan(20);
  });
});
