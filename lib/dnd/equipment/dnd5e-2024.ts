// lib/dnd/equipment/dnd5e-2024.ts — the 2024 weapon and armour tables as structured data.
//
// S6 of DND_2024_COMPLETE_LIBRARY_2026-07-20. Until now weapons and armour existed only as
// free-text rows in the library and as hand-typed items on a sheet, so "give me a longsword"
// produced a name with no damage die and no properties.
//
// THE 2024 HEADLINE IS WEAPON MASTERY. Every weapon now carries a mastery property (Cleave,
// Graze, Nick, Push, Sap, Slow, Topple, Vex) that a character proficient in it can use. This did
// not exist in 2014 at all, and it is the single most likely thing for a 2014 assumption to
// silently omit — a Greatsword without Graze is a materially weaker weapon than the rules give.
//
// House style as everywhere: mechanical facts and numbers, paraphrased, attributed.

export type WeaponCategory = 'simple' | 'martial';
export type WeaponRangeKind = 'melee' | 'ranged';
export type ArmorCategory = 'light' | 'medium' | 'heavy' | 'shield';

/** The eight 2024 mastery properties, with what each actually does. */
export type MasteryProperty = 'Cleave' | 'Graze' | 'Nick' | 'Push' | 'Sap' | 'Slow' | 'Topple' | 'Vex';

export const MASTERY_PROPERTIES: { key: MasteryProperty; effect: string }[] = [
  { key: 'Cleave', effect: 'On a hit with a melee attack, make a second attack against another creature within 5 feet of the first, without your ability modifier to damage. Once per turn.' },
  { key: 'Graze', effect: 'On a MISS, the target still takes damage equal to your ability modifier — the weapon never whiffs entirely.' },
  { key: 'Nick', effect: 'The extra Light-property attack can be made as part of the Attack action rather than costing a Bonus Action. Once per turn.' },
  { key: 'Push', effect: 'On a hit, push a Large or smaller target up to 10 feet away.' },
  { key: 'Sap', effect: 'On a hit, the target has disadvantage on its next attack roll before your next turn ends.' },
  { key: 'Slow', effect: "On a hit, reduce the target's speed by 10 feet until your next turn starts. Does not stack with itself." },
  { key: 'Topple', effect: 'On a hit, the target makes a Constitution save against your attack DC or gains the Prone condition.' },
  { key: 'Vex', effect: 'On a hit, you have advantage on your next attack roll against that creature before your next turn ends.' },
];

export interface WeaponDef {
  name: string;
  category: WeaponCategory;
  kind: WeaponRangeKind;
  /** e.g. '1d8'. The Blowgun is the one flat-damage weapon. */
  damage: string;
  damageType: 'bludgeoning' | 'piercing' | 'slashing';
  /** Non-mastery properties: Finesse, Light, Thrown, Versatile, Heavy, Reach, Two-Handed, Ammunition, Loading. */
  properties: string[];
  mastery: MasteryProperty;
  /** Weight in pounds. */
  weight: number;
  /** Cost in gold pieces (a fractional value for the cheapest items). */
  cost: number;
  source: string;
}

const PHB = 'PHB 2024';
const w = (
  name: string, category: WeaponCategory, kind: WeaponRangeKind, damage: string,
  damageType: WeaponDef['damageType'], properties: string[], mastery: MasteryProperty,
  weight: number, cost: number,
): WeaponDef => ({ name, category, kind, damage, damageType, properties, mastery, weight, cost, source: PHB });

