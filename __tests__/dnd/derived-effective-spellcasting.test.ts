// __tests__/dnd/derived-effective-spellcasting.test.ts — the base-vs-effective audit, continued into the
// spellcasting + weapon-damage + form paths. A caster's INT/CHA item must raise the Spell Save DC / spell
// attack; a STR item must raise weapon damage; a transformed character's form abilities use the form's
// (imposed) STR. All were reading base scores. Source-anchored guard.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const STORE = read('app/dnd/_sheet/state/store.tsx');
const SPELLS = read('app/dnd/_sheet/components/SpellsPanel.tsx');
const STREAM = read('app/dnd/_sheet/components/StreamChat.tsx');
const FORM = read('app/dnd/_sheet/components/FormAbilities.tsx');

describe('spell save DC + spell attack use effective ability (cast + display)', () => {
  it('castSpell derives the mod from effective abilities and folds the ledger spell targets', () => {
    expect(STORE).toContain('abilityMod(abilities[sc.ability])');
    expect(STORE).toContain("ledger.value('spell_save_dc'");
    expect(STORE).toContain("ledger.value('spell_attack'");
    expect(STORE).not.toContain('abilityMod(char.abilities[sc.ability])');
  });
  it('SpellsPanel header derives the mod from effective abilities', () => {
    expect(SPELLS).toContain('abilityMod(abilities[sc.ability])');
    expect(SPELLS).not.toContain('abilityMod(char.abilities[sc.ability])');
    expect(SPELLS).not.toContain('profBonusForLevel'); // now uses the effective pb from the store
  });
});

describe('weapon damage + WIS save + form abilities use effective ability', () => {
  it('rollWeaponDamage uses the effective ability mod', () => {
    expect(STORE).toContain('abilityMod(abilities[abilityKey])');
    expect(STORE).not.toContain('abilityMod(char.abilities[abilityKey])');
  });
  it('StreamChat Resist-the-Chat WIS save uses effective WIS', () => {
    expect(STREAM).toContain('abilityMod(abilities.wis)');
    expect(STREAM).not.toContain('abilityMod(char.abilities.wis)');
  });
  it('FormAbilities DC uses effective STR (folds the form-imposed strength)', () => {
    expect(FORM).toContain('abilityMod(abilities.str)');
    expect(FORM).not.toContain('abilityMod(char.abilities.str)');
  });
});
