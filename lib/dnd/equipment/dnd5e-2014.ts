// lib/dnd/equipment/dnd5e-2014.ts — the D&D 5e (2014 edition) weapon, armour and gear tables.
//
// LICENSING BASIS. Every number here comes from the **SRD 5.1, released by Wizards of the Coast
// under CC-BY-4.0**, cross-checked item by item against Wizards' own free 2014 Basic Rules. Nothing
// was taken from a licensed commercial platform (D&D Beyond, Roll20) or from an aggregator with a
// contested redistribution basis. Names and numbers are mechanical facts; all descriptive prose is
// our own paraphrase.
//
// NEVER-INVENT RULE: an item whose cost, weight or properties could not be confirmed in a clean
// source is OMITTED, not guessed. See EQUIPMENT_2014_STATUS at the bottom for what that excludes.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE 2014 HEADLINE IS THE ABSENCE OF WEAPON MASTERY.
//
// `WeaponDef2014` has **no `mastery` field, deliberately**. Mastery properties (Cleave, Graze, Nick,
// Push, Sap, Slow, Topple, Vex) are a 2024 invention; a 2014 Greatsword has no Graze and a 2014
// Longsword has no Sap. Because the field does not exist on the type, a 2024 value cannot be pasted
// into a 2014 row by accident — the compiler stops it.
//
// The 2014 tables were re-derived from source rather than copied from ./dnd5e-2024.ts, and the
// differences are real. Confirmed 2014-vs-2024 divergences captured below:
//   · **Net** exists in 2014 (martial ranged, no damage, Special) and was removed in 2024.
//   · **Musket** and **Pistol** are 2024 PHB weapons; they are not in the 2014 SRD weapon table.
//   · **Lance**: 2014 is 1d12 with Reach + Special; 2024 is 1d10 Heavy/Reach/Two-Handed.
//   · **Trident**: 2014 is 1d6 / Versatile (1d8); 2024 is 1d8 / Versatile (1d10).
//   · **Warhammer** weighs 2 lb in 2014 (5 lb in 2024). **Maul** is 10 lb in 2014 (also 10 in 2024).
//   · **Dart** weighs 1/4 lb in both, but 2014 lacks the mastery column entirely.
//   · Armour is unchanged across the two editions — verified, not assumed.

export type WeaponCategory2014 = 'simple' | 'martial';
export type WeaponRangeKind2014 = 'melee' | 'ranged';
export type ArmorCategory2014 = 'light' | 'medium' | 'heavy' | 'shield';
export type DamageType2014 = 'bludgeoning' | 'piercing' | 'slashing';

export interface WeaponDef2014 {
  name: string;
  category: WeaponCategory2014;
  kind: WeaponRangeKind2014;
  /** e.g. '1d8'. The Blowgun deals a flat 1. `null` for the Net, which deals no damage. */
  damage: string | null;
  /** `null` for the Net. */
  damageType: DamageType2014 | null;
  /**
   * 2014 weapon properties only: Ammunition, Finesse, Heavy, Light, Loading, Range, Reach, Special,
   * Thrown, Two-Handed, Versatile. There is NO mastery property in 2014 — see the header.
   */
  properties: string[];
  /** Weight in pounds. */
  weight: number;
  /** Cost in gold pieces (fractional for sp/cp items). */
  cost: number;
  /** The cost exactly as the table prints it, so the sp/cp denomination is never lost to rounding. */
  costText: string;
  source: 'SRD 5.1' | 'Basic Rules 2014';
}

const SRD = 'SRD 5.1' as const;

const w = (
  name: string, category: WeaponCategory2014, kind: WeaponRangeKind2014,
  damage: string | null, damageType: DamageType2014 | null, properties: string[],
  weight: number, cost: number, costText: string,
): WeaponDef2014 => ({ name, category, kind, damage, damageType, properties, weight, cost, costText, source: SRD });

