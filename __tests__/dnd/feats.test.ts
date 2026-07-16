// __tests__/dnd/feats.test.ts — 2024 feats data (Slice 4).
//
// The invariant the doc names: "no feat grants an ability increase it shouldn't." In 2024 that means
// ORIGIN (and Fighting Style) feats grant NO ability score increase — the 2014-vs-2024 trap. This
// pins the Origin category shipped so far, so a later edit can't reintroduce a 2014-style ability rider.
import { describe, it, expect } from 'vitest';
import {
  ORIGIN_FEATS_2024,
  FIGHTING_STYLE_FEATS_2024,
  FEATS_2024,
  NO_ASI_CATEGORIES,
  featsByCategory,
  findFeat,
  featGrantsAbilityIncrease,
} from '@/lib/dnd/feats/dnd5e-2024';

describe('2024 Origin feats', () => {
  it('grant NO ability score increase (the 2024 rule)', () => {
    for (const feat of ORIGIN_FEATS_2024) {
      expect(feat.abilityIncrease, `${feat.name} must not carry an ability increase`).toBeUndefined();
      expect(featGrantsAbilityIncrease(feat)).toBe(false);
    }
  });

  it('have NO prerequisites — every Origin feat is available at level 1', () => {
    for (const feat of ORIGIN_FEATS_2024) {
      expect(feat.prerequisites ?? []).toEqual([]);
      expect(feat.category).toBe('origin');
    }
  });

  it('cover the full 2024 Origin list', () => {
    const names = ORIGIN_FEATS_2024.map((f) => f.name);
    for (const expected of ['Alert', 'Crafter', 'Healer', 'Lucky', 'Musician', 'Savage Attacker', 'Skilled', 'Tavern Brawler', 'Tough']) {
      expect(names).toContain(expected);
    }
    expect(names.some((n) => n.startsWith('Magic Initiate'))).toBe(true);
  });

  it('every feat has full benefit text and a summary — no stubs', () => {
    for (const feat of FEATS_2024) {
      expect(feat.benefit.length, `${feat.name} benefit`).toBeGreaterThan(40);
      expect(feat.summary.length, `${feat.name} summary`).toBeGreaterThan(10);
      expect(feat.system).toBe('dnd5e-2024');
    }
  });

  it('keys are unique and findFeat resolves them', () => {
    const keys = FEATS_2024.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(findFeat('tough')?.name).toBe('Tough');
    expect(findFeat('nope')).toBeUndefined();
  });

  it('featsByCategory returns each shipped category; unshipped ones are empty', () => {
    expect(featsByCategory('origin')).toHaveLength(ORIGIN_FEATS_2024.length);
    expect(featsByCategory('fighting-style')).toHaveLength(FIGHTING_STYLE_FEATS_2024.length);
    expect(featsByCategory('general')).toEqual([]);
    expect(featsByCategory('epic-boon')).toEqual([]);
  });

  it('Skilled and Magic Initiate are marked repeatable; Tough is not', () => {
    expect(findFeat('skilled')?.repeatable).toBe(true);
    expect(findFeat('magic-initiate')?.repeatable).toBe(true);
    expect(findFeat('tough')?.repeatable).toBeUndefined();
  });
});

describe('2024 Fighting Style feats', () => {
  it('grant NO ability score increase — the second no-ASI category', () => {
    for (const feat of FIGHTING_STYLE_FEATS_2024) {
      expect(feat.category).toBe('fighting-style');
      expect(featGrantsAbilityIncrease(feat)).toBe(false);
    }
  });

  it('cover the full 2024 Fighting Style list', () => {
    const names = FIGHTING_STYLE_FEATS_2024.map((f) => f.name);
    for (const expected of ['Archery', 'Blind Fighting', 'Defense', 'Dueling', 'Great Weapon Fighting', 'Interception', 'Protection', 'Thrown Weapon Fighting', 'Two-Weapon Fighting', 'Unarmed Fighting']) {
      expect(names).toContain(expected);
    }
  });
});

describe('the no-ASI invariant holds across every category the rules exempt', () => {
  it('no feat in a NO_ASI_CATEGORIES category grants an ability increase', () => {
    for (const feat of FEATS_2024) {
      if (NO_ASI_CATEGORIES.includes(feat.category)) {
        expect(featGrantsAbilityIncrease(feat), `${feat.name} (${feat.category})`).toBe(false);
      }
    }
  });
});