export const WEAPONS_2024: WeaponDef[] = [
  // ── Simple melee ──
  w('Club', 'simple', 'melee', '1d4', 'bludgeoning', ['Light'], 'Slow', 2, 0.1),
  w('Dagger', 'simple', 'melee', '1d4', 'piercing', ['Finesse', 'Light', 'Thrown (20/60)'], 'Nick', 1, 2),
  w('Greatclub', 'simple', 'melee', '1d8', 'bludgeoning', ['Two-Handed'], 'Push', 10, 0.2),
  w('Handaxe', 'simple', 'melee', '1d6', 'slashing', ['Light', 'Thrown (20/60)'], 'Vex', 2, 5),
  w('Javelin', 'simple', 'melee', '1d6', 'piercing', ['Thrown (30/120)'], 'Slow', 2, 0.5),
  w('Light Hammer', 'simple', 'melee', '1d4', 'bludgeoning', ['Light', 'Thrown (20/60)'], 'Nick', 2, 2),
  w('Mace', 'simple', 'melee', '1d6', 'bludgeoning', [], 'Sap', 4, 5),
  w('Quarterstaff', 'simple', 'melee', '1d6', 'bludgeoning', ['Versatile (1d8)'], 'Topple', 4, 0.2),
  w('Sickle', 'simple', 'melee', '1d4', 'slashing', ['Light'], 'Nick', 2, 1),
  w('Spear', 'simple', 'melee', '1d6', 'piercing', ['Thrown (20/60)', 'Versatile (1d8)'], 'Sap', 3, 1),
  // ── Simple ranged ──
  w('Dart', 'simple', 'ranged', '1d4', 'piercing', ['Finesse', 'Thrown (20/60)'], 'Vex', 0.25, 0.05),
  w('Light Crossbow', 'simple', 'ranged', '1d8', 'piercing', ['Ammunition (80/320)', 'Loading', 'Two-Handed'], 'Slow', 5, 25),
  w('Shortbow', 'simple', 'ranged', '1d6', 'piercing', ['Ammunition (80/320)', 'Two-Handed'], 'Vex', 2, 25),
  w('Sling', 'simple', 'ranged', '1d4', 'bludgeoning', ['Ammunition (30/120)'], 'Slow', 0, 0.1),
  // ── Martial melee ──
  w('Battleaxe', 'martial', 'melee', '1d8', 'slashing', ['Versatile (1d10)'], 'Topple', 4, 10),
  w('Flail', 'martial', 'melee', '1d8', 'bludgeoning', [], 'Sap', 2, 10),
  w('Glaive', 'martial', 'melee', '1d10', 'slashing', ['Heavy', 'Reach', 'Two-Handed'], 'Graze', 6, 20),
  w('Greataxe', 'martial', 'melee', '1d12', 'slashing', ['Heavy', 'Two-Handed'], 'Cleave', 7, 30),
  w('Greatsword', 'martial', 'melee', '2d6', 'slashing', ['Heavy', 'Two-Handed'], 'Graze', 6, 50),
  w('Halberd', 'martial', 'melee', '1d10', 'slashing', ['Heavy', 'Reach', 'Two-Handed'], 'Cleave', 6, 20),
  w('Lance', 'martial', 'melee', '1d10', 'piercing', ['Heavy', 'Reach', 'Two-Handed (unless mounted)'], 'Topple', 6, 10),
  w('Longsword', 'martial', 'melee', '1d8', 'slashing', ['Versatile (1d10)'], 'Sap', 3, 15),
  w('Maul', 'martial', 'melee', '2d6', 'bludgeoning', ['Heavy', 'Two-Handed'], 'Topple', 10, 10),
  w('Morningstar', 'martial', 'melee', '1d8', 'piercing', [], 'Sap', 4, 15),
  w('Pike', 'martial', 'melee', '1d10', 'piercing', ['Heavy', 'Reach', 'Two-Handed'], 'Push', 18, 5),
  w('Rapier', 'martial', 'melee', '1d8', 'piercing', ['Finesse'], 'Vex', 2, 25),
  w('Scimitar', 'martial', 'melee', '1d6', 'slashing', ['Finesse', 'Light'], 'Nick', 3, 25),
  w('Shortsword', 'martial', 'melee', '1d6', 'piercing', ['Finesse', 'Light'], 'Vex', 2, 10),
  w('Trident', 'martial', 'melee', '1d8', 'piercing', ['Thrown (20/60)', 'Versatile (1d10)'], 'Topple', 4, 5),
  w('War Pick', 'martial', 'melee', '1d8', 'piercing', ['Versatile (1d10)'], 'Sap', 2, 5),
  w('Warhammer', 'martial', 'melee', '1d8', 'bludgeoning', ['Versatile (1d10)'], 'Push', 5, 15),
  w('Whip', 'martial', 'melee', '1d4', 'slashing', ['Finesse', 'Reach'], 'Slow', 3, 2),
  // ── Martial ranged ──
  w('Blowgun', 'martial', 'ranged', '1', 'piercing', ['Ammunition (25/100)', 'Loading'], 'Vex', 1, 10),
  w('Hand Crossbow', 'martial', 'ranged', '1d6', 'piercing', ['Ammunition (30/120)', 'Light', 'Loading'], 'Vex', 3, 75),
  w('Heavy Crossbow', 'martial', 'ranged', '1d10', 'piercing', ['Ammunition (100/400)', 'Heavy', 'Loading', 'Two-Handed'], 'Push', 18, 50),
  w('Longbow', 'martial', 'ranged', '1d8', 'piercing', ['Ammunition (150/600)', 'Heavy', 'Two-Handed'], 'Slow', 2, 50),
  w('Musket', 'martial', 'ranged', '1d12', 'piercing', ['Ammunition (40/120)', 'Loading', 'Two-Handed'], 'Slow', 10, 500),
  w('Pistol', 'martial', 'ranged', '1d10', 'piercing', ['Ammunition (30/90)', 'Loading'], 'Vex', 3, 250),
];