export const WEAPONS_2014: WeaponDef2014[] = [
  // ── Simple melee ──
  w('Club', 'simple', 'melee', '1d4', 'bludgeoning', ['Light'], 2, 0.1, '1 sp'),
  w('Dagger', 'simple', 'melee', '1d4', 'piercing', ['Finesse', 'Light', 'Thrown (range 20/60)'], 1, 2, '2 gp'),
  w('Greatclub', 'simple', 'melee', '1d8', 'bludgeoning', ['Two-Handed'], 10, 0.2, '2 sp'),
  w('Handaxe', 'simple', 'melee', '1d6', 'slashing', ['Light', 'Thrown (range 20/60)'], 2, 5, '5 gp'),
  w('Javelin', 'simple', 'melee', '1d6', 'piercing', ['Thrown (range 30/120)'], 2, 0.5, '5 sp'),
  w('Light Hammer', 'simple', 'melee', '1d4', 'bludgeoning', ['Light', 'Thrown (range 20/60)'], 2, 2, '2 gp'),
  w('Mace', 'simple', 'melee', '1d6', 'bludgeoning', [], 4, 5, '5 gp'),
  w('Quarterstaff', 'simple', 'melee', '1d6', 'bludgeoning', ['Versatile (1d8)'], 4, 0.2, '2 sp'),
  w('Sickle', 'simple', 'melee', '1d4', 'slashing', ['Light'], 2, 1, '1 gp'),
  w('Spear', 'simple', 'melee', '1d6', 'piercing', ['Thrown (range 20/60)', 'Versatile (1d8)'], 3, 1, '1 gp'),
  // ── Simple ranged ──
  w('Crossbow, Light', 'simple', 'ranged', '1d8', 'piercing', ['Ammunition (range 80/320)', 'Loading', 'Two-Handed'], 5, 25, '25 gp'),
  w('Dart', 'simple', 'ranged', '1d4', 'piercing', ['Finesse', 'Thrown (range 20/60)'], 0.25, 0.05, '5 cp'),
  w('Shortbow', 'simple', 'ranged', '1d6', 'piercing', ['Ammunition (range 80/320)', 'Two-Handed'], 2, 25, '25 gp'),
  w('Sling', 'simple', 'ranged', '1d4', 'bludgeoning', ['Ammunition (range 30/120)'], 0, 0.1, '1 sp'),
  // ── Martial melee ──
  w('Battleaxe', 'martial', 'melee', '1d8', 'slashing', ['Versatile (1d10)'], 4, 10, '10 gp'),
  w('Flail', 'martial', 'melee', '1d8', 'bludgeoning', [], 2, 10, '10 gp'),
  w('Glaive', 'martial', 'melee', '1d10', 'slashing', ['Heavy', 'Reach', 'Two-Handed'], 6, 20, '20 gp'),
  w('Greataxe', 'martial', 'melee', '1d12', 'slashing', ['Heavy', 'Two-Handed'], 7, 30, '30 gp'),
  w('Greatsword', 'martial', 'melee', '2d6', 'slashing', ['Heavy', 'Two-Handed'], 6, 50, '50 gp'),
  w('Halberd', 'martial', 'melee', '1d10', 'slashing', ['Heavy', 'Reach', 'Two-Handed'], 6, 20, '20 gp'),
  w('Lance', 'martial', 'melee', '1d12', 'piercing', ['Reach', 'Special'], 6, 10, '10 gp'),
  w('Longsword', 'martial', 'melee', '1d8', 'slashing', ['Versatile (1d10)'], 3, 15, '15 gp'),
  w('Maul', 'martial', 'melee', '2d6', 'bludgeoning', ['Heavy', 'Two-Handed'], 10, 10, '10 gp'),
  w('Morningstar', 'martial', 'melee', '1d8', 'piercing', [], 4, 15, '15 gp'),
  w('Pike', 'martial', 'melee', '1d10', 'piercing', ['Heavy', 'Reach', 'Two-Handed'], 18, 5, '5 gp'),
  w('Rapier', 'martial', 'melee', '1d8', 'piercing', ['Finesse'], 2, 25, '25 gp'),
  w('Scimitar', 'martial', 'melee', '1d6', 'slashing', ['Finesse', 'Light'], 3, 25, '25 gp'),
  w('Shortsword', 'martial', 'melee', '1d6', 'piercing', ['Finesse', 'Light'], 2, 10, '10 gp'),
  w('Trident', 'martial', 'melee', '1d6', 'piercing', ['Thrown (range 20/60)', 'Versatile (1d8)'], 4, 5, '5 gp'),
  w('War Pick', 'martial', 'melee', '1d8', 'piercing', [], 2, 5, '5 gp'),
  w('Warhammer', 'martial', 'melee', '1d8', 'bludgeoning', ['Versatile (1d10)'], 2, 15, '15 gp'),
  w('Whip', 'martial', 'melee', '1d4', 'slashing', ['Finesse', 'Reach'], 3, 2, '2 gp'),
  // ── Martial ranged ──
  w('Blowgun', 'martial', 'ranged', '1', 'piercing', ['Ammunition (range 25/100)', 'Loading'], 1, 10, '10 gp'),
  w('Crossbow, Hand', 'martial', 'ranged', '1d6', 'piercing', ['Ammunition (range 30/120)', 'Light', 'Loading'], 3, 75, '75 gp'),
  w('Crossbow, Heavy', 'martial', 'ranged', '1d10', 'piercing', ['Ammunition (range 100/400)', 'Heavy', 'Loading', 'Two-Handed'], 18, 50, '50 gp'),
  w('Longbow', 'martial', 'ranged', '1d8', 'piercing', ['Ammunition (range 150/600)', 'Heavy', 'Two-Handed'], 2, 50, '50 gp'),
  // The Net deals no damage: a hit restrains a Large or smaller creature until it is freed.
  w('Net', 'martial', 'ranged', null, null, ['Special', 'Thrown (range 5/15)'], 3, 1, '1 gp'),
];

