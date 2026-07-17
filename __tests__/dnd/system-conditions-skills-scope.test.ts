// __tests__/dnd/system-conditions-skills-scope.test.ts — Ground Rule 1 for the sheet's system-scoped
// CONDITION and SKILL lists (the ConditionTracker + a system-aware skills view read these). Each system
// must return its OWN set, and a condition/skill distinctive to one system must never appear in another —
// the same guardrail system-integrity.test.ts gives classes/subclasses/feats, extended to these lists.
import { describe, it, expect } from 'vitest';
import { systemConditions, systemSkills } from '@/lib/dnd/system-rules';

const FOCUS = ['dnd5e-2014', 'dnd5e-2024', 'pathfinder2e', 'intuitive-games'] as const;
const skillNames = (sys: (typeof FOCUS)[number]) => systemSkills(sys).map((s) => s.name.toLowerCase());
const conds = (sys: (typeof FOCUS)[number]) => systemConditions(sys).map((c) => c.toLowerCase());

describe('every focus system returns its own non-empty conditions + skills', () => {
  it.each(FOCUS)('%s has conditions and skills', (sys) => {
    expect(systemConditions(sys).length).toBeGreaterThan(0);
    expect(systemSkills(sys).length).toBeGreaterThan(0);
  });
});

describe('conditions do not leak across systems (Ground Rule 1)', () => {
  it('Pathfinder 2e has its numeric-attribute conditions; 5e does not', () => {
    expect(conds('pathfinder2e')).toEqual(expect.arrayContaining(['clumsy', 'enfeebled', 'off-guard']));
    for (const c of ['clumsy', 'enfeebled', 'off-guard']) {
      expect(conds('dnd5e-2024'), `${c} must not leak into 5e`).not.toContain(c);
    }
  });
  it('5e has Charmed / Restrained; Pathfinder 2e does not (it models those differently)', () => {
    expect(conds('dnd5e-2024')).toEqual(expect.arrayContaining(['charmed', 'restrained']));
    for (const c of ['charmed', 'restrained']) {
      expect(conds('pathfinder2e'), `${c} must not leak into PF2`).not.toContain(c);
    }
  });
  it('Intuitive Games has its own survival conditions absent from both 5e and PF2', () => {
    expect(conds('intuitive-games')).toContain('heatstroke');
    expect(conds('dnd5e-2024')).not.toContain('heatstroke');
    expect(conds('pathfinder2e')).not.toContain('heatstroke');
  });
});

describe('skills do not leak across systems (Ground Rule 1)', () => {
  it('Intuitive Games uses Bluff (its own skill list); 5e uses Deception', () => {
    expect(skillNames('intuitive-games')).toContain('bluff');
    expect(skillNames('intuitive-games')).not.toContain('deception');
    expect(skillNames('dnd5e-2024')).toContain('deception');
    expect(skillNames('dnd5e-2024')).not.toContain('bluff');
  });
});
