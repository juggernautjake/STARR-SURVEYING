// lib/dnd/systems/pathfinder2e/content.ts — the VANILLA content library for Pathfinder 2e (Remaster,
// Player Core 1 & 2). This is the authoritative registry the builder reads: the 16 core skills, the 14
// classes with their level-1 proficiency ranks + key attribute + HP, the 8 ancestries with HP/size/
// speed/boosts, backgrounds, and the per-class defining subclass choice. Names are the recognition key;
// mechanical facts (ranks, HP, boosts) drive rules.ts. Extend a list to teach the system a new element.
//
// GROUND RULE: this file holds Pathfinder 2e ONLY — never mix in 5e (2014/2024) or Intuitive Games rules.
import type { PF2AttributeKey, PF2Rank, PF2Tradition } from './model';

// ── The 16 core skills + their governing attribute (Lore is an open-ended 17th, added per character) ──
export interface PF2SkillDef { name: string; attribute: PF2AttributeKey; armorPenalty?: boolean }
export const PF2_SKILLS: PF2SkillDef[] = [
  { name: 'Acrobatics', attribute: 'DEX', armorPenalty: true },
  { name: 'Arcana', attribute: 'INT' },
  { name: 'Athletics', attribute: 'STR', armorPenalty: true },
  { name: 'Crafting', attribute: 'INT' },
  { name: 'Deception', attribute: 'CHA' },
  { name: 'Diplomacy', attribute: 'CHA' },
  { name: 'Intimidation', attribute: 'CHA' },
  { name: 'Medicine', attribute: 'WIS' },
  { name: 'Nature', attribute: 'WIS' },
  { name: 'Occultism', attribute: 'INT' },
  { name: 'Performance', attribute: 'CHA' },
  { name: 'Religion', attribute: 'WIS' },
  { name: 'Society', attribute: 'INT' },
  { name: 'Stealth', attribute: 'DEX', armorPenalty: true },
  { name: 'Survival', attribute: 'WIS' },
  { name: 'Thievery', attribute: 'DEX', armorPenalty: true },
];

// ── Class definitions ───────────────────────────────────────────────────────────────────────────────
export interface PF2ClassInitial {
  perception: PF2Rank;
  fortitude: PF2Rank;
  reflex: PF2Rank;
  will: PF2Rank;
  /** The best armor-defense rank granted at level 1 (unarmored is always at least this). */
  defense: PF2Rank;
  /** Weapon/attack proficiency at level 1 (Fighter alone starts Expert). */
  attacks: PF2Rank;
  classDc: PF2Rank;
}
export interface PF2ClassDef {
  name: string;
  /** The key attribute (some classes offer a choice — the first is the default). */
  keyAttribute: PF2AttributeKey[];
  hpPerLevel: number;
  /** Trained skills = this many + INT modifier. */
  trainedSkills: number;
  /** Skills the class always trains (beyond the free picks). */
  fixedSkills?: string[];
  initial: PF2ClassInitial;
  /** The defining level-1 choice and the glossary term describing its mechanism. */
  subclassLabel: string;
  subclassMechanism: string; // matches a glossary term (Instinct, Racket, Bloodline, …)
  /** The concrete options for that choice (Remaster line-up). Empty when the class has no formal
   *  subclass (Fighter picks a weapon; Monk picks stances) — the builder then takes freeform text.
   *  These are suggestions in the builder's datalist, not a hard gate: custom is the escape hatch. */
  subclassOptions: string[];
  /** Spellcasting, if any. */
  spellcasting?: { tradition: PF2Tradition; kind: 'prepared' | 'spontaneous'; attribute: PF2AttributeKey };
  summary: string;
}

const MARTIAL: Pick<PF2ClassInitial, 'attacks' | 'classDc'> = { attacks: 'trained', classDc: 'trained' };

