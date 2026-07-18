// __tests__/dnd/languages.test.ts — 2024 languages + tools (Slice 4).
//
// Bounded lists, so the tests guard accuracy: the Standard/Rare language split, the four tool families,
// and — the connective check — that every tool a Background names actually exists in the tools list
// (specific tools by name, category grants by family phrase). A typo in either file fails here.
import { describe, it, expect } from 'vitest';
import {
  LANGUAGES_2024,
  TOOLS_2024,
  languagesByRarity,
  toolsByFamily,
  isKnownTool,
} from '@/lib/dnd/languages/dnd5e-2024';
import { BACKGROUNDS_2024 } from '@/lib/dnd/backgrounds/dnd5e-2024';

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
