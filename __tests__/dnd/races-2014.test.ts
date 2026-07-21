// __tests__/dnd/races-2014.test.ts — the 2014 race catalog, and the edition line it defends.
//
// The bug this file exists to make impossible: until 14-S7, `speciesView('dnd5e-2014', 'Dwarf')` fell
// through to the `custom` arm and returned a NAME WITH NO TRAITS. No darkvision, no 25-foot speed, no
// Constitution +2 — the panel read as though the player had invented "Dwarf", while the same call for
// 2024 returned a full trait block. So the first thing asserted here is that a 2014 character gets
// 2014 traits: not 2024's, not empty.
//
// The second is the headline edition rule, asserted in BOTH directions, because a one-directional
// assertion would still pass if the two catalogs were merged: 2014 races grant ability score
// increases, and 2024 species still grant none.
import { describe, it, expect } from 'vitest';
import {
  RACES_2014, RACES_2014_STATUS, findRace2014, resolveRace2014,
  raceAbilityIncreases2014, raceTraits2014,
} from '@/lib/dnd/species/dnd5e-2014';
import { speciesView, speciesCatalogFor, speciesCoverage } from '@/lib/dnd/species/view';
import { SPECIES_2024 } from '@/lib/dnd/species/dnd5e-2024';
import { race2014Effects } from '@/lib/dnd/species/apply';

const D2014 = 'dnd5e-2014';
const D2024 = 'dnd5e-2024';

