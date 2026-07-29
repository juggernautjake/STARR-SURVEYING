// __tests__/dnd/languages.test.ts — 2024 languages + tools (Slice 4).
//
// Bounded lists, so the tests guard accuracy: the Standard/Rare language split, the four tool families,
// and — the connective check — that every tool a Background names actually exists in the tools list
// (specific tools by name, category grants by family phrase). A typo in either file fails here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LANGUAGES_2024,
  TOOLS_2024,
  languagesByRarity,
  toolsByFamily,
  isKnownTool,
} from '@/lib/dnd/languages/dnd5e-2024';
import { BACKGROUNDS_2024 } from '@/lib/dnd/backgrounds/dnd5e-2024';
import { languageCatalogFor, languageNamesFor, pf2BonusLanguageSlots } from '@/lib/dnd/languages';
import { PF2_ANCESTRIES_FULL } from '@/lib/dnd/systems/pathfinder2e/data/ancestries';

describe('2024 languages', () => {
  it('splits into Standard and Rare with the EXACT 2024 PHB membership', () => {
    const std = languagesByRarity('standard').map((l) => l.name).sort();
    const rare = languagesByRarity('rare').map((l) => l.name).sort();
    // Pin the full lists, not just spot-checks — the 2024-specific tells a regression would hit are that
    // Orc is now STANDARD (it was Rare/different in 2014) and Common Sign Language is a new Standard entry.
    expect(std).toEqual([
      'Common', 'Common Sign Language', 'Draconic', 'Dwarvish', 'Elvish',
      'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc',
    ].sort());
    expect(rare).toEqual([
      'Abyssal', 'Celestial', 'Deep Speech', 'Druidic', 'Infernal',
      'Primordial', 'Sylvan', "Thieves' Cant", 'Undercommon',
    ].sort());
    expect(std).not.toContain('Abyssal'); // rarity is exclusive
  });

  it('names are unique, and Primordial carries its four dialects', () => {
    const names = LANGUAGES_2024.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
    const primordial = LANGUAGES_2024.find((l) => l.name === 'Primordial');
    expect(primordial?.dialects).toEqual(['Aquan', 'Auran', 'Ignan', 'Terran']);
  });
});

describe('2024 tools', () => {
  it('cover all four families with unique names', () => {
    const names = TOOLS_2024.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(toolsByFamily('artisan').length).toBeGreaterThanOrEqual(17);
    expect(toolsByFamily('gaming-set').map((t) => t.name)).toContain('Dice Set');
    expect(toolsByFamily('instrument').map((t) => t.name)).toContain('Lute');
    expect(toolsByFamily('other').map((t) => t.name)).toContain("Thieves' Tools");
  });

  it('isKnownTool recognises a specific tool but not a category phrase', () => {
    expect(isKnownTool("Smith's Tools")).toBe(true);
    expect(isKnownTool("one Artisan's Tools of your choice")).toBe(false);
  });
});

// ── The cross-system catalogue (P5-6, audit C-9) ─────────────────────────────────────────────────────
//
// The interesting assertions below are the NEGATIVE ones. It is easy to write a language dispatcher that
// looks complete because every system returns a list; the defect that would cause is 2014 and IG quietly
// serving 2024's list under their own name. So what matters most here is that the systems with no source
// return NOTHING, and say why.

describe('2024 keeps its authored list when asked for by system', () => {
  it('serves it whole', () => {
    const cat = languageCatalogFor('dnd5e-2024');
    expect(cat.catalogued).toBe(true);
    expect(cat.languages).toEqual(LANGUAGES_2024);
    expect(languageNamesFor('dnd5e-2024')).toContain('Common Sign Language');
  });
});

describe('PF2 languages are DERIVED from its ancestries, not authored', () => {
  const cat = languageCatalogFor('pathfinder2e');

  it('is catalogued and non-trivial', () => {
    expect(cat.catalogued).toBe(true);
    expect(cat.languages.length).toBeGreaterThan(5);
  });

  it('every language a real ancestry grants is offered', () => {
    // The derivation's whole claim: nothing an ancestry lists is missing from the picker.
    const granted = new Set(PF2_ANCESTRIES_FULL.flatMap((a) => a.languages ?? []));
    const offered = new Set(languageNamesFor('pathfinder2e'));
    for (const name of granted) {
      expect(offered.has(name), `"${name}" is granted by an ancestry but not offered`).toBe(true);
    }
  });

  it('and nothing is offered that no ancestry grants', () => {
    // The other direction, which is what stops someone quietly hand-adding entries to a DERIVED list. If PF2
    // needs a language no ancestry grants, it needs a real source and its own file — not an append here.
    const granted = new Set(PF2_ANCESTRIES_FULL.flatMap((a) => a.languages ?? []));
    for (const l of cat.languages) {
      expect(granted.has(l.name), `"${l.name}" is offered but no ancestry grants it — invented?`).toBe(true);
    }
  });

  it('names the ancestries each language came from, so the derivation is auditable', () => {
    expect(cat.languages.find((l) => l.name === 'Dwarven')?.origin).toContain('Dwarf');
    // Common comes from nearly every ancestry, so it should list several.
    expect(cat.languages.find((l) => l.name === 'Common')?.origin.split(',').length).toBeGreaterThan(3);
  });

  it('is sorted, and free of duplicates and blanks', () => {
    const names = cat.languages.map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.trim().length > 0)).toBe(true);
  });
});