/** What each 2014 weapon property does, paraphrased. No mastery properties exist in 2014. */
export const WEAPON_PROPERTIES_2014: { key: string; effect: string }[] = [
  { key: 'Ammunition', effect: 'Requires ammunition to fire; you draw a piece as part of the attack, and can recover about half your spent ammunition after a fight.' },
  { key: 'Finesse', effect: 'Choose Strength or Dexterity for both the attack and damage rolls — the same ability for both.' },
  { key: 'Heavy', effect: 'Small creatures have disadvantage on attack rolls with it, because of its size and bulk.' },
  { key: 'Light', effect: 'Small and easy to handle, which makes it a legal choice for two-weapon fighting.' },
  { key: 'Loading', effect: 'You can fire only one piece of ammunition per action, bonus action or reaction, no matter how many attacks you would otherwise get.' },
  { key: 'Range', effect: 'Gives a normal and a long range in feet; attacks beyond the normal range have disadvantage, and none are possible past the long range.' },
  { key: 'Reach', effect: 'Adds 5 feet to your reach for attacks and for opportunity attacks with it.' },
  { key: 'Special', effect: 'The weapon has a rule of its own — the Lance and the Net each carry one.' },
  { key: 'Thrown', effect: 'Can be thrown as a ranged attack, using the same ability modifier as a melee attack with it.' },
  { key: 'Two-Handed', effect: 'Requires both hands when you attack with it.' },
  { key: 'Versatile', effect: 'Usable one- or two-handed; the larger die in parentheses applies when used two-handed.' },
];

export interface ArmorDef2014 {
  name: string;
  category: ArmorCategory2014;
  /** Base AC before any ability modifier. A shield's is its flat bonus. */
  baseAC: number;
  /** Maximum DEX added: null = uncapped (light), 2 = medium, 0 = heavy. */
  dexCap: number | null;
  /** Minimum Strength score, or null. Falling short costs 10 feet of speed. */
  strengthReq: number | null;
  stealthDisadvantage: boolean;
  weight: number;
  cost: number;
  costText: string;
  source: 'SRD 5.1' | 'Basic Rules 2014';
}

