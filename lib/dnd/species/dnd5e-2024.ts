// lib/dnd/species/dnd5e-2024.ts — the 10 Player's Handbook (2024) species (Slice 4).
//
// The 2014-vs-2024 trap this data exists to make impossible: in 2024 a **species grants NO ability
// score increases**. All the ability math moved to backgrounds (see ../backgrounds). A species gives
// size, speed, creature type, and traits — never a +2 Dex. The `Species` type deliberately has no
// ability field, and `species.test.ts` asserts no species object smuggles one in under any name.
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

export type SpeciesSize = 'Small' | 'Medium' | 'Small or Medium';

export interface SpeciesTrait {
  name: string;
  text: string;
}

export interface Species {
  key: string;
  name: string;
  system: 'dnd5e-2024';
  /** Almost always 'Humanoid' in the PHB. */
  creatureType: string;
  size: SpeciesSize;
  /** Walking speed in feet. */
  speed: number;
  /** Darkvision range in feet, when the species has it. */
  darkvision?: number;
  /** Named sub-lineage choices (Elf lineage, Tiefling legacy…), for the builder to offer. */
  lineages?: string[];
  /** Natural-armor unarmored AC formula, when the species grants one (e.g. Rangor rocklike scales
   *  13 + DEX). `base` is the flat value; the ability modifier is added by the ledger. Best-of with any
   *  other unarmored formula the character has. */
  naturalArmor?: { base: number; ability: AbilityKey };
  /** Present only for homebrew species — who authored it, so the picker can badge it custom. */
  custom?: { authorName?: string };
  traits: SpeciesTrait[];
}

