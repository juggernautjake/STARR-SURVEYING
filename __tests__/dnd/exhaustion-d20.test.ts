// __tests__/dnd/exhaustion-d20.test.ts — exhaustion at roll time, now EDITION + MODEL aware (Area M1b).
//
// The pure rule lives in lib/dnd/mechanics/exhaustion.ts (unit-tested in mechanics-exhaustion.test.ts). This
// source-anchors that the store's rollCheck / rollDeathSave and the InitiativePrompt all consume that helper
// (via the character's edition + the effective exhaustionModel) instead of the old edition-blind flat
// `mod - 2 * exh`. A regression that dropped the roll-time penalty, or reverted to the flat-for-everyone
// model, fails here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const STORE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');
const INITP = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/InitiativePrompt.tsx'), 'utf8');

describe('exhaustion at roll time is edition + model aware (M1b)', () => {
  it('rollCheck folds the exhaustion helper result into the modifier + advantage mode', () => {
    expect(STORE).toContain('exhaustionD20Effect(exhKind, exh, edition, exhaustionModel)');
    expect(STORE).toContain('rollD20(mod + exhEff.penalty, mode, rollCritMin)');
    // the 2014 tiered model's disadvantage folds into hasDis
    expect(STORE).toContain('exhEff.disadvantage');
    // the old edition-blind flat fold is gone
    expect(STORE).not.toContain('rollD20(mod - 2 * exh');
  });

  it('death saves (a save) use the same helper on the ledger-folded bonus', () => {
    expect(STORE).toContain("exhaustionD20Effect('save', exh, edition, exhaustionModel)");
    expect(STORE).toContain("ledger.value('death_save', char.combat.deathSaveBonus) + exhEff.penalty");
    expect(STORE).not.toContain("char.combat.deathSaveBonus) - 2 * exh");
  });

  it('submitted initiative (a DEX check) uses the same helper, so the flat model still penalizes turn order', () => {
    expect(INITP).toContain("exhaustionD20Effect('check', char.combat.exhaustion || 0, edition, preferences.exhaustionModel.value)");
    expect(INITP).toContain('+ exhInit.penalty');
  });

  it('the edition is derived from the system key and exposed on the store context', () => {
    expect(STORE).toMatch(/const edition: Edition = system\?\.includes\('2014'\) \? '2014' : '2024'/);
    expect(STORE).toContain('edition,'); // in the context value
  });

  it('exhaustion is still capped at 6 (death) wherever it is set', () => {
    expect((STORE.match(/Math\.min\(6, /g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('the 2014 tiered table is now the main model for the 2014 edition (owner 2026-07-17)', () => {
  // The AI grounding always distinguished the editions (tiered table for 2014); now the SHEET matches it,
  // instead of applying the flat 2024 penalty to every character. The mechanical rule is proven in
  // mechanics-exhaustion.test.ts; this pins that the grounding still describes the tiered table it enforces.
  const SYSTEM_RULES = fs.readFileSync(path.join(process.cwd(), 'lib/dnd/system-rules.ts'), 'utf8');
  it('the AI grounding still describes the 2014 tiered table the sheet now enforces', () => {
    expect(SYSTEM_RULES).toMatch(/TIERED/i);
  });
});

describe('auto-mechanics toggle gates the exhaustion fold (Area R2)', () => {
  it('reads the autoMechanics pref and only folds exhaustion when it is ON', () => {
    expect(STORE).toContain('const autoMechanics = prefs.autoMechanics.value');
    expect(STORE).toContain('const NO_EXH = { penalty: 0, disadvantage: false } as const');
    // every d20 fold site is gated: on → the helper, off → the no-op
    expect(STORE).toContain('autoMechanics ? exhaustionD20Effect(exhKind, exh, edition, exhaustionModel) : NO_EXH');
    expect(STORE).toContain("autoMechanics ? exhaustionD20Effect('save', exh, edition, exhaustionModel) : NO_EXH");
    // when off, exhaustion is flagged for manual application rather than silently ignored
    expect(STORE).toContain('EXH (apply manually)');
    // the callbacks depend on autoMechanics so toggling re-derives them
    expect(STORE).toMatch(/exhaustionModel, autoMechanics\]/);
  });
});