const a = (
  name: string, category: ArmorCategory2014, baseAC: number, dexCap: number | null,
  strengthReq: number | null, stealthDisadvantage: boolean, weight: number, cost: number, costText: string,
): ArmorDef2014 => ({ name, category, baseAC, dexCap, strengthReq, stealthDisadvantage, weight, cost, costText, source: SRD });

/** Verified against the SRD 5.1 armour table — identical to 2024's values, but re-derived, not copied. */
export const ARMOR_2014: ArmorDef2014[] = [
  a('Padded', 'light', 11, null, null, true, 8, 5, '5 gp'),
  a('Leather', 'light', 11, null, null, false, 10, 10, '10 gp'),
  a('Studded Leather', 'light', 12, null, null, false, 13, 45, '45 gp'),
  a('Hide', 'medium', 12, 2, null, false, 12, 10, '10 gp'),
  a('Chain Shirt', 'medium', 13, 2, null, false, 20, 50, '50 gp'),
  a('Scale Mail', 'medium', 14, 2, null, true, 45, 50, '50 gp'),
  a('Breastplate', 'medium', 14, 2, null, false, 20, 400, '400 gp'),
  a('Half Plate', 'medium', 15, 2, null, true, 40, 750, '750 gp'),
  a('Ring Mail', 'heavy', 14, 0, null, true, 40, 30, '30 gp'),
  a('Chain Mail', 'heavy', 16, 0, 13, true, 55, 75, '75 gp'),
  a('Splint', 'heavy', 17, 0, 15, true, 60, 200, '200 gp'),
  a('Plate', 'heavy', 18, 0, 15, true, 65, 1500, '1,500 gp'),
  a('Shield', 'shield', 2, 0, null, false, 6, 10, '10 gp'),
];

export type GearCategory2014 = 'ammunition' | 'container' | 'consumable' | 'light' | 'gear' | 'clothing';

export interface GearDef2014 {
  name: string;
  category: GearCategory2014;
  cost: number;
  costText: string;
  /** Weight in pounds; 0 for items the table lists with no weight ('—'). */
  weight: number;
  /** Capacity or a one-line mechanical note, only where the table itself gives one. */
  note?: string;
  source: 'SRD 5.1' | 'Basic Rules 2014';
}

const g = (
  name: string, category: GearCategory2014, cost: number, costText: string, weight: number, note?: string,
): GearDef2014 => ({ name, category, cost, costText, weight, ...(note ? { note } : {}), source: SRD });

