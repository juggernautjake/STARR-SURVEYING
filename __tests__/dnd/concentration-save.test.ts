// __tests__/dnd/concentration-save.test.ts — the concentration-save roll is wired, and wired the 5e way.
//
// A concentration save is the one core 5e mechanic the sheet couldn't roll: take damage while
// concentrating → Constitution save, DC 10 (or half the damage). This pins the wiring that makes it real,
// the way this codebase pins save rolls (they compute their mod inline in the component/store, so the guard
// is a source anchor over the exact folds — not a pure-fn unit test, because there is no extracted fn).
//
// The three things a regression here would break, each asserted below:
//   1. the store exposes rollConcentrationSave and folds the RIGHT targets (incl. concentration_save, the
//      War-Caster-specific one — folding only con_saves would silently drop that bonus),
//   2. it rolls through rollCheck (so exhaustion + adv/dis cancellation apply like every other save),
//   3. the button is gated to 5e (the concentration TRACKER is system-agnostic; the ROLL is 5e-only —
//      offering it to a PF2/CoC/IG character is a cross-system rule leak).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const STORE = read('app/dnd/_sheet/state/store.tsx');
const TRACKER = read('app/dnd/_sheet/components/ConditionTracker.tsx');

describe('the store exposes a concentration-save roll', () => {
  it('declares rollConcentrationSave on the Ctx type and exports it from the value', () => {
    expect(STORE).toContain('rollConcentrationSave: () => void'); // Ctx type
    expect(STORE).toMatch(/const rollConcentrationSave = useCallback\(/);
    // exported in the context value object as a bare shorthand — the `,` form (not `:` from the type,
    // not `= useCallback` from the declaration) appears only on that export line.
    expect(STORE).toContain('rollConcentrationSave,');
  });

  it('folds the CON-save bonus AND the concentration-specific target — not just con_saves', () => {
    // concentration_save is the War-Caster target: advantage/bonus on concentration saves SPECIFICALLY.
    // All three must be summed, or a War Caster's advantage silently never reaches this roll.
    expect(STORE).toContain("ledger.value('concentration_save', 0)");
    expect(STORE).toContain("ledger.value('con_saves', 0)");
    expect(STORE).toContain("ledger.value('all_saves', 0)");
    // and the same three feed the advantage/disadvantage union
    expect(STORE).toContain("['concentration_save', 'con_saves', 'all_saves']");
  });

  it('rolls through rollCheck as a save (so exhaustion + adv/dis cancellation apply uniformly)', () => {
    expect(STORE).toMatch(/rollCheck\('Concentration Save', mod, \{ kind: 'save'/);
  });
});

describe('the ConditionTracker offers the save only on a 5e sheet', () => {
  it('wires a Save button to rollConcentrationSave, gated behind is5e', () => {
    expect(TRACKER).toContain('rollConcentrationSave');
    expect(TRACKER).toContain("const is5e = system === 'dnd5e-2024' || system === 'dnd5e-2014'");
    expect(TRACKER).toContain('{is5e && (');
    expect(TRACKER).toContain('onClick={() => rollConcentrationSave()}');
  });
});