export const PF2_CLASSES: PF2ClassDef[] = [
  {
    name: 'Alchemist', keyAttribute: ['INT'], hpPerLevel: 8, trainedSkills: 3, fixedSkills: ['Crafting'],
    initial: { perception: 'trained', fortitude: 'expert', reflex: 'expert', will: 'trained', defense: 'trained', ...MARTIAL },
    subclassLabel: 'Research Field', subclassMechanism: 'Research Field',
    subclassOptions: ['Bomber', 'Chirurgeon', 'Mutagenist', 'Toxicologist'],
    summary: 'A master of alchemy who brews reagents into bombs, elixirs, and mutagens using Advanced Alchemy and a daily reagent pool.',
  },
  {
    name: 'Barbarian', keyAttribute: ['STR'], hpPerLevel: 12, trainedSkills: 3, fixedSkills: ['Athletics'],
    initial: { perception: 'expert', fortitude: 'expert', reflex: 'trained', will: 'expert', defense: 'trained', ...MARTIAL },
    subclassLabel: 'Instinct', subclassMechanism: 'Instinct',
    subclassOptions: ['Animal', 'Dragon', 'Fury', 'Giant', 'Spirit'],
    summary: 'A furious warrior who enters Rage for bonus damage and temporary HP, shaped by an Instinct (Animal, Dragon, Fury, Giant, Spirit).',
  },
  {
    name: 'Bard', keyAttribute: ['CHA'], hpPerLevel: 8, trainedSkills: 4, fixedSkills: ['Occultism', 'Performance'],
    initial: { perception: 'expert', fortitude: 'trained', reflex: 'trained', will: 'expert', defense: 'trained', ...MARTIAL },
    subclassLabel: 'Muse', subclassMechanism: 'Muse',
    subclassOptions: ['Enigma', 'Maestro', 'Polymath', 'Warrior'],
    spellcasting: { tradition: 'occult', kind: 'spontaneous', attribute: 'CHA' },
    summary: 'An occult spontaneous caster who weaves Compositions; a Muse (Enigma, Maestro, Polymath, Warrior) shapes their repertoire.',
  },
  {
    name: 'Champion', keyAttribute: ['STR', 'DEX'], hpPerLevel: 10, trainedSkills: 2, fixedSkills: ['Religion'],
    initial: { perception: 'trained', fortitude: 'expert', reflex: 'trained', will: 'expert', defense: 'trained', ...MARTIAL },
    subclassLabel: 'Cause', subclassMechanism: 'Cause',
    subclassOptions: ['Paladin', 'Redeemer', 'Liberator', 'Desecrator', 'Tyrant'],
    summary: 'A divine warrior bound to a deity and a Cause; their Champion’s Reaction (e.g. Retributive Strike) protects allies. Heavy armor at level 1.',
  },
  {
    name: 'Cleric', keyAttribute: ['WIS'], hpPerLevel: 8, trainedSkills: 2, fixedSkills: ['Religion'],
    initial: { perception: 'trained', fortitude: 'trained', reflex: 'trained', will: 'expert', defense: 'trained', ...MARTIAL },
    subclassLabel: 'Doctrine', subclassMechanism: 'Doctrine',
    subclassOptions: ['Cloistered Cleric', 'Warpriest'],
    spellcasting: { tradition: 'divine', kind: 'prepared', attribute: 'WIS' },
    summary: 'A divine prepared caster channeling a deity; their Doctrine (Cloistered or Warpriest) and Divine Font (heal/harm) define them.',
  },
  {
    name: 'Druid', keyAttribute: ['WIS'], hpPerLevel: 8, trainedSkills: 2, fixedSkills: ['Nature'],
    initial: { perception: 'trained', fortitude: 'trained', reflex: 'trained', will: 'expert', defense: 'trained', ...MARTIAL },
    subclassLabel: 'Order', subclassMechanism: 'Order',
    subclassOptions: ['Animal', 'Leaf', 'Storm', 'Untamed'],
    spellcasting: { tradition: 'primal', kind: 'prepared', attribute: 'WIS' },
    summary: 'A primal prepared caster sworn to an Order (Animal, Leaf, Storm, Untamed, Wild) and the druidic anathema.',
  },
  {
    name: 'Fighter', keyAttribute: ['STR', 'DEX'], hpPerLevel: 10, trainedSkills: 3,
    initial: { perception: 'expert', fortitude: 'expert', reflex: 'expert', will: 'trained', defense: 'trained', attacks: 'expert', classDc: 'trained' },
    subclassLabel: 'Weapon of choice', subclassMechanism: 'Fighter', subclassOptions: [],
    summary: 'The premier martial: Expert in attacks at level 1, Attack of Opportunity, and the deepest weapon-feat list in the game.',
  },
  {
    name: 'Monk', keyAttribute: ['STR', 'DEX'], hpPerLevel: 10, trainedSkills: 4,
    initial: { perception: 'trained', fortitude: 'expert', reflex: 'expert', will: 'expert', defense: 'trained', ...MARTIAL },
    subclassLabel: 'Stance / Ki', subclassMechanism: 'Monk', subclassOptions: [],
    summary: 'An unarmored martial artist with Flurry of Blows, powerful stances, and (optionally) ki spells; Expert in all three saves.',
  },
  {
    name: 'Oracle', keyAttribute: ['CHA'], hpPerLevel: 8, trainedSkills: 3, fixedSkills: ['Religion'],
    initial: { perception: 'trained', fortitude: 'trained', reflex: 'trained', will: 'expert', defense: 'trained', ...MARTIAL },
    subclassLabel: 'Mystery', subclassMechanism: 'Mystery',
    subclassOptions: ['Ancestors', 'Battle', 'Bones', 'Cosmos', 'Flames', 'Life', 'Lore', 'Tempest'],
    spellcasting: { tradition: 'divine', kind: 'spontaneous', attribute: 'CHA' },
    summary: 'A divine spontaneous caster channeling a Mystery; casting revelations deepens their escalating Curse.',
  },
  {
    name: 'Ranger', keyAttribute: ['STR', 'DEX'], hpPerLevel: 10, trainedSkills: 4, fixedSkills: ['Survival'],
    initial: { perception: 'expert', fortitude: 'expert', reflex: 'expert', will: 'trained', defense: 'trained', ...MARTIAL },
    subclassLabel: "Hunter's Edge", subclassMechanism: "Hunter's Edge",
    subclassOptions: ['Flurry', 'Precision', 'Outwit'],
    summary: "A skilled hunter who marks Hunt Prey and picks a Hunter's Edge (Flurry, Precision, or Outwit); Expert Reflex + Perception.",
  },
  {
    name: 'Rogue', keyAttribute: ['DEX'], hpPerLevel: 8, trainedSkills: 7, fixedSkills: ['Stealth'],
    initial: { perception: 'expert', fortitude: 'trained', reflex: 'expert', will: 'expert', defense: 'trained', ...MARTIAL },
    subclassLabel: 'Racket', subclassMechanism: 'Racket',
    subclassOptions: ['Thief', 'Ruffian', 'Scoundrel', 'Mastermind', 'Eldritch Trickster'],
    summary: 'A skill-monker with Sneak Attack and the most trained skills; a Racket (Ruffian, Scoundrel, Thief, …) sets its key attribute and style.',
  },
  {
    name: 'Sorcerer', keyAttribute: ['CHA'], hpPerLevel: 6, trainedSkills: 2,
    initial: { perception: 'trained', fortitude: 'trained', reflex: 'trained', will: 'expert', defense: 'trained', ...MARTIAL },
    subclassLabel: 'Bloodline', subclassMechanism: 'Bloodline',
    subclassOptions: ['Aberrant', 'Angelic', 'Demonic', 'Diabolic', 'Draconic', 'Elemental', 'Fey', 'Hag', 'Imperial', 'Undead'],
    spellcasting: { tradition: 'arcane', kind: 'spontaneous', attribute: 'CHA' }, // tradition varies BY bloodline
    summary: 'A spontaneous caster whose Bloodline sets the tradition and grants blood magic; the widest spell slots of any caster.',
  },
  {
    name: 'Witch', keyAttribute: ['INT'], hpPerLevel: 6, trainedSkills: 3,
    initial: { perception: 'trained', fortitude: 'trained', reflex: 'trained', will: 'expert', defense: 'trained', ...MARTIAL },
    subclassLabel: 'Patron', subclassMechanism: 'Patron',
    subclassOptions: ['Faith', 'Family', 'Fervor', 'Mosquito Witch', 'Wild', 'Winter', 'Curse', 'Rune'],
    spellcasting: { tradition: 'occult', kind: 'prepared', attribute: 'INT' }, // tradition varies BY patron
    summary: 'A prepared caster serving a Patron through a familiar that delivers Hexes; the patron sets the tradition.',
  },
  {
    name: 'Wizard', keyAttribute: ['INT'], hpPerLevel: 6, trainedSkills: 2, fixedSkills: ['Arcana'],
    initial: { perception: 'trained', fortitude: 'trained', reflex: 'trained', will: 'expert', defense: 'trained', ...MARTIAL },
    subclassLabel: 'Arcane Thesis', subclassMechanism: 'Wizard',
    subclassOptions: ['Improved Familiar Attunement', 'Metamagical Experimentation', 'Spell Blending', 'Spell Substitution', 'Experimental Spellshaping'],
    spellcasting: { tradition: 'arcane', kind: 'prepared', attribute: 'INT' },
    summary: 'The archetypal arcane prepared caster with an Arcane Thesis and (optionally) a curriculum/school granting an extra slot.',
  },
];