/** The SRD 5.1 Adventuring Gear table. Costs and weights verified item by item. */
export const GEAR_2014: GearDef2014[] = [
  // ── Ammunition (sold in the bundles the table prints) ──
  g('Arrows (20)', 'ammunition', 1, '1 gp', 1),
  g('Blowgun Needles (50)', 'ammunition', 1, '1 gp', 1),
  g('Crossbow Bolts (20)', 'ammunition', 1, '1 gp', 1.5),
  g('Sling Bullets (20)', 'ammunition', 0.04, '4 cp', 1.5),

  // ── Consumables and alchemical items ──
  g('Acid (vial)', 'consumable', 25, '25 gp', 1, 'Thrown as an improvised weapon at up to 20 feet; a hit deals 2d6 acid damage.'),
  g("Alchemist's Fire (flask)", 'consumable', 50, '50 gp', 1, 'Thrown at up to 20 feet; a hit sets the target alight for 1d4 fire damage each turn until the flames are put out.'),
  g('Antitoxin (vial)', 'consumable', 50, '50 gp', 0, 'Drinking it gives advantage on saving throws against poison for one hour.'),
  g('Holy Water (flask)', 'consumable', 25, '25 gp', 1, 'Thrown at up to 20 feet; a hit deals 2d6 radiant damage to a fiend or an undead.'),
  g('Oil (flask)', 'consumable', 0.1, '1 sp', 1, 'Can be thrown to douse a target, or poured to cover the ground; burning oil deals 5 fire damage.'),
  g('Poison, Basic (vial)', 'consumable', 100, '100 gp', 0, 'Coats one weapon or up to three pieces of ammunition for one minute.'),
  g('Potion of Healing', 'consumable', 50, '50 gp', 0.5, 'Drinking it restores 2d4 + 2 hit points.'),
  g('Rations (1 day)', 'consumable', 0.5, '5 sp', 2),

  // ── Light sources ──
  g('Candle', 'light', 0.01, '1 cp', 0, 'Burns for one hour, shedding bright light out to 5 feet.'),
  g('Lamp', 'light', 0.5, '5 sp', 1, 'Burns one flask of oil for six hours, shedding bright light out to 15 feet.'),
  g('Lantern, Bullseye', 'light', 10, '10 gp', 2, 'Burns one flask of oil for six hours, casting bright light in a 60-foot cone.'),
  g('Lantern, Hooded', 'light', 5, '5 gp', 2, 'Burns one flask of oil for six hours, shedding bright light out to 30 feet; the hood can dim it.'),
  g('Torch', 'light', 0.01, '1 cp', 1, 'Burns for one hour, shedding bright light out to 20 feet; a hit with it deals 1 fire damage.'),
  g('Tinderbox', 'gear', 0.5, '5 sp', 1, 'Lighting a torch with it takes an action; anything else takes a minute or more.'),

  // ── Containers ──
  g('Backpack', 'container', 2, '2 gp', 5, 'Holds 1 cubic foot / 30 pounds.'),
  g('Barrel', 'container', 2, '2 gp', 70, 'Holds 40 gallons of liquid or 4 cubic feet of solids.'),
  g('Basket', 'container', 0.4, '4 sp', 2, 'Holds 2 cubic feet / 40 pounds.'),
  g('Bucket', 'container', 0.05, '5 cp', 2, 'Holds 3 gallons of liquid or half a cubic foot of solids.'),
  g('Case, Crossbow Bolt', 'container', 1, '1 gp', 1, 'Holds 20 bolts.'),
  g('Case, Map or Scroll', 'container', 1, '1 gp', 1, 'Holds 10 sheets of paper or 5 of parchment.'),
  g('Chest', 'container', 5, '5 gp', 25, 'Holds 12 cubic feet / 300 pounds.'),
  g('Flask or Tankard', 'container', 0.02, '2 cp', 1, 'Holds 1 pint.'),
  g('Glass Bottle', 'container', 2, '2 gp', 2, 'Holds 1.5 pints.'),
  g('Jug or Pitcher', 'container', 0.02, '2 cp', 4, 'Holds 1 gallon.'),
  g('Pot, Iron', 'container', 2, '2 gp', 10, 'Holds 1 gallon.'),
  g('Pouch', 'container', 0.5, '5 sp', 1, 'Holds one-fifth of a cubic foot / 6 pounds.'),
  g('Quiver', 'container', 1, '1 gp', 1, 'Holds 20 arrows.'),
  g('Sack', 'container', 0.01, '1 cp', 0.5, 'Holds 1 cubic foot / 30 pounds.'),
  g('Vial', 'container', 1, '1 gp', 0, 'Holds 4 ounces of liquid.'),
  g('Waterskin', 'container', 0.2, '2 sp', 5, 'Holds 4 pints; the listed weight is for a full skin.'),

  // ── Clothing ──
  g('Clothes, Common', 'clothing', 0.5, '5 sp', 3),
  g("Clothes, Costume", 'clothing', 5, '5 gp', 4),
  g('Clothes, Fine', 'clothing', 15, '15 gp', 6),
  g("Clothes, Traveler's", 'clothing', 2, '2 gp', 4),
  g('Robes', 'clothing', 1, '1 gp', 4),

  // ── General adventuring gear ──
  g('Abacus', 'gear', 2, '2 gp', 2),
  g('Ball Bearings (bag of 1,000)', 'gear', 1, '1 gp', 2, 'Spilled across a 10-foot square; creatures crossing it save against falling prone.'),
  g('Bedroll', 'gear', 1, '1 gp', 7),
  g('Bell', 'gear', 1, '1 gp', 0),
  g('Blanket', 'gear', 0.5, '5 sp', 3),
  g('Block and Tackle', 'gear', 1, '1 gp', 5, 'Lets you hoist up to four times the weight you could lift unaided.'),
  g('Book', 'gear', 25, '25 gp', 5),
  g('Caltrops (bag of 20)', 'gear', 1, '1 gp', 2, 'Spread over a 5-foot square; a creature entering it risks 1 piercing damage and reduced speed.'),
  g('Chain (10 feet)', 'gear', 5, '5 gp', 10),
  g('Chalk (1 piece)', 'gear', 0.01, '1 cp', 0),
  g("Climber's Kit", 'gear', 25, '25 gp', 12, 'Pitons, boot tips, gloves and a harness; you can anchor yourself to stop a fall.'),
  g('Component Pouch', 'gear', 25, '25 gp', 2, 'Holds the material components for spells that have no listed cost.'),
  g('Crowbar', 'gear', 2, '2 gp', 5, 'Gives advantage on Strength checks where leverage helps.'),
  g('Fishing Tackle', 'gear', 1, '1 gp', 4),
  g('Grappling Hook', 'gear', 2, '2 gp', 4),
  g('Hammer', 'gear', 1, '1 gp', 3),
  g('Hourglass', 'gear', 25, '25 gp', 1),
  g('Hunting Trap', 'gear', 5, '5 gp', 25, 'A creature caught in its jaws takes 1d4 piercing damage and its speed drops to 0.'),
  g("Healer's Kit", 'gear', 5, '5 gp', 3, 'Ten uses; one use stabilises a dying creature without a Wisdom (Medicine) check.'),
  g('Ink (1 ounce bottle)', 'gear', 10, '10 gp', 0),
  g('Ink Pen', 'gear', 0.02, '2 cp', 0),
  g('Ladder (10-foot)', 'gear', 0.1, '1 sp', 25),
  g('Lock', 'gear', 10, '10 gp', 1, "Opening it without the key needs a successful Dexterity check with thieves' tools."),
  g('Magnifying Glass', 'gear', 100, '100 gp', 0, 'Gives advantage on checks to appraise or inspect fine detail; can start a fire in bright sunlight.'),
  g('Manacles', 'gear', 2, '2 gp', 6, 'Restrain a Small or Medium creature; escaping needs a Dexterity or Strength check.'),
  g('Mess Kit', 'gear', 0.2, '2 sp', 1),
  g('Mirror, Steel', 'gear', 5, '5 gp', 0.5),
  g("Miner's Pick", 'gear', 2, '2 gp', 10),
  g('Paper (one sheet)', 'gear', 0.2, '2 sp', 0),
  g('Parchment (one sheet)', 'gear', 0.1, '1 sp', 0),
  g('Perfume (vial)', 'gear', 5, '5 gp', 0),
  g('Piton', 'gear', 0.05, '5 cp', 0.25),
  g('Pole (10-foot)', 'gear', 0.05, '5 cp', 7),
  g('Ram, Portable', 'gear', 4, '4 gp', 35, 'Breaks down doors; a second person helping adds to the Strength check.'),
  g('Rope, Hempen (50 feet)', 'gear', 1, '1 gp', 10),
  g('Rope, Silk (50 feet)', 'gear', 10, '10 gp', 5),
  g('Sealing Wax', 'gear', 0.5, '5 sp', 0),
  g('Shovel', 'gear', 2, '2 gp', 5),
  g('Signal Whistle', 'gear', 0.05, '5 cp', 0),
  g('Signet Ring', 'gear', 5, '5 gp', 0),
  g('Sledgehammer', 'gear', 2, '2 gp', 10),
  g('Soap', 'gear', 0.02, '2 cp', 0),
  g('Spellbook', 'gear', 50, '50 gp', 3, "A wizard's blank-paged tome for recording spells."),
  g('Spikes, Iron (10)', 'gear', 1, '1 gp', 5),
  g('Spyglass', 'gear', 1000, '1,000 gp', 1, 'Objects viewed through it appear twice their size.'),
  g('Tent, Two-person', 'gear', 2, '2 gp', 20),
  g('Whetstone', 'gear', 0.01, '1 cp', 1),
];

