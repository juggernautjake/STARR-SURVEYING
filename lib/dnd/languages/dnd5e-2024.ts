// lib/dnd/languages/dnd5e-2024.ts — 2024 languages and tool proficiencies as lists (Slice 4).
//
// The plainest content in character creation, but the builder still needs it as DATA so a language or
// tool choice is a pick from a real list, not free text. Kept as flat, rules-accurate lists with the
// PHB's Standard/Rare split for languages and the four tool families (Artisan's Tools, Gaming Sets,
// Musical Instruments, and the standalone kits). `languages.test.ts` cross-checks that every tool a
// background names actually exists here — so a typo in either file surfaces as a failing test.

export type LanguageRarity = 'standard' | 'rare';

export interface Language {
  name: string;
  rarity: LanguageRarity;
  /** Origin/typical speakers, for flavour in the picker. */
  origin: string;
  /** Sub-dialects, e.g. Primordial → Aquan/Auran/Ignan/Terran. */
  dialects?: string[];
}

export const LANGUAGES_2024: Language[] = [
  { name: 'Common', rarity: 'standard', origin: 'Most humanoids' },
  { name: 'Common Sign Language', rarity: 'standard', origin: 'Most humanoids' },
  { name: 'Draconic', rarity: 'standard', origin: 'Dragons, dragonborn' },
  { name: 'Dwarvish', rarity: 'standard', origin: 'Dwarves' },
  { name: 'Elvish', rarity: 'standard', origin: 'Elves' },
  { name: 'Giant', rarity: 'standard', origin: 'Giants, goliaths' },
  { name: 'Gnomish', rarity: 'standard', origin: 'Gnomes' },
  { name: 'Goblin', rarity: 'standard', origin: 'Goblinoids' },
  { name: 'Halfling', rarity: 'standard', origin: 'Halflings' },
  { name: 'Orc', rarity: 'standard', origin: 'Orcs' },
  { name: 'Abyssal', rarity: 'rare', origin: 'Demons of the Abyss' },
  { name: 'Celestial', rarity: 'rare', origin: 'Celestials' },
  { name: 'Deep Speech', rarity: 'rare', origin: 'Aberrations' },
  { name: 'Druidic', rarity: 'rare', origin: "Druids (the order's secret)" },
  { name: 'Infernal', rarity: 'rare', origin: 'Devils of the Nine Hells' },
  { name: 'Primordial', rarity: 'rare', origin: 'Elementals', dialects: ['Aquan', 'Auran', 'Ignan', 'Terran'] },
  { name: 'Sylvan', rarity: 'rare', origin: 'Fey creatures' },
  { name: "Thieves' Cant", rarity: 'rare', origin: 'Criminal underworld' },
  { name: 'Undercommon', rarity: 'rare', origin: 'Denizens of the Underdark' },
];

export type ToolFamily = 'artisan' | 'gaming-set' | 'instrument' | 'other';

export interface Tool {
  name: string;
  family: ToolFamily;
}

export const TOOLS_2024: Tool[] = [
  // Artisan's Tools
  { name: "Alchemist's Supplies", family: 'artisan' },
  { name: "Brewer's Supplies", family: 'artisan' },
  { name: "Calligrapher's Supplies", family: 'artisan' },
  { name: "Carpenter's Tools", family: 'artisan' },
  { name: "Cartographer's Tools", family: 'artisan' },
  { name: "Cobbler's Tools", family: 'artisan' },
  { name: "Cook's Utensils", family: 'artisan' },
  { name: "Glassblower's Tools", family: 'artisan' },
  { name: "Jeweler's Tools", family: 'artisan' },
  { name: "Leatherworker's Tools", family: 'artisan' },
  { name: "Mason's Tools", family: 'artisan' },
  { name: "Painter's Supplies", family: 'artisan' },
  { name: "Potter's Tools", family: 'artisan' },
  { name: "Smith's Tools", family: 'artisan' },
  { name: "Tinker's Tools", family: 'artisan' },
  { name: "Weaver's Tools", family: 'artisan' },
  { name: "Woodcarver's Tools", family: 'artisan' },
  // Gaming Sets
  { name: 'Dice Set', family: 'gaming-set' },
  { name: 'Dragonchess Set', family: 'gaming-set' },
  { name: 'Playing Card Set', family: 'gaming-set' },
  { name: 'Three-Dragon Ante Set', family: 'gaming-set' },
  // Musical Instruments
  { name: 'Bagpipes', family: 'instrument' },
  { name: 'Drum', family: 'instrument' },
  { name: 'Dulcimer', family: 'instrument' },
  { name: 'Flute', family: 'instrument' },
  { name: 'Horn', family: 'instrument' },
  { name: 'Lute', family: 'instrument' },
  { name: 'Lyre', family: 'instrument' },
  { name: 'Pan Flute', family: 'instrument' },
  { name: 'Shawm', family: 'instrument' },
  { name: 'Viol', family: 'instrument' },
  // Other Tools
  { name: 'Disguise Kit', family: 'other' },
  { name: 'Forgery Kit', family: 'other' },
  { name: 'Herbalism Kit', family: 'other' },
  { name: "Navigator's Tools", family: 'other' },
  { name: "Poisoner's Kit", family: 'other' },
  { name: "Thieves' Tools", family: 'other' },
];

export function languagesByRarity(rarity: LanguageRarity): Language[] {
  return LANGUAGES_2024.filter((l) => l.rarity === rarity);
}

export function toolsByFamily(family: ToolFamily): Tool[] {
  return TOOLS_2024.filter((t) => t.family === family);
}

export function isKnownTool(name: string): boolean {
  return TOOLS_2024.some((t) => t.name === name);
}