// ── Ancestries ────────────────────────────────────────────────────────────────────────────────────
export interface PF2AncestryDef {
  name: string;
  hp: number;
  size: 'Small' | 'Medium';
  speed: number;
  /** Fixed attribute boosts; 'free' = a free boost the player assigns. (Remaster: no flaws.) */
  boosts: (PF2AttributeKey | 'free')[];
  languages: string[];
  traits: string[];
  heritages: string[];
  senses?: string;
  summary: string;
}
export const PF2_ANCESTRIES: PF2AncestryDef[] = [
  {
    name: 'Dwarf', hp: 10, size: 'Medium', speed: 20, boosts: ['CON', 'WIS', 'free'],
    languages: ['Common', 'Dwarven'], traits: ['Dwarf', 'Humanoid'], senses: 'Darkvision',
    heritages: ['Ancient-Blooded', 'Death Warden', 'Forge', 'Rock', 'Strong-Blooded', 'Elemental Heart'],
    summary: 'Stout, tradition-bound folk with darkvision, a 20-ft speed unslowed by armor, and hardy Fortitude.',
  },
  {
    name: 'Elf', hp: 6, size: 'Medium', speed: 30, boosts: ['DEX', 'INT', 'free'],
    languages: ['Common', 'Elven'], traits: ['Elf', 'Humanoid'], senses: 'Low-light vision',
    heritages: ['Ancient', 'Arctic', 'Cavern', 'Desert', 'Seer', 'Whisper', 'Woodland'],
    summary: 'Long-lived, graceful people with a fast 30-ft speed, low-light vision, and a keen mind.',
  },
  {
    name: 'Gnome', hp: 8, size: 'Small', speed: 25, boosts: ['CON', 'CHA', 'free'],
    languages: ['Common', 'Gnomish', 'Sylvan'], traits: ['Gnome', 'Humanoid'], senses: 'Low-light vision',
    heritages: ['Chameleon', 'Fey-Touched', 'Sensate', 'Umbral', 'Wellspring', 'Vivacious'],
    summary: 'Small fey-touched folk driven by insatiable curiosity, with low-light vision and innate primal magic.',
  },
  {
    name: 'Goblin', hp: 6, size: 'Small', speed: 25, boosts: ['DEX', 'CHA', 'free'],
    languages: ['Common', 'Goblin'], traits: ['Goblin', 'Humanoid'], senses: 'Darkvision',
    heritages: ['Charhide', 'Irongut', 'Razortooth', 'Snow', 'Unbreakable', 'Treedweller'],
    summary: 'Small, resilient survivors with darkvision, a knack for fire, and boundless energy.',
  },
  {
    name: 'Halfling', hp: 6, size: 'Small', speed: 25, boosts: ['DEX', 'WIS', 'free'],
    languages: ['Common', 'Halfling'], traits: ['Halfling', 'Humanoid'], senses: 'Keen Eyes',
    heritages: ['Gutsy', 'Hillock', 'Nomadic', 'Twilight', 'Wildwood', 'Jinxed'],
    summary: 'Small, lucky, community-minded folk with keen eyes and a strong will against fear.',
  },
  {
    name: 'Human', hp: 8, size: 'Medium', speed: 25, boosts: ['free', 'free'],
    languages: ['Common'], traits: ['Human', 'Humanoid'],
    heritages: ['Skilled', 'Versatile', 'Wintertouched', 'Half-Elf', 'Half-Orc'],
    summary: 'The most adaptable ancestry: two free boosts and heritages (Skilled, Versatile) that spend feats broadly.',
  },
  {
    name: 'Leshy', hp: 8, size: 'Small', speed: 25, boosts: ['CON', 'WIS', 'free'],
    languages: ['Common', 'Fey'], traits: ['Leshy', 'Plant'], senses: 'Low-light vision',
    heritages: ['Cactus', 'Fruit', 'Fungus', 'Gourd', 'Leaf', 'Lotus', 'Root', 'Seaweed', 'Vine'],
    summary: 'Small plant creatures animated by primal spirits; they don’t breathe and share a fey heritage.',
  },
  {
    name: 'Orc', hp: 10, size: 'Medium', speed: 25, boosts: ['STR', 'free', 'free'],
    languages: ['Common', 'Orcish'], traits: ['Orc', 'Humanoid'], senses: 'Darkvision',
    heritages: ['Badlands', 'Battle-Ready', 'Deep', 'Grave', 'Hold-Scarred', 'Rainfall', 'Winter'],
    summary: 'Strong, enduring warriors with darkvision and a ferocity that keeps them fighting past a felling blow.',
  },
];

