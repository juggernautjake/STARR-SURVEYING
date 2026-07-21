// lib/dnd/systems/pathfinder2e/data/ancestries.ts — ANCESTRIES, HERITAGES, ANCESTRY FEATS, BACKGROUNDS.
//
// content.ts carries an 8-entry ancestry seed and a 17-entry background seed that predate the catalog
// buildout. This file is the full tranche: 16 ancestries with their complete stat lines, every heritage
// those ancestries offer, every ancestry feat on the 1/5/9/13/17 schedule, and the Player Core
// background list. The seed stays where it is; new consumers should read from here.
//
// LICENSING: PF2 mechanics are ORC-licensed, which expressly permits reproducing rules mechanics.
// Reserved Material — Paizo trademarks, deities, characters, locations, lore, art — must never appear
// here. Every entry carries `source`. Mechanical facts and numbers, PARAPHRASED; never verbatim
// rulebook prose. Remaster terminology and Remaster levels throughout. Where a rules element's own
// NAME references setting material (a feat called "First World Magic", a Lore skill tied to a region),
// the name is retained because it is the lookup key, but the prose describes only the mechanic.
//
// GROUND RULE 3 — NEVER INVENT AN ANCESTRY, HERITAGE, FEAT, LEVEL, OR BOOST. eligibility.ts turns
// `level` and `ancestry` into a hard gate: a wrong level makes the builder REFUSE a legal pick, which
// is the one failure a player cannot work around. Every level, boost, flaw, and prerequisite below was
// checked against the published Player Core / Player Core 2 entries rather than recalled. Anything that
// could not be confirmed was omitted entirely — see PF2_ANCESTRY_GAPS at the foot of the file.
//
// TWO CORRECTIONS TO A COMMON MISBELIEF, both load-bearing here:
//   1. The Remaster did NOT remove ancestry attribute flaws. Player Core ancestries still print an
//      Attribute Flaw (dwarves take a Charisma flaw, elves a Constitution flaw, and so on). What every
//      ancestry also offers is the ALTERNATIVE of two free boosts and no flaw in place of the printed
//      spread — see PF2_ALTERNATE_BOOSTS_RULE. Human, Orc, and Tengu are the ancestries that print no
//      flaw at all. content.ts's seed comment ("Remaster: no flaws") is wrong; this file is right.
//   2. Orc's printed spread is TWO FREE BOOSTS, not Strength plus free boosts. content.ts's seed says
//      `['STR','free','free']`; that is not the Player Core line and is not reproduced here.
//
// HOW PREREQUISITES ARE AUTHORED (see eligibility.ts — same contract as feats-general-skill.ts):
//   • `prereqs` is CHECKED and ANDed. Feat prerequisites and skill-rank prerequisites go here.
//   • `prereqText` is DISPLAYED and never enforced. HERITAGE prerequisites live here — there is no
//     `{ kind: 'heritage' }` prereq, and forcing one through the ancestry kind would refuse legal
//     picks. So do class-feature prerequisites, "1st level only" restrictions, and anything else the
//     structured form cannot express.
//   • Ancestry scoping rides on the `ancestry` FIELD, not on a duplicate `{ kind: 'ancestry' }` prereq.
import type { PF2FeatFull, PF2HeritageDef, PF2Source } from '../defs';
import type { PF2AncestryDef, PF2BackgroundDef } from '../content';
import type { PF2AttributeKey } from '../model';

// ── Shapes ────────────────────────────────────────────────────────────────────────────────────────

/** An ancestry with the fields the seed shape omits. Extends `PF2AncestryDef` so it is a drop-in
 *  anywhere the seed is read today. */
export interface PF2AncestryFull extends PF2AncestryDef {
  /** The printed Attribute Flaw. Omitted for the ancestries that print none (Human, Orc, Tengu). */
  flaw?: PF2AttributeKey;
  /** Uncommon ancestries need GM permission in play; every Player Core 2 ancestry here is uncommon. */
  rarity: 'common' | 'uncommon';
  /** Ancestry-specific abilities beyond vision, as short mechanical lines. */
  abilities?: string[];
  source: PF2Source;
}

/** The alternative every ancestry offers to its printed boosts. Modelled once, as a rule, rather than
 *  copied onto sixteen entries — it is identical for all of them, and a per-ancestry copy invites the
 *  next author to "fix" one of them and desync the rest. */
export const PF2_ALTERNATE_BOOSTS_RULE =
  'Instead of an ancestry\'s printed attribute boosts and flaw, a character may take two free attribute boosts and no flaw.';

