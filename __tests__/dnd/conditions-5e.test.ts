// __tests__/dnd/conditions-5e.test.ts — the pure 5e condition mechanics registry (foundation for auto-fold).
// Data only, not yet wired into buildLedger; this pins the RAW effects + the honest notes.
import { describe, it, expect } from 'vitest';
import { CONDITION_MECHANICS_5E, conditionMechanics5e, conditionEffects5e } from '@/lib/dnd/conditions/dnd5e';

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