describe('the 2014 race catalog', () => {
  it('holds the nine SRD 5.1 races, including the two 2024 removed', () => {
    expect(RACES_2014).toHaveLength(9);
    const names = RACES_2014.map((r) => r.name);
    for (const n of ['Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Half-Elf', 'Half-Orc', 'Halfling', 'Human', 'Tiefling']) {
      expect(names).toContain(n);
    }
    // Half-Elf and Half-Orc are the tell: 2024 removed both as standalone species, so their presence
    // here proves this is a 2014 list rather than a copy of the 2024 one under a different name.
    expect(SPECIES_2024.map((s) => s.name)).not.toContain('Half-Elf');
    expect(SPECIES_2024.map((s) => s.name)).not.toContain('Half-Orc');
  });

  it('every race is 2014-stamped, sourced, and structurally complete', () => {
    for (const r of RACES_2014) {
      expect(r.system, r.name).toBe('dnd5e-2014');
      expect(['SRD 5.1', 'Basic Rules 2014'], r.name).toContain(r.source);
      expect(r.key, r.name).toMatch(/^[a-z-]+$/);
      expect(r.speed, r.name).toBeGreaterThan(0);
      expect(r.languages.length, r.name).toBeGreaterThan(0);
      for (const s of r.subraces ?? []) {
        expect(s.abilityIncreases.length, s.name).toBeGreaterThan(0);
        expect(s.traits.length, s.name).toBeGreaterThan(0);
      }
    }
  });

  it('keys are unique across races and subraces', () => {
    const keys = [...RACES_2014.map((r) => r.key), ...RACES_2014.flatMap((r) => (r.subraces ?? []).map((s) => s.key))];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE headline edition difference — asserted from both sides.
// ─────────────────────────────────────────────────────────────────────────────

describe('ability score increases: 2014 races grant them, 2024 species do not', () => {
  it('EVERY 2014 race grants at least one ability score increase', () => {
    for (const r of RACES_2014) {
      expect(r.abilityIncreases.length, `${r.name} must grant a racial ability increase`).toBeGreaterThan(0);
      for (const inc of r.abilityIncreases) expect(inc.amount, r.name).toBeGreaterThan(0);
    }
  });

  it('the specific numbers are 2014\'s, not 2024\'s', () => {
    expect(raceAbilityIncreases2014(resolveRace2014('Dwarf')!)).toEqual({ con: 2 });
    expect(raceAbilityIncreases2014(resolveRace2014('Elf')!)).toEqual({ dex: 2 });
    expect(raceAbilityIncreases2014(resolveRace2014('Half-Orc')!)).toEqual({ str: 2, con: 1 });
    expect(raceAbilityIncreases2014(resolveRace2014('Tiefling')!)).toEqual({ int: 1, cha: 2 });
    // The 2014 Human is +1 to all six and nothing else.
    expect(raceAbilityIncreases2014(resolveRace2014('Human')!))
      .toEqual({ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 });
  });

  it('a subrace STACKS its own increase on the parent race\'s', () => {
    // The trap: reading `race.abilityIncreases` alone silently drops the Hill Dwarf's Wisdom +1.
    expect(raceAbilityIncreases2014(resolveRace2014('Hill Dwarf')!)).toEqual({ con: 2, wis: 1 });
    expect(raceAbilityIncreases2014(resolveRace2014('High Elf')!)).toEqual({ dex: 2, int: 1 });
    expect(raceAbilityIncreases2014(resolveRace2014('Rock Gnome')!)).toEqual({ int: 2, con: 1 });
    expect(raceAbilityIncreases2014(resolveRace2014('Lightfoot Halfling')!)).toEqual({ dex: 2, cha: 1 });
  });

  it('the 2024 side still grants NONE, under any field name', () => {
    // The other half of the invariant. If this ever fails, the two catalogs have been merged and the
    // 2014 data has leaked into 2024 — which is how the rule gets flattened.
    for (const sp of SPECIES_2024) {
      const json = JSON.stringify(sp).toLowerCase();
      expect(json, `${sp.name} must not carry an ability increase`).not.toMatch(/abilit(y|ies)increase/);
      expect(json, sp.name).not.toContain('abilityscores');
    }
    expect(speciesCoverage(D2024).grantsAbilityIncreases).toBe(false);
    expect(speciesCoverage(D2014).grantsAbilityIncreases).toBe(true);
  });

  it('the Half-Elf\'s free-choice increase is DESCRIBED, never chosen for the player', () => {
    const halfElf = findRace2014('half-elf')!;
    expect(halfElf.abilityChoice).toBeDefined();
    expect(halfElf.abilityChoice!.count).toBe(2);
    expect(halfElf.abilityChoice!.excluding).toContain('cha');
    // The summed increases contain only the FIXED part — the chosen +1s are not invented.
    expect(raceAbilityIncreases2014({ race: halfElf })).toEqual({ cha: 2 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The dispatcher: a 2014 character gets 2014 data.
// ─────────────────────────────────────────────────────────────────────────────

describe('speciesView serves a 2014 character 2014 data', () => {
  it('resolves a 2014 Dwarf with real traits — not empty, not 2024\'s', () => {
    const v = speciesView(D2014, 'Dwarf')!;
    expect(v.source).toBe('vanilla');
    expect(v.noun).toBe('Species');
    expect(v.traits.length).toBeGreaterThan(1);
    // 2014's dwarf numbers, which differ from 2024's on both counts.
    expect(v.speed).toBe(25);
    expect(v.senses).toEqual(['Darkvision 60 ft']);
    const v2024 = speciesView(D2024, 'Dwarf')!;
    expect(v2024.speed).toBe(30);
    expect(v2024.senses).toEqual(['Darkvision 120 ft']);
  });

  it('surfaces the racial ability increase both structurally and as a readable line', () => {
    const v = speciesView(D2014, 'Dwarf')!;
    // Structured, for any future UI…
    expect(v.abilityIncreases).toEqual({ con: 2 });
    // …and as the leading trait line, so the existing panel shows it with no UI change. Without
    // this, the edition's headline rule would be invisible on the sheet that most needs it.
    expect(v.traits[0].name).toBe('Ability Score Increase');
    expect(v.traits[0].text).toContain('CON +2');
    // The 2024 view must NOT carry one.
    expect(speciesView(D2024, 'Dwarf')!.abilityIncreases).toBeUndefined();
  });

  it('resolves a SUBRACE name and merges parent traits with the subrace\'s', () => {
    const v = speciesView(D2014, 'Hill Dwarf')!;
    expect(v.name).toBe('Hill Dwarf');
    expect(v.abilityIncreases).toEqual({ con: 2, wis: 1 });
    const names = v.traits.map((t) => t.name);
    expect(names).toContain('Stonecunning');        // from the parent Dwarf
    expect(names).toContain('Dwarven Toughness');   // from the Hill Dwarf subrace
    expect(v.speed).toBe(25);                       // parent's speed still applies
  });

  it('offers the subraces as heritages and the languages the race grants', () => {
    const elf = speciesView(D2014, 'Elf')!;
    expect(elf.heritages).toEqual(['High Elf']);
    expect(elf.languages).toEqual(['Common', 'Elvish']);
    // Free language picks are appended as their own phrased line rather than faked as a language.
    expect(speciesView(D2014, 'Human')!.languages).toEqual(['Common', 'One extra language of your choice.']);
  });

  it('a 2024-only species does not resolve on a 2014 sheet, and vice-versa', () => {
    // Ground Rule 1 from both sides. Goliath/Aasimar/Orc are 2024 additions…
    for (const n of ['Goliath', 'Aasimar', 'Orc']) {
      expect(speciesView(D2014, n)!.source, n).toBe('custom');
      expect(speciesView(D2014, n)!.traits, n).toEqual([]);
    }
    // …and Half-Elf/Half-Orc are 2014-only.
    for (const n of ['Half-Elf', 'Half-Orc']) {
      expect(speciesView(D2024, n)!.source, n).toBe('custom');
    }
  });

  it('still degrades a genuinely homebrew 2014 lineage to a name-only view', () => {
    const v = speciesView(D2014, 'Crystalborn')!;
    expect(v.source).toBe('custom');
    expect(v.traits).toEqual([]);
    expect(v.abilityIncreases).toBeUndefined();
  });

  it('the catalog dispatcher lists each edition\'s own lineages and nothing else', () => {
    expect(speciesCatalogFor(D2014)).toHaveLength(9);
    expect(speciesCatalogFor(D2024)).toHaveLength(SPECIES_2024.length);
    expect(speciesCatalogFor('pathfinder2e')).toEqual([]);
    expect(speciesCatalogFor('intuitive-games')).toEqual([]);
    expect(speciesCatalogFor(null)).toEqual([]);
    expect(speciesCatalogFor(undefined)).toEqual([]);
    // Every entry resolved as vanilla — a catalog listing entries it cannot resolve would be a lie.
    expect(speciesCatalogFor(D2014).every((v) => v.source === 'vanilla')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The numbers are LIVE, not just catalogued (14-S6d: "computing").
// ─────────────────────────────────────────────────────────────────────────────

describe('race2014Effects — the ledger overlay', () => {
  it('emits size, darkvision and a DIFFERING speed', () => {
    const dwarf = resolveRace2014('Dwarf')!;
    const effs = race2014Effects(dwarf, 30);
    expect(effs).toContainEqual({ target: 'size', operation: 'set', value: 'Medium' });
    expect(effs).toContainEqual({ target: 'grant_sense', operation: 'set', value: 'Darkvision 60 ft.' });
    // 25 ≠ the sheet's stored 30, so the speed override is real and must be applied.
    expect(effs).toContainEqual({ target: 'speed_walk', operation: 'set', value: 25 });
  });

  it('does NOT emit a no-op speed for a 30-foot race', () => {
    // A no-op contribution would light a permanent "modified" star on an unmodified sheet.
    expect(race2014Effects(resolveRace2014('Human')!, 30).some((e) => e.target === 'speed_walk')).toBe(false);
  });

  it('emits no sense for a race that genuinely has no darkvision', () => {
    // The 2014 Dragonborn has none — 2024's has 60 feet. Absence here is data, not a gap.
    expect(race2014Effects(resolveRace2014('Dragonborn')!).some((e) => e.target === 'grant_sense')).toBe(false);
    expect(race2014Effects(resolveRace2014('Halfling')!).some((e) => e.target === 'grant_sense')).toBe(false);
  });

  it('deliberately emits NO ability score increases', () => {
    // Documented decision, pinned so it cannot be "fixed" into a silent double-count: 2014 character
    // creation folds the racial bonus into the score the player writes down, so adding it again in
    // the ledger would inflate every existing 2014 character. See race2014Effects' doc comment.
    for (const r of RACES_2014) {
      const effs = race2014Effects({ race: r });
      expect(effs.some((e) => e.target.startsWith('ability_')), r.name).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sourcing discipline and honest coverage.
// ─────────────────────────────────────────────────────────────────────────────

describe('sourcing and coverage are honest', () => {
  it('no trait text exceeds the 320-character house limit (the copyright guard)', () => {
    const all = RACES_2014.flatMap((r) => raceTraits2014({ race: r, subrace: undefined })
      .concat((r.subraces ?? []).flatMap((s) => s.traits)));
    expect(all.length).toBeGreaterThan(20); // guards the guard: an empty sweep proves nothing
    for (const t of all) {
      expect(t.text.length, `${t.name} is ${t.text.length} chars — paraphrase, do not transcribe`).toBeLessThanOrEqual(320);
      expect(t.text.length, `${t.name} has no text`).toBeGreaterThan(0);
    }
  });

  it('reports coverage without claiming completeness it lacks', () => {
    expect(RACES_2014_STATUS.totalRaces).toBe(9);
    expect(RACES_2014_STATUS.totalSubraces).toBe(4);
    // Complete for our SOURCES, openly incomplete for the EDITION — the distinction the whole
    // sourcing policy rests on. A catalog claiming both would be claiming the PHB subraces.
    expect(RACES_2014_STATUS.completeForSources).toBe(true);
    expect(RACES_2014_STATUS.completeForEdition).toBe(false);
    expect(RACES_2014_STATUS.missingCategories.length).toBeGreaterThan(0);
    expect(speciesCoverage(D2014).completeForEdition).toBe(false);
    expect(speciesCoverage('a-made-up-system').total).toBe(0);
  });

  it('exactly four races carry a subrace, and they are the four SRD 5.1 carries', () => {
    const withSub = RACES_2014.filter((r) => (r.subraces?.length ?? 0) > 0).map((r) => r.name).sort();
    expect(withSub).toEqual(['Dwarf', 'Elf', 'Gnome', 'Halfling']);
    // The PHB's other subraces are absent ON PURPOSE (not in SRD 5.1 / the Basic Rules). Named here
    // so nobody "restores" them from memory — that would be inventing rules for a player.
    const allSubNames = RACES_2014.flatMap((r) => (r.subraces ?? []).map((s) => s.name));
    for (const phbOnly of ['Mountain Dwarf', 'Wood Elf', 'Drow', 'Stout Halfling', 'Forest Gnome']) {
      expect(allSubNames, `${phbOnly} is PHB-only and must not be invented`).not.toContain(phbOnly);
    }
  });

  it('every editionNote names a difference we can actually check, and none is empty', () => {
    // 14-S5's rule: populate only where the difference is confirmed. Each 2014 race here has a
    // confirmable counterpart (or a confirmable ABSENCE, for Half-Elf/Half-Orc), so all nine carry a
    // note — but the note must say something, not merely exist.
    for (const r of RACES_2014) {
      expect(r.editionNote, r.name).toBeTruthy();
      expect(r.editionNote!.length, r.name).toBeGreaterThan(80);
      expect(r.editionNote, r.name).toMatch(/2024/);
    }
    // Spot-check the two whose 2024 counterpart does not exist — the note must say so rather than
    // invent a comparison.
    expect(findRace2014('half-elf')!.editionNote).toMatch(/no 2024 counterpart|NO Half-Elf/i);
    expect(findRace2014('half-orc')!.editionNote).toMatch(/removed it/i);
  });

  it('resolveRace2014 handles the miss cases without guessing', () => {
    expect(resolveRace2014('nope')).toBeUndefined();
    expect(resolveRace2014('')).toBeUndefined();
    expect(resolveRace2014(null)).toBeUndefined();
    expect(resolveRace2014(undefined)).toBeUndefined();
    // Case- and whitespace-insensitive, because the sheet stores free text.
    expect(resolveRace2014('  hill DWARF ')?.subrace?.key).toBe('hill-dwarf');
    expect(findRace2014('DWARF')?.key).toBe('dwarf');
  });
});