// ── Backgrounds — each grants two attribute boosts (one often free), a trained skill, a Lore, and a
//    skill feat. A representative core set; the builder lets the AI add more. ─────────────────────────
export interface PF2BackgroundDef {
  name: string;
  boosts: (PF2AttributeKey | 'free')[];
  skill: string;
  lore: string;
  feat: string;
  summary: string;
}
export const PF2_BACKGROUNDS: PF2BackgroundDef[] = [
  { name: 'Acolyte', boosts: ['INT', 'free'], skill: 'Religion', lore: 'Scribing Lore', feat: 'Student of the Canon', summary: 'Raised in a temple; trained in Religion.' },
  { name: 'Acrobat', boosts: ['STR', 'free'], skill: 'Acrobatics', lore: 'Circus Lore', feat: 'Steady Balance', summary: 'A tumbler or aerialist; trained in Acrobatics.' },
  { name: 'Artisan', boosts: ['STR', 'free'], skill: 'Crafting', lore: 'Guild Lore', feat: 'Specialty Crafting', summary: 'A trained maker; Crafting.' },
  { name: 'Barkeep', boosts: ['CON', 'free'], skill: 'Diplomacy', lore: 'Alcohol Lore', feat: 'Hobnobber', summary: 'Ran a tavern; Diplomacy.' },
  { name: 'Charlatan', boosts: ['INT', 'free'], skill: 'Deception', lore: 'Underworld Lore', feat: 'Charming Liar', summary: 'A con artist; Deception.' },
  { name: 'Criminal', boosts: ['DEX', 'free'], skill: 'Stealth', lore: 'Underworld Lore', feat: 'Experienced Smuggler', summary: 'A former thief; Stealth.' },
  { name: 'Entertainer', boosts: ['DEX', 'free'], skill: 'Performance', lore: 'Theater Lore', feat: 'Fascinating Performance', summary: 'A performer; Performance.' },
  { name: 'Farmhand', boosts: ['CON', 'free'], skill: 'Athletics', lore: 'Farming Lore', feat: 'Assurance (Athletics)', summary: 'Worked the land; Athletics.' },
  { name: 'Gladiator', boosts: ['STR', 'free'], skill: 'Performance', lore: 'Gladiatorial Lore', feat: 'Impressive Performance', summary: 'Fought for crowds; Performance.' },
  { name: 'Hunter', boosts: ['DEX', 'free'], skill: 'Survival', lore: 'Tanning Lore', feat: 'Survey Wildlife', summary: 'Tracked game; Survival.' },
  { name: 'Merchant', boosts: ['INT', 'free'], skill: 'Diplomacy', lore: 'Mercantile Lore', feat: 'Bargain Hunter', summary: 'Traded goods; Diplomacy.' },
  { name: 'Noble', boosts: ['INT', 'free'], skill: 'Society', lore: 'Genealogy Lore', feat: 'Courtly Graces', summary: 'Born to privilege; Society.' },
  { name: 'Nomad', boosts: ['CON', 'free'], skill: 'Survival', lore: 'Regional Lore', feat: 'Assurance (Survival)', summary: 'Wandered far; Survival.' },
  { name: 'Scholar', boosts: ['INT', 'free'], skill: 'Arcana', lore: 'Academia Lore', feat: 'Assurance (chosen)', summary: 'Studied deeply; a knowledge skill.' },
  { name: 'Scout', boosts: ['DEX', 'free'], skill: 'Survival', lore: 'Regional Lore', feat: 'Forager', summary: 'Ranged ahead; Survival.' },
  { name: 'Street Urchin', boosts: ['DEX', 'free'], skill: 'Thievery', lore: 'Regional Lore', feat: 'Pickpocket', summary: 'Grew up poor; Thievery.' },
  { name: 'Warrior', boosts: ['STR', 'free'], skill: 'Athletics', lore: 'Warfare Lore', feat: 'Intimidating Glare', summary: 'A veteran fighter; Athletics.' },
];