describe('the systems with no sourced list say so instead of borrowing one', () => {
  it('2014 does NOT get the 2024 list', () => {
    // THE point of this block, and the two `languagesByRarity` pins above are what make the risk concrete:
    // 2024 made Orc standard, ADDED Common Sign Language, and counts Druidic and Thieves' Cant as
    // languages where 2014 treats them as class features. Serving 2024's list to a 2014 character would put
    // wrong entries in the picker and look entirely plausible doing it.
    const cat = languageCatalogFor('dnd5e-2014');
    expect(cat.catalogued).toBe(false);
    expect(cat.languages).toEqual([]);
    expect(languageNamesFor('dnd5e-2014')).not.toContain('Common Sign Language');
  });

  it('and the 2014 note explains the refusal well enough that nobody "fixes" it', () => {
    const note = languageCatalogFor('dnd5e-2014').note;
    expect(note).toMatch(/Common Sign Language/);
    expect(note).toMatch(/Druidic/);
  });

  it('IG has no list either, and is honest about it', () => {
    const cat = languageCatalogFor('intuitive-games');
    expect(cat.catalogued).toBe(false);
    expect(cat.languages).toEqual([]);
    expect(cat.note).toMatch(/free text/i);
  });

  it('an unknown or missing system degrades to the same honest empty', () => {
    for (const s of [null, undefined, 'nonsense' as never]) {
      const cat = languageCatalogFor(s);
      expect(cat.languages).toEqual([]);
      expect(cat.note.length).toBeGreaterThan(20);
    }
  });
});

describe('PF2 bonus language slots follow Intelligence', () => {
  it('a positive modifier grants that many', () => {
    expect(pf2BonusLanguageSlots(3)).toBe(3);
    expect(pf2BonusLanguageSlots(1)).toBe(1);
  });

  it('and a negative one takes none away', () => {
    // "additional languages equal to a POSITIVE Intelligence modifier" — a penalty does not remove the
    // languages your ancestry already granted.
    expect(pf2BonusLanguageSlots(0)).toBe(0);
    expect(pf2BonusLanguageSlots(-2)).toBe(0);
  });
});

describe('the PF2 builder actually SENDS languages (the C-9 gap itself)', () => {
  // The gap was never missing support. `parsePF2Picks` parsed `picks.languages` and `assemblePF2VanillaCharacter`
  // unioned them over the ancestry's — the whole server path worked. The FORM just never put the field in its
  // POST body, so the feature was unreachable. That is this repo's signature defect, and a unit test of the
  // builder function would have passed happily throughout. So this asserts the wire, not the logic.
  const builder = readFileSync(join(process.cwd(), 'app/dnd/_ui/PF2CharacterBuilder.tsx'), 'utf8');

  it('puts languages in the picks it POSTs', () => {
    expect(builder).toMatch(/picks: \{[^}]*\blanguages\b[^}]*\}/);
  });

  it('offers them from the shared catalogue rather than a second hand-written list', () => {
    expect(builder).toContain("languageNamesFor('pathfinder2e')");
    expect(builder).toContain('pf2BonusLanguageSlots');
  });

  it('and renders the picker in BOTH layouts', () => {
    // The builder has a `panel` layout (sheet page) and a `steps` layout (the /builder wizard) driven by the
    // same state. A block added to only one is half-wired — which is exactly how a door goes missing.
    expect(builder.match(/\{languagesBlock\}/g)?.length, 'panel + steps').toBeGreaterThanOrEqual(2);
  });

  it('does not post the ancestry-granted languages, only the extra picks', () => {
    // The builder unions the ancestry's own languages in server-side. If the form posted them too they would
    // go stale the moment the ancestry data changed, and nothing would notice.
    expect(builder).toContain('const grantedLanguages = anc?.languages ?? []');
    expect(builder).toMatch(/languageChoices = languageNamesFor\('pathfinder2e'\)\.filter\(\(l\) => !grantedLanguages\.includes\(l\)\)/);
  });

  it('and the server still parses the field the form now sends', () => {
    // Both ends pinned together: if either is "cleaned up" alone, this fails rather than the feature quietly
    // going dead again.
    expect(readFileSync(join(process.cwd(), 'lib/dnd/systems/pathfinder2e/ai.ts'), 'utf8'))
      .toContain('languages: strArr(p.languages)');
    expect(readFileSync(join(process.cwd(), 'lib/dnd/systems/pathfinder2e/builder.ts'), 'utf8'))
      .toContain('...(picks.languages ?? [])');
  });
});

describe('every background tool proficiency resolves', () => {
  // A category-grant phrase names a family; a specific grant names a tool. Both must be legitimate.
  const CATEGORY = ["Artisan's Tools", 'Gaming Set', 'Musical Instrument'];
  it('is either a known specific tool or a known category phrase', () => {
    for (const bg of BACKGROUNDS_2024) {
      const tp = bg.toolProficiency;
      const ok = isKnownTool(tp) || CATEGORY.some((c) => tp.includes(c));
      expect(ok, `${bg.name}: "${tp}" is not a known tool or category`).toBe(true);
    }
  });
});
