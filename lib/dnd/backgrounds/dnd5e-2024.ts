// lib/dnd/backgrounds/dnd5e-2024.ts — the 16 Player's Handbook (2024) backgrounds (Slice 4).
//
// The one rule that reshapes character creation in 2024: **the BACKGROUND grants the ability score
// increases**, not the species. Each background lists three abilities and you distribute either +2/+1
// or +1/+1/+1 among them. Each also grants an Origin feat, two skills, one tool, and starting gear.
// `backgrounds.test.ts` pins two invariants the slice names: every background's `originFeat` resolves
// in the feats data, and every background actually carries its ability-score options (the 2024 rule).
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

export interface Background {
  key: string;
  name: string;
  system: 'dnd5e-2024';
  /** Exactly three abilities; the player assigns +2/+1 or +1/+1/+1 across them. This is WHERE the
   *  2024 ability increases live — on the background, never the species. */
  abilityScores: AbilityKey[];
  /** The Origin feat this background grants. A key into `FEATS_2024` — must resolve. */
  originFeat: string;
  /** The spell list, when `originFeat` is Magic Initiate — the background chooses it for you. */
  spellList?: 'arcane' | 'divine' | 'primal';
  /** Exactly two skill proficiencies (keys into `SKILLS`). */
  skillProficiencies: string[];
  /** One tool proficiency — a specific tool, or a category like "one Artisan's Tools of your choice". */
  toolProficiency: string;
  /** The "Choose A or B" starting-equipment line, verbatim. */
  equipment: string;
}