// ── Lookups ─────────────────────────────────────────────────────────────────

const WEAPON_BY_NAME = new Map(WEAPONS_2014.map((x) => [x.name.toLowerCase(), x]));
const ARMOR_BY_NAME = new Map(ARMOR_2014.map((x) => [x.name.toLowerCase(), x]));
const GEAR_BY_NAME = new Map(GEAR_2014.map((x) => [x.name.toLowerCase(), x]));
const WEAPON_PROPERTY_BY_KEY = new Map(WEAPON_PROPERTIES_2014.map((p) => [p.key, p]));

export function findWeapon2014(name: string): WeaponDef2014 | undefined {
  return WEAPON_BY_NAME.get(name.trim().toLowerCase());
}
export function findArmor2014(name: string): ArmorDef2014 | undefined {
  return ARMOR_BY_NAME.get(name.trim().toLowerCase());
}
export function findGear2014(name: string): GearDef2014 | undefined {
  return GEAR_BY_NAME.get(name.trim().toLowerCase());
}

/** What a 2014 weapon property does. The key is the bare name, e.g. 'Versatile' from 'Versatile (1d8)'. */
export function weaponPropertyEffect2014(key: string): string | undefined {
  return WEAPON_PROPERTY_BY_KEY.get(key.split(' (')[0])?.effect;
}

