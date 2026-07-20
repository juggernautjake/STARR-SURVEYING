// __tests__/dnd/spell-picker.test.ts — adding a catalogued spell to a sheet.
// The conversion is the load-bearing part: a dropped field means a sheet spell that looks
// right but is missing its range or concentration flag.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spellFromCatalog } from '@/app/dnd/_sheet/components/ui/SpellPicker';
import { findSpell2024 } from '@/lib/dnd/spells/dnd5e-2024';

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