export const BACKGROUNDS_2024: Background[] = [
  {
    key: 'acolyte', name: 'Acolyte', system: 'dnd5e-2024',
    abilityScores: ['int', 'wis', 'cha'], originFeat: 'magic-initiate', spellList: 'divine',
    skillProficiencies: ['insight', 'religion'], toolProficiency: "Calligrapher's Supplies",
    equipment: "(A) Calligrapher's Supplies, Book (prayers), Holy Symbol, Parchment (10), Robe, 8 GP; or (B) 50 GP",
  },
  {
    key: 'artisan', name: 'Artisan', system: 'dnd5e-2024',
    abilityScores: ['str', 'dex', 'int'], originFeat: 'crafter',
    skillProficiencies: ['investigation', 'persuasion'], toolProficiency: "one Artisan's Tools of your choice",
    equipment: "(A) Artisan's Tools (same as above), 2 Pouches, Traveler's Clothes, 32 GP; or (B) 50 GP",
  },
  {
    key: 'charlatan', name: 'Charlatan', system: 'dnd5e-2024',
    abilityScores: ['dex', 'con', 'cha'], originFeat: 'skilled',
    skillProficiencies: ['deception', 'sleight'], toolProficiency: 'Forgery Kit',
    equipment: "(A) Forgery Kit, Costume, Fine Clothes, 15 GP; or (B) 50 GP",
  },
  {
    key: 'criminal', name: 'Criminal', system: 'dnd5e-2024',
    abilityScores: ['dex', 'con', 'int'], originFeat: 'alert',
    skillProficiencies: ['sleight', 'stealth'], toolProficiency: "Thieves' Tools",
    equipment: "(A) 2 Daggers, Thieves' Tools, Crowbar, 2 Pouches, Traveler's Clothes, 16 GP; or (B) 50 GP",
  },
  {
    key: 'entertainer', name: 'Entertainer', system: 'dnd5e-2024',
    abilityScores: ['str', 'dex', 'cha'], originFeat: 'musician',
    skillProficiencies: ['acrobatics', 'performance'], toolProficiency: 'one Musical Instrument of your choice',
    equipment: "(A) Musical Instrument (same as above), 2 Costumes, Mirror, Perfume, Traveler's Clothes, 11 GP; or (B) 50 GP",
  },
  {
    key: 'farmer', name: 'Farmer', system: 'dnd5e-2024',
    abilityScores: ['str', 'con', 'wis'], originFeat: 'tough',
    skillProficiencies: ['animal', 'nature'], toolProficiency: "Carpenter's Tools",
    equipment: "(A) Sickle, Carpenter's Tools, Healer's Kit, Iron Pot, Shovel, Traveler's Clothes, 30 GP; or (B) 50 GP",
  },
  {
    key: 'guard', name: 'Guard', system: 'dnd5e-2024',
    abilityScores: ['str', 'int', 'wis'], originFeat: 'alert',
    skillProficiencies: ['athletics', 'perception'], toolProficiency: 'one Gaming Set of your choice',
    equipment: "(A) Spear, Light Crossbow, 20 Bolts, Gaming Set (same as above), Hooded Lantern, Manacles, Quiver, Traveler's Clothes, 12 GP; or (B) 50 GP",
  },
  {
    key: 'guide', name: 'Guide', system: 'dnd5e-2024',
    abilityScores: ['dex', 'con', 'wis'], originFeat: 'magic-initiate', spellList: 'primal',
    skillProficiencies: ['stealth', 'survival'], toolProficiency: "Cartographer's Tools",
    equipment: "(A) Shortbow, 20 Arrows, Cartographer's Tools, Bedroll, Quiver, Tent, Traveler's Clothes, 3 GP; or (B) 50 GP",
  },
  {
    key: 'hermit', name: 'Hermit', system: 'dnd5e-2024',
    abilityScores: ['con', 'wis', 'cha'], originFeat: 'healer',
    skillProficiencies: ['medicine', 'religion'], toolProficiency: 'Herbalism Kit',
    equipment: "(A) Quarterstaff, Herbalism Kit, Bedroll, Book (philosophy), Lamp, Oil (3 flasks), Traveler's Clothes, 16 GP; or (B) 50 GP",
  },
  {
    key: 'merchant', name: 'Merchant', system: 'dnd5e-2024',
    abilityScores: ['con', 'int', 'cha'], originFeat: 'lucky',
    skillProficiencies: ['animal', 'persuasion'], toolProficiency: "Navigator's Tools",
    equipment: "(A) Navigator's Tools, 2 Pouches, Traveler's Clothes, 22 GP; or (B) 50 GP",
  },
  {
    key: 'noble', name: 'Noble', system: 'dnd5e-2024',
    abilityScores: ['str', 'int', 'cha'], originFeat: 'skilled',
    skillProficiencies: ['history', 'persuasion'], toolProficiency: 'one Gaming Set of your choice',
    equipment: "(A) Gaming Set (same as above), Fine Clothes, Perfume, 29 GP; or (B) 50 GP",
  },
  {
    key: 'sage', name: 'Sage', system: 'dnd5e-2024',
    abilityScores: ['con', 'int', 'wis'], originFeat: 'magic-initiate', spellList: 'arcane',
    skillProficiencies: ['arcana', 'history'], toolProficiency: "Calligrapher's Supplies",
    equipment: "(A) Quarterstaff, Calligrapher's Supplies, Book (history), Parchment (8), Robe, 8 GP; or (B) 50 GP",
  },
  {
    key: 'sailor', name: 'Sailor', system: 'dnd5e-2024',
    abilityScores: ['str', 'dex', 'wis'], originFeat: 'tavern-brawler',
    skillProficiencies: ['acrobatics', 'perception'], toolProficiency: "Navigator's Tools",
    equipment: "(A) Dagger, Navigator's Tools, Rope, Traveler's Clothes, 20 GP; or (B) 50 GP",
  },
  {
    key: 'scribe', name: 'Scribe', system: 'dnd5e-2024',
    abilityScores: ['dex', 'int', 'wis'], originFeat: 'skilled',
    skillProficiencies: ['investigation', 'perception'], toolProficiency: "Calligrapher's Supplies",
    equipment: "(A) Calligrapher's Supplies, Fine Clothes, Lamp, Oil (3 flasks), Parchment (12), 23 GP; or (B) 50 GP",
  },
  {
    key: 'soldier', name: 'Soldier', system: 'dnd5e-2024',
    abilityScores: ['str', 'dex', 'con'], originFeat: 'savage-attacker',
    skillProficiencies: ['athletics', 'intimidation'], toolProficiency: 'one Gaming Set of your choice',
    equipment: "(A) Spear, Shortbow, 20 Arrows, Gaming Set (same as above), Healer's Kit, Quiver, Traveler's Clothes, 14 GP; or (B) 50 GP",
  },
  {
    key: 'wayfarer', name: 'Wayfarer', system: 'dnd5e-2024',
    abilityScores: ['dex', 'wis', 'cha'], originFeat: 'lucky',
    skillProficiencies: ['insight', 'stealth'], toolProficiency: "Thieves' Tools",
    equipment: "(A) 2 Daggers, Thieves' Tools, Gaming Set, Bedroll, 2 Pouches, Traveler's Clothes, 16 GP; or (B) 50 GP",
  },
];

export function findBackground(key: string): Background | undefined {
  return BACKGROUNDS_2024.find((b) => b.key === key);
}
