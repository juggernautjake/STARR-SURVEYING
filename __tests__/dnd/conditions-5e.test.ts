// __tests__/dnd/conditions-5e.test.ts — the 5e condition mechanics registry + its ledger fold. Pins the RAW
// effects, the honest notes, and that active conditions fold into the ledger (rollFlags/explain) when the
// auto-mechanics toggle opts in via `foldConditions` — off is the "vanilla roller" with straight rolls.
import { describe, it, expect } from 'vitest';
import { CONDITION_MECHANICS_5E, conditionMechanics5e, conditionEffects5e } from '@/lib/dnd/conditions/dnd5e';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

describe('5e condition mechanics registry', () => {
  it('models the disadvantage-on-attacks-and-checks conditions as ledger roll effects', () => {
    const poisoned = conditionMechanics5e('Poisoned')!;
    expect(poisoned.effects).toEqual([
      { target: 'attack_roll', operation: 'disadvantage', source: 'Poisoned' },
      { target: 'all_skills', operation: 'disadvantage', source: 'Poisoned' },
    ]);
    // Frightened matches (both give disadvantage on attacks + ability checks).
    expect(conditionMechanics5e('frightened')!.effects.map((e) => e.target)).toEqual(['attack_roll', 'all_skills']);
  });

  it('models save-related conditions on the specific saves (Restrained → DEX save disadvantage)', () => {
    expect(conditionMechanics5e('Restrained')!.effects.map((e) => e.target)).toEqual(['attack_roll', 'dex_saves']);
    expect(conditionMechanics5e('Paralyzed')!.effects.map((e) => e.target)).toEqual(['str_saves', 'dex_saves']);
  });

  it('Invisible is a BENEFIT (advantage on attacks), not a penalty', () => {
    expect(conditionMechanics5e('Invisible')!.effects).toEqual([{ target: 'attack_roll', operation: 'advantage', source: 'Invisible' }]);
  });

  it('conditions with no self-roll modifier carry an empty effects list + an explanatory note', () => {
    for (const name of ['Charmed', 'Deafened', 'Incapacitated', 'Grappled']) {
      const c = conditionMechanics5e(name)!;
      expect(c.effects, `${name} should model no self-roll effect`).toEqual([]);
      expect(c.note.length, `${name} needs a note`).toBeGreaterThan(0);
    }
  });

  it('every condition carries a note (nothing silently unmodeled) and a valid effect shape', () => {
    for (const c of CONDITION_MECHANICS_5E) {
      expect(c.note.length, `${c.name} note`).toBeGreaterThan(0);
      for (const e of c.effects) {
        expect(['advantage', 'disadvantage']).toContain(e.operation); // conditions only add roll flags, never flat numbers here
        expect(e.source).toBe(c.name);
      }
    }
  });

  it('conditionEffects5e combines active conditions and ignores unknown/custom ones (never invented)', () => {
    const eff = conditionEffects5e(['Poisoned', 'Made-Up Condition', 'Prone']);
    // Poisoned (2) + Prone (1) = 3; the unknown contributes nothing.
    expect(eff).toHaveLength(3);
    expect(conditionMechanics5e('Made-Up Condition')).toBeUndefined();
    expect(conditionEffects5e([])).toEqual([]);
    expect(conditionEffects5e(undefined)).toEqual([]);
  });
});

describe('conditions fold into buildLedger when opted in (foldConditions gate)', () => {
  it('a Poisoned 5e character gets disadvantage on attacks + skills, attributed to "Poisoned"', () => {
    const c = blankCharacter('C');
    c.combat = { ...c.combat, conditions: ['Poisoned'] };
    // OFF (vanilla roller): no condition effect.
    const off = buildLedger(c, { system: 'dnd5e-2024' });
    expect(off.rollFlags('attack_roll').disadvantage).toBe(false);
    // ON (auto-mechanics): folds + explains.
    const on = buildLedger(c, { system: 'dnd5e-2024', foldConditions: true });
    expect(on.rollFlags('attack_roll').disadvantage).toBe(true);
    expect(on.rollFlags('all_skills').disadvantage).toBe(true);
    expect(on.explain('attack_roll').some((e: { source: string }) => e.source === 'Poisoned')).toBe(true);
  });

  it('is 5e-scoped: an IG/PF2 system does not fold the 5e registry (they have their own models)', () => {
    const c = blankCharacter('C');
    c.combat = { ...c.combat, conditions: ['Poisoned'] };
    expect(buildLedger(c, { system: 'pathfinder2e', foldConditions: true }).rollFlags('attack_roll').disadvantage).toBe(false);
  });
});
