// __tests__/dnd/derived-effective-abilities.test.ts — Slice 10 completion sweep: every DERIVED combat
// number must read the ledger-EFFECTIVE abilities, not the base scores, or an ability-boosting item
// moves the score pill but silently leaves AC / Initiative / Save DC / hit-die healing stale. These
// were the remaining base-score reads found by auditing the derived-value paths. Source-anchored.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const RAIL = read('app/dnd/_sheet/components/StatRail.tsx');
const COMBAT = read('app/dnd/_sheet/components/CombatPanel.tsx');
const INITP = read('app/dnd/_sheet/components/InitiativePrompt.tsx');
const STORE = read('app/dnd/_sheet/state/store.tsx');

describe('StatRail derived numbers use effective abilities', () => {
  it('Init + Save DC read effective STR/DEX (the pills already do), not base', () => {
    expect(RAIL).toContain('abilityMod(abilities.str)');
    expect(RAIL).toContain('abilityMod(abilities.dex)');
    expect(RAIL).not.toContain('abilityMod(char.abilities.str)');
    expect(RAIL).not.toContain('abilityMod(char.abilities.dex)');
  });
  it('initiative folds the ledger initiative target', () => {
    expect(RAIL).toContain("ledger.value('initiative'");
  });
});

describe('CombatPanel AC + Initiative use effective abilities', () => {
  it('AC is derived from the effective DEX mod', () => {
    expect(COMBAT).toContain('deriveAc(char.inventory, abilityMod(abilities.dex)');
    expect(COMBAT).not.toContain('abilityMod(char.abilities.dex)');
  });
  it('the Initiative line reads the ledger initiative target (effective DEX + effects)', () => {
    expect(COMBAT).toContain("ledger.value('initiative'");
  });
  it('CON-mod regen uses effective CON', () => {
    expect(COMBAT).toContain('abilityMod(abilities.con)');
    expect(COMBAT).not.toContain('abilityMod(char.abilities.con)');
  });
});

describe('the submitted initiative roll + hit-die healing use effective abilities', () => {
  it('InitiativePrompt computes the roll from the ledger initiative target', () => {
    expect(INITP).toContain("ledger.value('initiative'");
    expect(INITP).not.toContain('abilityMod(char.abilities.dex)');
  });
  it('hit-die healing uses effective CON', () => {
    expect(STORE).toContain('(abilities.con - 10)');
    expect(STORE).not.toContain('(char.abilities.con - 10)');
  });
});
