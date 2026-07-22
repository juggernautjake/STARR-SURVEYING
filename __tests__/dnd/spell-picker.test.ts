// __tests__/dnd/spell-picker.test.ts — adding a catalogued spell to a sheet.
// The conversion is the load-bearing part: a dropped field means a sheet spell that looks
// right but is missing its range or concentration flag.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spellFromCatalog } from '@/app/dnd/_sheet/components/ui/SpellPicker';
import { findSpell2024, SPELLS_2024 } from '@/lib/dnd/spells/dnd5e-2024';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('spellFromCatalog', () => {
  it('carries every mechanical field onto the sheet spell', () => {
    const def = findSpell2024('fireball')!;
    const s = spellFromCatalog(def, 0);
    expect(s.name).toBe('Fireball');
    expect(s.level).toBe(3);
    expect(s.school).toBe('Evocation');
    expect(s.castTime).toBe('1 action');
    expect(s.range).toBe('150 feet');
    expect(s.duration).toBe('Instantaneous');
    expect(s.description).toContain('8d6');
    expect(s.higher).toContain('1d6');
  });

  it('folds the material component into the components string', () => {
    // The sheet has one `components` field, so "V, S, M" alone would lose what the M is.
    const s = spellFromCatalog(findSpell2024('fireball')!, 0);
    expect(s.components).toContain('V, S, M');
    expect(s.components).toContain('guano');
  });

  it('leaves components clean when there is no material', () => {
    const s = spellFromCatalog(findSpell2024('misty-step')!, 0);
    expect(s.components).toBe('V');
  });

  it('preserves concentration and ritual flags', () => {
    expect(spellFromCatalog(findSpell2024('hunters-mark')!, 0).concentration).toBe(true);
    expect(spellFromCatalog(findSpell2024('detect-magic')!, 0).ritual).toBe(true);
    // A spell with neither must not claim them.
    expect(spellFromCatalog(findSpell2024('magic-missile')!, 0).concentration).toBeUndefined();
  });

  it('starts unprepared — adding a spell is not the same as preparing it', () => {
    expect(spellFromCatalog(findSpell2024('bless')!, 0).prepared).toBe(false);
  });

  it('gives each copy a distinct id so a second copy cannot collide', () => {
    const def = findSpell2024('fireball')!;
    expect(spellFromCatalog(def, 0).id).not.toBe(spellFromCatalog(def, 1).id);
  });
});

describe('the picker is system-scoped and honest', () => {
  const src = read('app/dnd/_sheet/components/ui/SpellPicker.tsx');

  it('reads the catalog through the system dispatcher, not the 2024 module directly', () => {
    // Importing dnd5e-2024 here would serve 2024 spells to a 2014 or PF2 sheet.
    expect(src).toContain("from '@/lib/dnd/spells'");
    expect(src).not.toContain('dnd5e-2024');
    expect(src).toContain('spellsForSystem(system)');
  });

  it('shows an honest empty state instead of another edition’s spells', () => {
    expect(src).toContain('No spell library for this game system yet');
  });

  it('tells the reader the catalog is partial', () => {
    // So a missing spell reads as "not catalogued", not "does not exist".
    expect(src).toContain('not the full list yet');
    expect(src).toContain('status.complete');
  });

  it('flags a spell already on the sheet rather than silently duplicating it', () => {
    expect(src).toContain('already');
  });
});

// Owner 2026-07-19: "make sure we can roll for them ... and they use the character's stats."
// The prose summary is for reading; these structured fields are what the sheet rolls from.
// The attack bonus and save DC are deliberately NOT copied onto the spell — the sheet derives
// them from the character, so the same catalogued spell scales with whoever holds it.
describe('a catalogued spell arrives rollable', () => {
  it('carries damage dice for an attack-roll spell', () => {
    const s = spellFromCatalog(findSpell2024('fire-bolt')!, 0);
    expect(s.attack).toBe(true);
    expect(s.damage).toEqual([{ dice: '1d10', type: 'fire' }]);
  });

  it('carries the saving throw and what a success does', () => {
    const s = spellFromCatalog(findSpell2024('fireball')!, 0);
    expect(s.save?.ability).toBe('dex');
    expect(s.save?.effect).toContain('half');
    expect(s.damage).toEqual([{ dice: '8d6', type: 'fire' }]);
    expect(s.attack).toBeUndefined(); // save spells never make an attack roll
  });

  it('carries healing dice', () => {
    expect(spellFromCatalog(findSpell2024('cure-wounds')!, 0).heal).toBe('2d8');
    expect(spellFromCatalog(findSpell2024('healing-word')!, 0).heal).toBe('2d4');
  });

  it('does NOT bake in an attack bonus or save DC', () => {
    // Those come from the character. Copying them would freeze a spell to the stats of
    // whoever added it — the bug this separation exists to prevent.
    const s = spellFromCatalog(findSpell2024('guiding-bolt')!, 0) as unknown as Record<string, unknown>;
    expect(s.attackBonus).toBeUndefined();
    expect(s.saveDc).toBeUndefined();
    expect(s.dc).toBeUndefined();
  });

  it('uses the sheet’s own ability casing so the save resolves', () => {
    // AbilityKey is lowercase; an uppercase 'DEX' would silently fail to match.
    for (const key of ['fireball', 'sacred-flame', 'toll-the-dead']) {
      const s = spellFromCatalog(findSpell2024(key)!, 0);
      if (s.save) expect(['str', 'dex', 'con', 'int', 'wis', 'cha']).toContain(s.save.ability);
    }
  });

  it('leaves a utility spell without roll data rather than inventing dice', () => {
    const s = spellFromCatalog(findSpell2024('misty-step')!, 0);
    expect(s.damage).toBeUndefined();
    expect(s.attack).toBeUndefined();
    expect(s.save).toBeUndefined();
  });
});