export const SPECIES_2024: Species[] = [
  {
    key: 'aasimar', name: 'Aasimar', system: 'dnd5e-2024', creatureType: 'Humanoid',
    size: 'Small or Medium', speed: 30, darkvision: 60,
    traits: [
      { name: 'Celestial Resistance', text: 'You have Resistance to Necrotic damage and Radiant damage.' },
      { name: 'Darkvision', text: 'You can see in Dim Light within 60 feet as if it were Bright Light, and in Darkness as if it were Dim Light (in shades of gray).' },
      { name: 'Healing Hands', text: 'As a Magic action, you touch a creature and roll a number of d4s equal to your Proficiency Bonus; it regains that many Hit Points. Once used, you can\'t do so again until you finish a Long Rest.' },
      { name: 'Light Bearer', text: 'You know the Light cantrip; Charisma is your spellcasting ability for it.' },
      { name: 'Celestial Revelation', text: 'At level 3 you can transform as a Bonus Action, choosing Heavenly Wings, Inner Radiance, or Necrotic Shroud, each adding an extra-damage rider once per turn while active (Prof. Bonus per Long Rest).' },
    ],
  },
  {
    key: 'dragonborn', name: 'Dragonborn', system: 'dnd5e-2024', creatureType: 'Humanoid',
    size: 'Medium', speed: 30, darkvision: 60,
    lineages: ['Black', 'Blue', 'Brass', 'Bronze', 'Copper', 'Gold', 'Green', 'Red', 'Silver', 'White'],
    traits: [
      { name: 'Draconic Ancestry', text: 'You choose a kind of dragon, which sets the damage type for your Breath Weapon and Damage Resistance.' },
      { name: 'Breath Weapon', text: 'When you take the Attack action, you can replace one attack with a breath of energy (15-ft Cone or 30-ft Line, Dex save, 1d10 rising to 4d10 at levels 5/11/17). Uses equal to your Proficiency Bonus per Long Rest.' },
      { name: 'Damage Resistance', text: 'You have Resistance to the damage type of your Draconic Ancestry.' },
      { name: 'Darkvision', text: 'You have Darkvision with a range of 60 feet.' },
      { name: 'Draconic Flight', text: 'At level 5, as a Bonus Action you sprout spectral wings for 10 minutes, gaining a Fly Speed equal to your Speed (once per Long Rest).' },
    ],
  },
  {
    key: 'dwarf', name: 'Dwarf', system: 'dnd5e-2024', creatureType: 'Humanoid',
    size: 'Medium', speed: 30, darkvision: 120,
    traits: [
      { name: 'Dwarven Resilience', text: 'You have Resistance to Poison damage and Advantage on saving throws you make to avoid or end the Poisoned condition.' },
      { name: 'Dwarven Toughness', text: 'Your Hit Point maximum increases by 1, and it increases by 1 again whenever you gain a level.' },
      { name: 'Stonecunning', text: 'As a Bonus Action, you gain Tremorsense with a range of 60 feet for 10 minutes, but only to detect vibrations through stone. Uses equal to your Proficiency Bonus per Long Rest.' },
      { name: 'Darkvision', text: 'You have Darkvision with a range of 120 feet.' },
    ],
  },
  {
    key: 'elf', name: 'Elf', system: 'dnd5e-2024', creatureType: 'Humanoid',
    size: 'Medium', speed: 30, darkvision: 60,
    lineages: ['Drow', 'High Elf', 'Wood Elf'],
    traits: [
      { name: 'Elven Lineage', text: 'You choose Drow, High Elf, or Wood Elf. Each grants a cantrip now and additional spells at levels 3 and 5, plus a lineage benefit (extra Darkvision, a swapped cantrip, or +5 Speed).' },
      { name: 'Fey Ancestry', text: 'You have Advantage on saving throws you make to avoid or end the Charmed condition.' },
      { name: 'Keen Senses', text: 'You have proficiency in the Insight, Perception, or Survival skill (your choice).' },
      { name: 'Trance', text: 'You don\'t need to sleep; a 4-hour Long Rest suffices, during which you remain conscious in a meditative trance.' },
      { name: 'Darkvision', text: 'You have Darkvision with a range of 60 feet.' },
    ],
  },
  {
    key: 'gnome', name: 'Gnome', system: 'dnd5e-2024', creatureType: 'Humanoid',
    size: 'Small', speed: 30, darkvision: 60,
    lineages: ['Forest Gnome', 'Rock Gnome'],
    traits: [
      { name: 'Gnomish Cunning', text: 'You have Advantage on Intelligence, Wisdom, and Charisma saving throws.' },
      { name: 'Gnomish Lineage', text: 'You choose Forest Gnome (the Minor Illusion cantrip and Speak with Animals a number of times per Long Rest) or Rock Gnome (the Mending and Prestidigitation cantrips, and a Tiny clockwork device).' },
      { name: 'Darkvision', text: 'You have Darkvision with a range of 60 feet.' },
    ],
  },
  {
    key: 'goliath', name: 'Goliath', system: 'dnd5e-2024', creatureType: 'Humanoid',
    size: 'Medium', speed: 35,
    lineages: ['Cloud', 'Fire', 'Frost', 'Hill', 'Stone', 'Storm'],
    traits: [
      { name: 'Giant Ancestry', text: 'You choose a supernatural boon from your giant ancestors (e.g. Cloud\'s teleport, Fire\'s bonus fire damage, Frost\'s slowing strike), usable Proficiency Bonus times per Long Rest.' },
      { name: 'Large Form', text: 'At level 5, as a Bonus Action you can become Large for 10 minutes if you have room, gaining Advantage on Strength checks and +10 Speed (once per Long Rest).' },
      { name: 'Powerful Build', text: 'You have Advantage on any ability check you make to end the Grappled condition, and you count as one size larger for carrying capacity and lifting/dragging.' },
    ],
  },
  {
    key: 'halfling', name: 'Halfling', system: 'dnd5e-2024', creatureType: 'Humanoid',
    size: 'Small', speed: 30,
    traits: [
      { name: 'Brave', text: 'You have Advantage on saving throws you make to avoid or end the Frightened condition.' },
      { name: 'Halfling Nimbleness', text: 'You can move through the space of any creature that is a size larger than you, though you can\'t stop in that space.' },
      { name: 'Luck', text: 'When you roll a 1 on the d20 of a D20 Test, you can reroll the die and must use the new roll.' },
      { name: 'Naturally Stealthy', text: 'You can take the Hide action even when you are obscured only by a creature that is at least one size larger than you.' },
    ],
  },
  {
    key: 'human', name: 'Human', system: 'dnd5e-2024', creatureType: 'Humanoid',
    size: 'Small or Medium', speed: 30,
    traits: [
      { name: 'Resourceful', text: 'You gain Heroic Inspiration whenever you finish a Long Rest.' },
      { name: 'Skillful', text: 'You gain proficiency in one skill of your choice.' },
      { name: 'Versatile', text: 'You gain an Origin feat of your choice (Alert, Magic Initiate, and so on).' },
    ],
  },
  {
    key: 'orc', name: 'Orc', system: 'dnd5e-2024', creatureType: 'Humanoid',
    size: 'Medium', speed: 30, darkvision: 120,
    traits: [
      { name: 'Adrenaline Rush', text: 'You can take the Dash action as a Bonus Action and gain Temporary Hit Points equal to your Proficiency Bonus. Uses equal to your Proficiency Bonus per Short or Long Rest.' },
      { name: 'Relentless Endurance', text: 'When you are reduced to 0 Hit Points but not killed outright, you can drop to 1 Hit Point instead. Once used, you can\'t do so again until you finish a Long Rest.' },
      { name: 'Darkvision', text: 'You have Darkvision with a range of 120 feet.' },
    ],
  },
  {
    key: 'tiefling', name: 'Tiefling', system: 'dnd5e-2024', creatureType: 'Humanoid',
    size: 'Small or Medium', speed: 30, darkvision: 60,
    lineages: ['Abyssal', 'Chthonic', 'Infernal'],
    traits: [
      { name: 'Fiendish Legacy', text: 'You choose Abyssal, Chthonic, or Infernal. Each grants the Thaumaturgy cantrip at level 1, plus a damage Resistance and additional spells at levels 3 and 5.' },
      { name: 'Otherworldly Presence', text: 'You know the Thaumaturgy cantrip; your spellcasting ability for it is the one chosen for your Fiendish Legacy.' },
      { name: 'Darkvision', text: 'You have Darkvision with a range of 60 feet.' },
    ],
  },
  // ── Homebrew (Area H) — Rangor, the galaxy's "Unstoppable Force" (Jack's ancestry), a selectable 2024
  //    custom species. Full 2024 shape: NO ability increases (those come from the background); size, speed,
  //    traits + a natural-armor formula the ledger applies. Flagged `custom` so the picker badges it. ──────
  {
    key: 'rangor', name: 'Rangor', system: 'dnd5e-2024', creatureType: 'Humanoid',
    size: 'Medium', speed: 30,
    naturalArmor: { base: 13, ability: 'dex' },
    custom: { authorName: 'Jacob' },
    traits: [
      { name: 'Rocklike Scales (Natural Armor)', text: 'While you are not wearing armor, your base Armor Class equals 13 + your Dexterity modifier (use whichever unarmored formula is higher if you have another).' },
      { name: 'Living Momentum', text: 'When you hit with an attack after moving at least 15 feet in a straight line toward the target, choose one: push it 15 feet; knock it Prone (Strength save, DC 8 + your Strength modifier + your Proficiency Bonus); or deal extra damage equal to your Strength modifier.' },
      { name: 'Powerful Build', text: 'You count as one size larger for carrying capacity and for what you can push, drag, or lift.' },
      { name: 'Unstoppable Force', text: 'A number of times equal to your Proficiency Bonus per Long Rest, when an effect would reduce your Speed or move you against your will, you can ignore it.' },
    ],
  },
];

/** Resolve a 2024 species by key. Scoped to dnd5e-2024 BY CONSTRUCTION (this module only holds 2024
 *  species); callers gate on the sheet's system so a non-2024 sheet never receives one. When another
 *  system gains species, add a system-keyed dispatcher (see the class registry) rather than widening
 *  this — a bare `human`/`elf` key must resolve to the caller's system, never leak across (Ground
 *  Rule 1; `system-integrity.test.ts` guards the invariant). */
export function findSpecies(key: string): Species | undefined {
  return SPECIES_2024.find((s) => s.key === key);
}
