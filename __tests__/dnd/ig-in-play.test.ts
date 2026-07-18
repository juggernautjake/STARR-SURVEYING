// __tests__/dnd/ig-in-play.test.ts — the PURE "what's in play" model that feeds the IG sheet's
// active-stance/condition display + hover tooltips + the AI's explanations (IG buildout Area B).
import { describe, it, expect } from 'vitest';
import {
  igStanceInPlay,
  igConditionInPlay,
  igEffectsInPlay,
  IG_STANCE_ADVANCED_LEVEL,
} from '@/lib/dnd/systems/intuitive-games/inPlay';

describe('igStanceInPlay', () => {
  it('resolves a stance name (with or without the word "Stance") to its in-play effect', () => {
    const a = igStanceInPlay('Defensive', 1);
    const b = igStanceInPlay('defensive stance', 1);
    expect(a?.name).toBe('Defensive Stance');
    expect(b?.name).toBe('Defensive Stance');
    expect(a?.vanilla).toBe(true);
  });

  it('applies the Basic benefit below level 5 and the Advanced benefit at level 5+ (a single benefit)', () => {
    const low = igStanceInPlay('Defensive', 4)!;
    const high = igStanceInPlay('Defensive', IG_STANCE_ADVANCED_LEVEL)!;
    expect(low.summary).toMatch(/advantage on all Reflex saves/i);   // Basic
    expect(low.summary).not.toMatch(/Damage Reduction/i);
    expect(high.summary).toMatch(/Damage Reduction/i);               // Advanced
  });

  it('the tooltip always carries BOTH tiers + the general stance rules', () => {
    const t = igStanceInPlay('Offensive', 1)!.tooltip;
    expect(t).toMatch(/Basic \(below Lv 5\)/);
    expect(t).toMatch(/Advanced \(Lv 5\+\)/);
    expect(t).toMatch(/One stance is active at a time/i);
  });

  it('an unknown stance resolves as a custom entry, never invented or borrowed', () => {
    const c = igStanceInPlay('Berserker Fury', 6)!;
    expect(c.vanilla).toBe(false);
    expect(c.name).toBe('Berserker Fury Stance');
    expect(c.tooltip).toMatch(/do not define it/i);
  });

  it('returns null for an empty/absent stance', () => {
    expect(igStanceInPlay(null, 3)).toBeNull();
    expect(igStanceInPlay('  ', 3)).toBeNull();
  });
});

describe('igConditionInPlay', () => {
  it('resolves a known condition to its full IG rules text (tooltip + summary)', () => {
    const g = igConditionInPlay('Grappled')!;
    expect(g.vanilla).toBe(true);
    expect(g.name).toBe('Grappled');
    expect(g.tooltip).toMatch(/flat-footed/i);
    expect(g.tooltip).toMatch(/two hands/i);
  });

  it('an unknown condition resolves as custom (no invented rules)', () => {
    const c = igConditionInPlay('Cursed')!;
    expect(c.vanilla).toBe(false);
    expect(c.tooltip).toMatch(/do not define it/i);
  });

  it('returns null for an empty name', () => {
    expect(igConditionInPlay('')).toBeNull();
  });
});

describe('igEffectsInPlay', () => {
  it('lists the active stance first, then each condition, with display + tooltip', () => {
    const effs = igEffectsInPlay({ stance: 'Menacing', conditions: ['Prone', 'Shaken'], level: 6 });
    expect(effs.map((e) => e.kind)).toEqual(['stance', 'condition', 'condition']);
    expect(effs[0].name).toBe('Menacing Stance');
    expect(effs[0].summary).toMatch(/advantage on all combat skills/i); // Advanced at Lv 6
    expect(effs[1].name).toBe('Prone');
    expect(effs[2].tooltip).toMatch(/-2 penalty/i); // Shaken
  });

  it('is empty when nothing is in play', () => {
    expect(igEffectsInPlay({ level: 3 })).toEqual([]);
    expect(igEffectsInPlay({ stance: null, conditions: [], level: 3 })).toEqual([]);
  });
});