describe('the catalog’s roll data is internally consistent', () => {
  it('no spell both makes an attack roll and forces a save', () => {
    for (const sp of SPELLS_2024) {
      if (sp.attack && sp.save) throw new Error(`${sp.key} has both attack and save`);
    }
  });

  it('every damage entry has dice and a type', () => {
    for (const sp of SPELLS_2024) {
      for (const dmg of sp.damage ?? []) {
        expect(dmg.dice, sp.key).toMatch(/^\d+d\d+$/);
        expect(dmg.type.length, sp.key).toBeGreaterThan(0);
      }
    }
  });

  it('a healing spell deals no damage', () => {
    for (const sp of SPELLS_2024) {
      if (sp.heal) expect(sp.damage, sp.key).toBeUndefined();
    }
  });
});

// Section RELEVANCE (D-12, owner 2026-07-22): a martial with NO spells must not get a Spells tab on any
// template (reduce class-irrelevant clutter). The Spells tab is therefore DATA-gated — it appears for a
// caster (a spellcasting ability / slots) or anyone who actually has spells; a Barbarian/Rogue with none
// does not. Spells are added to a non-caster via the Build Kit / library / AI edit (which sets the data),
// and the section then appears to manage them.
describe('the Spells tab is DATA-gated, not shown to every editor (D-12)', () => {
  it('App gates Spells on hasSpellcasting (a caster or having spells), NOT on canWrite', () => {
    const app = read('app/dnd/_sheet/App.tsx');
    expect(app).toContain("(t.id !== 'spells' || hasSpellcasting)");
    expect(app).not.toContain('hasSpellcasting || canWrite');
  });

  it('the shared panel set (Codex/Dashboard/Play) uses the same data gate', () => {
    const five = read('app/dnd/_sheet/panels/fivePanels.tsx');
    expect(five).toContain('when: hasSpellcasting');
    expect(five).not.toContain('hasSpellcasting || canWrite');
  });

  it('hasSpellcasting still counts a spellcasting ability, slots, or existing spells', () => {
    const app = read('app/dnd/_sheet/App.tsx');
    expect(app).toContain('char.spellcasting?.ability');
    expect(app).toContain('char.spells?.length');
  });
});

describe('spells are clickable and readable in full', () => {
  const panel = read('app/dnd/_sheet/components/SpellsPanel.tsx');
  const detail = read('app/dnd/_sheet/components/ui/SpellDetail.tsx');

  it('the spell name opens the detail view', () => {
    expect(panel).toContain('setViewing(s)');
    expect(panel).toContain('<SpellDetail');
  });

  it('the detail resolves numbers against the character, not the spell record', () => {
    expect(detail).toContain('spellSaveDc');
    expect(detail).toContain("ledger.value('spell_attack'");
  });

  it('the detail enriches from the library for material, classes and edition notes', () => {
    expect(detail).toContain('findSpellForSystem');
    expect(detail).toContain('editionNote');
  });

  it('the AI ask passes the character so it can answer situationally', () => {
    expect(detail).toContain('/api/dnd/library/chat');
    expect(detail).toContain('characterId');
  });
});

describe('class and level targeting', () => {
  const picker = read('app/dnd/_sheet/components/ui/SpellPicker.tsx');

  it('defaults to the character’s own class list', () => {
    expect(picker).toContain('onlyMyClass');
    expect(picker).toContain('char.meta.className');
  });

  it('blocks off-curve spells for a vanilla character and flags them for a custom one', () => {
    // This REPLACES an earlier assertion that the picker only ever warned. That behaviour was
    // justified on the grounds that subclasses, feats, scrolls and the DM all legitimately grant
    // off-curve spells — true for the DM grant path, and wrong for a player building a vanilla
    // character, who could add Wish at level 4 (owner 2026-07-20). The legitimate exceptions are
    // now modelled as rules (`extraSpells`) instead of being an excuse to enforce nothing.
    expect(picker).toContain('off-rules');
    expect(picker).toContain('not available');
    expect(picker).toContain('disabled={blocked}');
    // The DM keeps their override.
    expect(picker).toContain('&& !isDM');
  });

  it('derives the castable ceiling from the character’s own slots', () => {
    expect(picker).toContain('maxCastable');
    expect(picker).toContain('char.spellcasting');
  });

  it('tells the DM they are granting, and that off-curve is deliberate', () => {
    expect(picker).toContain('Grant a spell to');
    expect(picker).toContain('isDM');
  });
});
