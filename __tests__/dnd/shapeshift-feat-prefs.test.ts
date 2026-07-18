// __tests__/dnd/shapeshift-feat-prefs.test.ts — the shapeshiftStats + featAutoApply preferences, wired into
// the effect ledger. Both gate ability-score effects at derive time: a form's `set` scores (shapeshiftStats)
// and a feat feature's ability `add` (featAutoApply).
import { describe, it, expect } from 'vitest';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

// A character with STR 16 and an active bear form that SETS STR to 20 and grants a fly speed.
function withBearForm(): Character {
  const c = blankCharacter('Shifter');
  c.abilities = { ...c.abilities, str: 16 };
  c.forms = [{
    id: 'bear', name: 'Dire Bear', unlockLevel: 1,
    effects: [
      { target: 'ability_str', operation: 'set', value: 20 },
      { target: 'speed_fly', operation: 'add', value: 20 },
    ],
  }] as Character['forms'];
  c.activeFormId = 'bear';
  return c;
}

describe('shapeshiftStats — how an active form treats ability scores', () => {
  it('full (default): the form replaces STR up to 20', () => {
    expect(buildLedger(withBearForm(), { shapeshiftStats: 'full' }).value('ability_str', 16)).toBe(20);
  });

  it('full: the form replaces STR DOWN too (a weak form lowers it)', () => {
    const c = withBearForm();
    c.forms![0].effects = [{ target: 'ability_str', operation: 'set', value: 6 }];
    expect(buildLedger(c, { shapeshiftStats: 'full' }).value('ability_str', 16)).toBe(6);
  });

  it('partial: STR is pulled to the midpoint of base (16) and form (20) → 18', () => {
    expect(buildLedger(withBearForm(), { shapeshiftStats: 'partial' }).value('ability_str', 16)).toBe(18);
  });

  it('none: the form never touches STR (stays 16) but still grants its fly speed', () => {
    const led = buildLedger(withBearForm(), { shapeshiftStats: 'none' });
    expect(led.value('ability_str', 16)).toBe(16);
    expect(led.value('speed_fly', 0)).toBe(20); // non-ability form effects still apply
  });

  it('defaults to full when unspecified', () => {
    expect(buildLedger(withBearForm()).value('ability_str', 16)).toBe(20);
  });
});

// A character with a Resilient-style feat feature granting +1 CON, plus a class feature granting +1 CON.
function withFeatAndClassBonus(): Character {
  const c = blankCharacter('Fighter');
  c.abilities = { ...c.abilities, con: 14 };
  c.features = [
    { id: 'resilient', name: 'Resilient (Con)', source: 'Feat', unlockLevel: 1, body: [], effects: [{ target: 'ability_con', operation: 'add', value: 1 }] },
    { id: 'tough', name: 'Hardy', source: 'Class', unlockLevel: 1, body: [], effects: [{ target: 'ability_con', operation: 'add', value: 1 }] },
  ] as Character['features'];
  return c;
}

describe('featAutoApply — a feat feature ability increase folding into the sheet', () => {
  it('on (default): the feat +1 CON AND the class +1 CON both apply → 16', () => {
    expect(buildLedger(withFeatAndClassBonus(), { featAutoApply: true }).value('ability_con', 14)).toBe(16);
  });

  it('off: the FEAT +1 is withheld (apply by hand) but the CLASS +1 still applies → 15', () => {
    expect(buildLedger(withFeatAndClassBonus(), { featAutoApply: false }).value('ability_con', 14)).toBe(15);
  });

  it('defaults to applying the feat when unspecified', () => {
    expect(buildLedger(withFeatAndClassBonus()).value('ability_con', 14)).toBe(16);
  });
});
