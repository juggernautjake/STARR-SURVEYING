import { describe, it, expect } from 'vitest';
import {
  RANGOR_FEATURES,
  FARMER_FEATURES,
  naturalArmorAC,
  ironChinAC,
  bestUnarmoredAC,
  toughBonusHp,
  UNSTOPPABLE_FORCE_RESOURCE,
} from '@/app/dnd/_sheet/data/rangor';

describe('Rangor species + Farmer background', () => {
  it('natural armor = 13 + DEX, Iron Chin = 12 + CON', () => {
    expect(naturalArmorAC(3)).toBe(16);
    expect(ironChinAC(2)).toBe(14);
  });

  it('best unarmored AC = max(10+DEX, 13+DEX, 12+CON) with the winning source', () => {
    // Jack (Str 17 / Con 15 / Dex 13 → dex +1, con +2): 13+1 == 12+2 == 14, natural wins the tie.
    expect(bestUnarmoredAC(1, 2)).toEqual({ ac: 14, source: 'Natural Armor' });
    // Con-heavy → Iron Chin.
    expect(bestUnarmoredAC(0, 4)).toEqual({ ac: 16, source: 'Iron Chin' });
    // Dex-heavy → natural armor.
    expect(bestUnarmoredAC(4, 0)).toEqual({ ac: 17, source: 'Natural Armor' });
  });

  it('Tough adds 2× character level to HP max', () => {
    expect(toughBonusHp(1)).toBe(2);
    expect(toughBonusHp(3)).toBe(6);
    expect(toughBonusHp(20)).toBe(40);
  });

  it('exposes the four Rangor traits + the Farmer/Tough cards + the 2/rest resource', () => {
    const rangor = RANGOR_FEATURES.map((f) => f.name.toLowerCase());
    expect(rangor.some((n) => n.includes('natural armor') || n.includes('scales'))).toBe(true);
    expect(rangor.some((n) => n.includes('living momentum'))).toBe(true);
    expect(rangor.some((n) => n.includes('powerful build'))).toBe(true);
    expect(rangor.some((n) => n.includes('unstoppable force'))).toBe(true);

    expect(FARMER_FEATURES.some((f) => f.name.toLowerCase().includes('tough'))).toBe(true);
    expect(FARMER_FEATURES.some((f) => f.name.toLowerCase().includes('farmer'))).toBe(true);

    // Unstoppable Force is a spendable 2/long-rest pip wired to the feature card.
    expect(UNSTOPPABLE_FORCE_RESOURCE.max).toBe(2);
    expect(UNSTOPPABLE_FORCE_RESOURCE.resetOn).toBe('long');
    const uf = RANGOR_FEATURES.find((f) => f.id === 'rangor-unstoppable-force');
    expect(uf?.use?.resourceId).toBe(UNSTOPPABLE_FORCE_RESOURCE.id);
  });

  it('every trait card is a structurally valid FeatureBlock', () => {
    for (const f of [...RANGOR_FEATURES, ...FARMER_FEATURES]) {
      expect(typeof f.id).toBe('string');
      expect(typeof f.name).toBe('string');
      expect(typeof f.source).toBe('string');
      expect(Array.isArray(f.body)).toBe(true);
      expect(f.body.length).toBeGreaterThan(0);
    }
  });
});