/** A weapon's property line as a sheet should display it. No mastery is appended — 2014 has none. */
export function weaponPropertyLine2014(x: WeaponDef2014): string {
  return x.properties.length ? x.properties.join(', ') : '—';
}

/** The AC an armour gives a character with this DEX modifier, respecting its cap.
 *  Shields are a flat bonus and are excluded — they ADD to a body armour's result. */
export function armorAcFor2014(x: ArmorDef2014, dexMod: number): number {
  if (x.category === 'shield') return x.baseAC;
  const applied = x.dexCap === null ? dexMod : Math.min(dexMod, x.dexCap);
  return x.baseAC + applied;
}

export function weaponsByCategory2014(category: WeaponCategory2014, kind?: WeaponRangeKind2014): WeaponDef2014[] {
  return WEAPONS_2014.filter((x) => x.category === category && (kind ? x.kind === kind : true));
}

/** Honest coverage statement for the 2014 equipment catalog. */
export const EQUIPMENT_2014_STATUS = {
  system: 'dnd5e-2014' as const,
  weapons: WEAPONS_2014.length,
  armor: ARMOR_2014.length,
  gear: GEAR_2014.length,
  sources: ['SRD 5.1 (CC-BY-4.0)', 'D&D Basic Rules 2014 (free, Wizards of the Coast)'],
  note:
    'Weapons, armour and adventuring gear are fully covered by the SRD 5.1. There is no weapon mastery in 2014 and the type has no field for it. Not included, because they are not SRD content or are not part of these three tables: tools and artisan\'s tools, gaming sets, musical instruments, the pre-priced equipment packs, mounts, vehicles, trade goods, lifestyle expenses, and magic items other than the Potion of Healing.',
} as const;