export interface ArmorDef {
  name: string;
  category: ArmorCategory;
  /** Base AC before any ability modifier. A shield's is its flat bonus. */
  baseAC: number;
  /** Maximum DEX added: null = uncapped (light), 2 = medium, 0 = heavy. */
  dexCap: number | null;
  /** Minimum Strength score, or null. Falling short costs 10 feet of speed. */
  strengthReq: number | null;
  stealthDisadvantage: boolean;
  weight: number;
  cost: number;
  source: string;
}

const a = (
  name: string, category: ArmorCategory, baseAC: number, dexCap: number | null,
  strengthReq: number | null, stealthDisadvantage: boolean, weight: number, cost: number,
): ArmorDef => ({ name, category, baseAC, dexCap, strengthReq, stealthDisadvantage, weight, cost, source: PHB });

export const ARMOR_2024: ArmorDef[] = [
  a('Padded Armor', 'light', 11, null, null, true, 8, 5),
  a('Leather Armor', 'light', 11, null, null, false, 10, 10),
  a('Studded Leather Armor', 'light', 12, null, null, false, 13, 45),
  a('Hide Armor', 'medium', 12, 2, null, false, 12, 10),
  a('Chain Shirt', 'medium', 13, 2, null, false, 20, 50),
  a('Scale Mail', 'medium', 14, 2, null, true, 45, 50),
  a('Breastplate', 'medium', 14, 2, null, false, 20, 400),
  a('Half Plate Armor', 'medium', 15, 2, null, true, 40, 750),
  a('Ring Mail', 'heavy', 14, 0, null, true, 40, 30),
  a('Chain Mail', 'heavy', 16, 0, 13, true, 55, 75),
  a('Splint Armor', 'heavy', 17, 0, 15, true, 60, 200),
  a('Plate Armor', 'heavy', 18, 0, 15, true, 65, 1500),
  a('Shield', 'shield', 2, 0, null, false, 6, 10),
];

// ── Lookups ─────────────────────────────────────────────────────────────────

const WEAPON_BY_NAME = new Map(WEAPONS_2024.map((x) => [x.name.toLowerCase(), x]));
const ARMOR_BY_NAME = new Map(ARMOR_2024.map((x) => [x.name.toLowerCase(), x]));
const MASTERY_BY_KEY = new Map(MASTERY_PROPERTIES.map((m) => [m.key, m]));

export function findWeapon2024(name: string): WeaponDef | undefined {
  return WEAPON_BY_NAME.get(name.trim().toLowerCase());
}
export function findArmor2024(name: string): ArmorDef | undefined {
  return ARMOR_BY_NAME.get(name.trim().toLowerCase());
}
export function masteryEffect(key: MasteryProperty): string | undefined {
  return MASTERY_BY_KEY.get(key)?.effect;
}

/** A weapon's full property list INCLUDING its mastery — what a sheet should display. */
export function weaponPropertyLine(x: WeaponDef): string {
  return [...x.properties, `Mastery: ${x.mastery}`].join(', ');
}

/** The AC an armour gives a character with this DEX modifier, respecting its cap.
 *  Shields are a flat bonus and are excluded — they ADD to a body armour's result. */
export function armorAcFor(x: ArmorDef, dexMod: number): number {
  if (x.category === 'shield') return x.baseAC;
  const applied = x.dexCap === null ? dexMod : Math.min(dexMod, x.dexCap);
  return x.baseAC + applied;
}