/** A background with the choice structure the seed flattens away. */
export interface PF2BackgroundFull extends PF2BackgroundDef {
  /** The real rule: ONE boost chosen from these, plus one free boost. `boosts` (inherited) keeps the
   *  seed's lossy `[first, 'free']` form so existing readers still work; this field is authoritative. */
  attributeChoice: PF2AttributeKey[];
  /** Every skill the background trains. `skill` (inherited) is the first of them. */
  skills: string[];
  /** Set when the trained skill is a choice rather than a fixed one. */
  skillNote?: string;
  /** Set when the Lore subcategory is chosen at build time rather than printed. */
  loreNote?: string;
  /** Every skill feat granted. `feat` (inherited) is the first of them. */
  feats: string[];
  source: PF2Source;
}

// ══ ANCESTRIES ════════════════════════════════════════════════════════════════════════════════════
// HP / size / speed / boosts / flaw / languages / traits / vision as printed. Each ancestry also gets
// additional languages equal to a positive Intelligence modifier; that is a universal rule, not a
// per-ancestry fact, so it is not repeated on every entry.

export const PF2_ANCESTRIES_FULL: PF2AncestryFull[] = [
  // ── Player Core ─────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Dwarf', hp: 10, size: 'Medium', speed: 20,
    boosts: ['CON', 'WIS', 'free'], flaw: 'CHA', rarity: 'common',
    languages: ['Common', 'Dwarven'], traits: ['Dwarf', 'Humanoid'], senses: 'Darkvision',
    heritages: ['Ancient-Blooded Dwarf', 'Death Warden Dwarf', 'Forge Dwarf', 'Rock Dwarf', 'Strong-Blooded Dwarf'],
    abilities: ['Clan Dagger: you begin play with one at no cost.'],
    summary: 'Short, stocky, and hard to move, with darkvision and a 20-foot Speed that armor does not slow further.',
    source: 'Player Core',
  },
  {
    name: 'Elf', hp: 6, size: 'Medium', speed: 30,
    boosts: ['DEX', 'INT', 'free'], flaw: 'CON', rarity: 'common',
    languages: ['Common', 'Elven'], traits: ['Elf', 'Humanoid'], senses: 'Low-light vision',
    heritages: ['Ancient Elf', 'Arctic Elf', 'Cavern Elf', 'Seer Elf', 'Whisper Elf', 'Woodland Elf'],
    summary: 'Long-lived and quick, with a 30-foot Speed and low-light vision, but frailer than most ancestries.',
    source: 'Player Core',
  },
  {
    name: 'Gnome', hp: 8, size: 'Small', speed: 25,
    boosts: ['CON', 'CHA', 'free'], flaw: 'STR', rarity: 'common',
    languages: ['Common', 'Fey', 'Gnomish'], traits: ['Gnome', 'Humanoid'], senses: 'Low-light vision',
    heritages: ['Chameleon Gnome', 'Fey-touched Gnome', 'Sensate Gnome', 'Umbral Gnome', 'Wellspring Gnome'],
    summary: 'Small, curious, fey-touched folk with low-light vision and a strong pull toward innate magic.',
    source: 'Player Core',
  },
  {
    name: 'Goblin', hp: 6, size: 'Small', speed: 25,
    boosts: ['DEX', 'CHA', 'free'], flaw: 'WIS', rarity: 'common',
    languages: ['Common', 'Goblin'], traits: ['Goblin', 'Humanoid'], senses: 'Darkvision',
    heritages: ['Charhide Goblin', 'Irongut Goblin', 'Razortooth Goblin', 'Snow Goblin', 'Unbreakable Goblin'],
    summary: 'Small, fast-moving survivors with darkvision, an appetite for fire, and very little caution.',
    source: 'Player Core',
  },
  {
    name: 'Halfling', hp: 6, size: 'Small', speed: 25,
    boosts: ['DEX', 'WIS', 'free'], flaw: 'STR', rarity: 'common',
    languages: ['Common', 'Halfling'], traits: ['Halfling', 'Humanoid'], senses: 'Keen Eyes',
    heritages: ['Gutsy Halfling', 'Hillock Halfling', 'Jinxed Halfling', 'Nomadic Halfling', 'Twilight Halfling', 'Wildwood Halfling'],
    abilities: ['Keen Eyes: +2 circumstance bonus to Seek a creature within 30 feet, and the flat check to target a concealed or hidden creature that close drops to 3 or 9.'],
    summary: 'Small, lucky, and stubbornly cheerful, with keen eyes rather than special vision.',
    source: 'Player Core',
  },
  {
    name: 'Human', hp: 8, size: 'Medium', speed: 25,
    boosts: ['free', 'free'], rarity: 'common',
    languages: ['Common'], traits: ['Human', 'Humanoid'],
    heritages: ['Skilled Human', 'Versatile Human'],
    summary: 'The most adaptable ancestry: two free boosts, no flaw, and heritages that simply hand back feats and skills.',
    source: 'Player Core',
  },
  {
    name: 'Leshy', hp: 8, size: 'Small', speed: 25,
    boosts: ['CON', 'WIS', 'free'], flaw: 'INT', rarity: 'common',
    languages: ['Common', 'Fey'], traits: ['Leshy', 'Plant'], senses: 'Low-light vision',
    heritages: ['Cactus Leshy', 'Fruit Leshy', 'Fungus Leshy', 'Gourd Leshy', 'Leaf Leshy', 'Lotus Leshy', 'Root Leshy', 'Seaweed Leshy', 'Vine Leshy'],
    abilities: [
      'Plant Nourishment: you draw sustenance from water, sunlight, and minerals rather than food.',
      'You are a plant, not a humanoid, and so are affected by effects that target plants.',
    ],
    summary: 'Small plant creatures given form by primal spirits; they photosynthesise instead of eating.',
    source: 'Player Core',
  },
  {
    name: 'Orc', hp: 10, size: 'Medium', speed: 25,
    // Two free boosts and NO flaw, as printed. Not `['STR','free','free']` — see the header note.
    boosts: ['free', 'free'], rarity: 'common',
    languages: ['Common', 'Orcish'], traits: ['Humanoid', 'Orc'], senses: 'Darkvision',
    heritages: ['Badlands Orc', 'Battle-Ready Orc', 'Deep Orc', 'Grave Orc', 'Hold-Scarred Orc', 'Rainfall Orc', 'Winter Orc'],
    summary: 'Tough, darkvision-bearing warriors with the highest ancestry Hit Points and two free boosts.',
    source: 'Player Core',
  },

  // ── Player Core 2 (all uncommon) ────────────────────────────────────────────────────────────────
  {
    name: 'Catfolk', hp: 8, size: 'Medium', speed: 25,
    boosts: ['DEX', 'CHA', 'free'], flaw: 'WIS', rarity: 'uncommon',
    languages: ['Amurrun', 'Common'], traits: ['Catfolk', 'Humanoid', 'Uncommon'], senses: 'Low-light vision',
    heritages: ['Clawed Catfolk', 'Hunting Catfolk', 'Jungle Catfolk', 'Liminal Catfolk', 'Nine Lives Catfolk', 'Sharp-Eared Catfolk', 'Winter Catfolk'],
    abilities: ['Land on Your Feet: you take no damage from falling and land upright.'],
    summary: 'Agile, sociable, and famously hard to kill by accident; their feat list is built around rerolls and luck.',
    source: 'Player Core 2',
  },
  {
    name: 'Hobgoblin', hp: 8, size: 'Medium', speed: 25,
    boosts: ['CON', 'INT', 'free'], flaw: 'WIS', rarity: 'uncommon',
    languages: ['Common', 'Goblin'], traits: ['Hobgoblin', 'Humanoid', 'Uncommon'], senses: 'Darkvision',
    heritages: ['Elfbane Hobgoblin', 'Runtboss Hobgoblin', 'Shortshanks Hobgoblin', 'Smokeworker Hobgoblin', 'Warmarch Hobgoblin', 'Warrenbred Hobgoblin'],
    summary: 'Disciplined, darkvision-bearing tacticians whose feats reward fighting in formation.',
    source: 'Player Core 2',
  },
  {
    name: 'Kholo', hp: 8, size: 'Medium', speed: 25,
    boosts: ['STR', 'INT', 'free'], flaw: 'WIS', rarity: 'uncommon',
    languages: ['Common', 'Kholo'], traits: ['Humanoid', 'Kholo', 'Uncommon'], senses: 'Low-light vision',
    heritages: ['Ant Kholo', 'Cave Kholo', 'Dog Kholo', 'Great Kholo', 'Sweetbreath Kholo', 'Winter Kholo', 'Witch Kholo'],
    abilities: ['Bite: a jaws unarmed attack dealing 1d6 piercing damage, in the brawling group.'],
    summary: 'Strong, clan-minded hunters with a natural bite and a feat list leaning on scent and pack tactics.',
    source: 'Player Core 2',
  },
  {
    name: 'Kobold', hp: 6, size: 'Small', speed: 25,
    boosts: ['DEX', 'CHA', 'free'], flaw: 'CON', rarity: 'uncommon',
    languages: ['Common', 'Sakvroth'], traits: ['Humanoid', 'Kobold', 'Uncommon'], senses: 'Darkvision',
    heritages: ['Cavernstalker Kobold', 'Dragonscaled Kobold', 'Elementheart Kobold', 'Spellhorn Kobold', 'Strongjaw Kobold', 'Tunnelflood Kobold', 'Venomtail Kobold'],
    summary: 'Small, fragile, darkvision-bearing schemers who lean on snares, cover, and numbers.',
    source: 'Player Core 2',
  },
  {
    name: 'Lizardfolk', hp: 8, size: 'Medium', speed: 25,
    boosts: ['STR', 'WIS', 'free'], flaw: 'INT', rarity: 'uncommon',
    languages: ['Common', 'Iruxi'], traits: ['Humanoid', 'Lizardfolk', 'Uncommon'],
    heritages: ['Cliffscale Lizardfolk', 'Cloudleaper Lizardfolk', 'Frilled Lizardfolk', 'Sandstrider Lizardfolk', 'Unseen Lizardfolk', 'Wetlander Lizardfolk', 'Woodstalker Lizardfolk'],
    abilities: [
      'Aquatic Adaptation: you can hold your breath far longer than most creatures.',
      'Claws: an unarmed attack dealing 1d4 slashing damage, with agile and finesse.',
    ],
    summary: 'Strong, patient reptilian folk with natural claws and a strong swimming and climbing feat line.',
    source: 'Player Core 2',
  },
  {
    name: 'Ratfolk', hp: 6, size: 'Small', speed: 25,
    boosts: ['DEX', 'INT', 'free'], flaw: 'STR', rarity: 'uncommon',
    languages: ['Common', 'Ysoki'], traits: ['Humanoid', 'Ratfolk', 'Uncommon'], senses: 'Low-light vision',
    heritages: ['Deep Rat', 'Desert Rat', 'Longsnout Rat', 'Sewer Rat', 'Shadow Rat', 'Snow Rat', 'Tunnel Rat'],
    abilities: ['Sharp Teeth: a jaws unarmed attack dealing 1d4 piercing damage, in the brawling group.'],
    summary: 'Small, clever, communal folk whose feats revolve around carrying capacity, tinkering, and crowding.',
    source: 'Player Core 2',
  },
  {
    name: 'Tengu', hp: 6, size: 'Medium', speed: 25,
    // Two boosts and no flaw, as printed — the only Player Core 2 ancestry with that line.
    boosts: ['DEX', 'free'], rarity: 'uncommon',
    languages: ['Common', 'Tengu'], traits: ['Humanoid', 'Tengu', 'Uncommon'], senses: 'Low-light vision',
    heritages: ['Dogtooth Tengu', 'Jinxed Tengu', 'Mountainkeeper Tengu', 'Skyborn Tengu', 'Stormtossed Tengu', 'Taloned Tengu', 'Wavediver Tengu'],
    abilities: [
      'Sharp Beak: a beak unarmed attack dealing 1d6 piercing damage, in the brawling group.',
      'Simple Weapon Expertise: at 5th level you gain expert proficiency in the simple weapons and unarmed attacks you are already trained in.',
    ],
    summary: 'Corvid folk with a natural beak, an ear for languages, and a feat list built around luck and flight.',
    source: 'Player Core 2',
  },
  {
    name: 'Tripkee', hp: 6, size: 'Small', speed: 25,
    boosts: ['DEX', 'WIS', 'free'], flaw: 'STR', rarity: 'uncommon',
    languages: ['Common', 'Tripkee'], traits: ['Humanoid', 'Tripkee', 'Uncommon'], senses: 'Low-light vision',
    heritages: ['Poisonhide Tripkee', 'Riverside Tripkee', 'Snaptongue Tripkee', 'Stickytoe Tripkee', 'Thickskin Tripkee', 'Windweb Tripkee'],
    abilities: ['Natural Climber: you gain the Combat Climber skill feat.'],
    summary: 'Small amphibious folk who leap and climb far better than their size suggests.',
    source: 'Player Core 2',
  },
];
