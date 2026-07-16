// __tests__/dnd/system-intuitive-games.test.ts — the Intuitive Games system is a first-class,
// self-consistent, non-cross-contaminated catalog entry (intuitivegames.net rules as mechanical facts).
import { describe, it, expect } from 'vitest';
import { rulesForSystem, systemRulesBlock, systemClassNames, systemSpecies } from '@/lib/dnd/system-rules';
import { validateCharacterForSystem } from '@/lib/dnd/system-validate';
import { systemRulesEntries } from '@/lib/dnd/system-rules-entries';
import { GAME_SYSTEMS } from '@/lib/dnd/systems';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const KEY = 'intuitive-games';

describe('Intuitive Games system', () => {
  it('is registered and carries its own core mechanics', () => {
    expect(GAME_SYSTEMS.some((s) => s.key === KEY)).toBe(true);
    const r = rulesForSystem(KEY)!;
    expect(r.levelMin).toBe(1);
    expect(r.levelMax).toBe(10);           // its own level range
    expect(r.profBonusByLevel).toBeNull(); // level-as-proficiency, no flat table
    const b = systemRulesBlock(KEY);
    expect(b).toMatch(/DEGREES OF SUCCESS/);
    expect(b).toMatch(/THREE actions/);
    expect(b).toMatch(/Fortitude, Reflex, Will/);
    expect(b).toMatch(/Levels: 1–10/);
  });

  it('exposes its own ancestries, classes (incl. name-only), and skills', () => {
    expect(systemSpecies(KEY)).toEqual(expect.arrayContaining(['Leshonki', 'Migoi', 'Naga', 'Sprite']));
    const classes = systemClassNames(KEY);
    expect(classes).toEqual(expect.arrayContaining(['Wizard', 'Archon', 'Freebooter', 'Sohei'])); // the 13 classes from the template's Class List
    expect(classes).not.toContain('Witch');   // Witch is a SUBCLASS, not a class (template's Subclass List)
    const b = systemRulesBlock(KEY);
    expect(b).toMatch(/Ancestry mechanics:/);       // per-ancestry notes rendered
    expect(b).toMatch(/Sleight of Hand \(DEX\)/);   // its skill list
  });

  it('validation accepts an Intuitive Games build and flags a foreign one', () => {
    const c = blankCharacter('Kra'); c.meta.level = 6; c.meta.className = 'Freebooter'; c.meta.species = 'Migoi';
    expect(validateCharacterForSystem(c, KEY)).toEqual([]); // native class + ancestry + in-range level
    // A D&D species/class on an Intuitive Games sheet is flagged.
    const d = blankCharacter('Mix'); d.meta.className = 'Warlock'; d.meta.species = 'Tiefling'; d.meta.level = 6;
    const v = validateCharacterForSystem(d, KEY);
    expect(v.some((x) => x.field === 'meta.className')).toBe(true);
    expect(v.some((x) => x.field === 'meta.species')).toBe(true);
    // And an Intuitive Games ancestry is (correctly) foreign to D&D.
    const e = blankCharacter('X'); e.meta.species = 'Leshonki'; e.meta.level = 3;
    expect(validateCharacterForSystem(e, 'dnd5e-2014').some((x) => x.field === 'meta.species')).toBe(true);
    // Level 11 is out of range for Intuitive Games (1–10).
    const f = blankCharacter('Hi'); f.meta.level = 11;
    expect(validateCharacterForSystem(f, KEY).some((x) => x.field === 'meta.level')).toBe(true);
  });

  it('projects real store entries with its ancestry notes and full class list', () => {
    const entries = systemRulesEntries(KEY);
    const classNames = new Set(entries.filter((e) => e.kind === 'class').map((e) => e.name));
    for (const n of systemClassNames(KEY)) expect(classNames.has(n), n).toBe(true); // every class named
    const speciesEntries = entries.filter((e) => e.kind === 'species');
    expect(speciesEntries.some((e) => e.name === 'Naga')).toBe(true); // per-ancestry note entry
  });
});