// ── Armor (Player Core) — the worn armor sets the AC item bonus and the Dex cap; the character's
//    proficiency RANK in that armor's category comes from the class, not the item. `dexCap: null` means
//    uncapped (Unarmored). AC = 10 + min(Dex, dexCap) + proficiency + acBonus (see rules.pf2ArmorClass). ─
export type PF2ArmorCategory = 'unarmored' | 'light' | 'medium' | 'heavy';
export interface PF2ArmorDef {
  name: string;
  category: PF2ArmorCategory;
  /** Item bonus to AC. */
  acBonus: number;
  /** Dex cap; null = uncapped (Unarmored only). */
  dexCap: number | null;
  /** Attribute (Strength modifier) that removes the check/speed penalty; 0 = none. */
  strength: number;
  checkPenalty: number;
  speedPenalty: number;
  group?: string;
}
export const PF2_ARMORS: PF2ArmorDef[] = [
  { name: 'Unarmored', category: 'unarmored', acBonus: 0, dexCap: null, strength: 0, checkPenalty: 0, speedPenalty: 0 },
  // Light
  { name: 'Padded Armor', category: 'light', acBonus: 1, dexCap: 3, strength: 0, checkPenalty: 0, speedPenalty: 0, group: 'Cloth' },
  { name: 'Leather', category: 'light', acBonus: 1, dexCap: 4, strength: 1, checkPenalty: -1, speedPenalty: 0, group: 'Leather' },
  { name: 'Studded Leather', category: 'light', acBonus: 2, dexCap: 3, strength: 1, checkPenalty: -1, speedPenalty: 0, group: 'Leather' },
  { name: 'Chain Shirt', category: 'light', acBonus: 2, dexCap: 3, strength: 1, checkPenalty: -1, speedPenalty: 0, group: 'Chain' },
  // Medium
  { name: 'Hide', category: 'medium', acBonus: 3, dexCap: 2, strength: 2, checkPenalty: -2, speedPenalty: -5, group: 'Leather' },
  { name: 'Scale Mail', category: 'medium', acBonus: 3, dexCap: 2, strength: 2, checkPenalty: -2, speedPenalty: -5, group: 'Composite' },
  { name: 'Chain Mail', category: 'medium', acBonus: 4, dexCap: 1, strength: 3, checkPenalty: -2, speedPenalty: -5, group: 'Chain' },
  { name: 'Breastplate', category: 'medium', acBonus: 4, dexCap: 1, strength: 3, checkPenalty: -2, speedPenalty: -5, group: 'Plate' },
  // Heavy
  { name: 'Splint Mail', category: 'heavy', acBonus: 5, dexCap: 1, strength: 3, checkPenalty: -3, speedPenalty: -10, group: 'Composite' },
  { name: 'Half Plate', category: 'heavy', acBonus: 5, dexCap: 1, strength: 3, checkPenalty: -3, speedPenalty: -10, group: 'Plate' },
  { name: 'Full Plate', category: 'heavy', acBonus: 6, dexCap: 0, strength: 4, checkPenalty: -3, speedPenalty: -10, group: 'Plate' },
];

// ── Convenience lookups ────────────────────────────────────────────────────────────────────────────
export const pf2Class = (name: string) => PF2_CLASSES.find(c => c.name.toLowerCase() === name.toLowerCase()) || null;
export const pf2Ancestry = (name: string) => PF2_ANCESTRIES.find(a => a.name.toLowerCase() === name.toLowerCase()) || null;
export const pf2Background = (name: string) => PF2_BACKGROUNDS.find(b => b.name.toLowerCase() === name.toLowerCase()) || null;
export const pf2Skill = (name: string) => PF2_SKILLS.find(s => s.name.toLowerCase() === name.toLowerCase()) || null;
export const pf2Armor = (name: string) => PF2_ARMORS.find(a => a.name.toLowerCase() === name.toLowerCase()) || null;
