// lib/dnd/systems/pathfinder2e/data/equipment.ts — the FULL Pathfinder 2e equipment catalog
// (Remaster): weapons, armor, shields, runes, gear, consumables.
//
// WHY THIS IS SEPARATE FROM content.ts: content.ts holds the small hand-authored seed that the sheet
// and builder already read (PF2_WEAPONS / PF2_ARMORS, ~30 rows). Growing those arrays in place would
// churn a file half the subsystem imports and make every gear change a diff against class/ancestry
// data. So the seed stays put and the full tables live here, authored against the SAME
// `PF2WeaponDef` / `PF2ArmorDef` interfaces — anything already calling `pf2Weapon()` keeps working,
// and a caller that wants the whole table imports `PF2_WEAPONS_FULL` instead. The seed is a subset
// of these lists by construction (see the two deliberate corrections noted below).
//
// LICENSING (same ground rules as defs.ts): PF2 mechanics are ORC-licensed, which expressly permits
// reproducing rules mechanics. Reserved Material — Paizo trademarks, deities, characters, places,
// lore, art — never appears here. Effects are paraphrased mechanical facts, never rulebook prose.
//
// GROUND RULE 3 — NEVER INVENT A NUMBER. A plausible-but-wrong damage die or price is worse than an
// absent one on a rules platform. Every field below is a value I could state with confidence;
// anything I was unsure of is OMITTED rather than guessed, and the omission is recorded in
// `PF2_EQUIPMENT_GAPS` at the bottom so a missing value reads as "not catalogued" and never as
// "this item has no price". Prices in particular are omitted far more often than they are given.
//
// REMASTER: uses Remaster terminology throughout — Strength entries are MODIFIERS (+1/+2/+3/+4), not
// ability scores; "vitality"/"void" replace positive/negative energy; spell RANK, never spell level.
import type { PF2ItemDef, PF2RuneDef } from '../defs';
import type { PF2WeaponDef, PF2ArmorDef } from '../content';

// ── Weapons ──────────────────────────────────────────────────────────────────────────────────────
//
// Shape notes:
//  • `range` stays 0 for melee weapons INCLUDING thrown ones — a thrown weapon's increment rides on
//    its `thrown X ft` trait, exactly as the seed in content.ts already encodes the dagger. `range`
//    is only for weapons that fire (bows, crossbows, slings, blowguns).
//  • `group` keeps the seed's capitalised spelling ('Sword', 'Axe', …) because catalog.ts already
//    lowercases it for display and the lookup helpers are case-insensitive.
//  • Reload is a trait (`reload 1`), matching how the seed encodes the crossbow.
//
// TWO DELIBERATE DIFFERENCES FROM THE SEED: the seed lists Greataxe and Greatsword with a
// `two-hand d12` trait. Two-hand is a trait for one-handed weapons that can be wielded in two; both
// of those are already two-handed weapons (Hands 2) and carry no two-hand trait. Corrected here
// rather than in content.ts so no existing consumer shifts under this change.

export const PF2_WEAPONS_FULL: PF2WeaponDef[] = [
  // ── Unarmed ──
  { name: 'Fist', category: 'unarmed', damageDie: '1d4', damageType: 'B', traits: ['agile', 'finesse', 'nonlethal'], group: 'Brawling', hands: 1, range: 0 },

  // ── Simple melee ──
  { name: 'Bo Staff', category: 'simple', damageDie: '1d8', damageType: 'B', traits: ['monk', 'parry', 'reach', 'trip'], group: 'Club', hands: 2, range: 0, bulk: '2', price: '2 sp' },
  { name: 'Club', category: 'simple', damageDie: '1d6', damageType: 'B', traits: ['thrown 10 ft'], group: 'Club', hands: 1, range: 0, bulk: '1' },
  { name: 'Dagger', category: 'simple', damageDie: '1d4', damageType: 'P', traits: ['agile', 'finesse', 'thrown 10 ft', 'versatile S'], group: 'Knife', hands: 1, range: 0, bulk: 'L', price: '2 sp' },
  { name: 'Gauntlet', category: 'simple', damageDie: '1d4', damageType: 'B', traits: ['agile', 'free-hand'], group: 'Brawling', hands: 1, range: 0, bulk: 'L', price: '2 sp' },
  { name: 'Katar', category: 'simple', damageDie: '1d4', damageType: 'P', traits: ['agile', 'deadly d6', 'monk'], group: 'Knife', hands: 1, range: 0, bulk: 'L', price: '3 sp' },
  { name: 'Light Mace', category: 'simple', damageDie: '1d4', damageType: 'B', traits: ['agile', 'finesse', 'shove'], group: 'Club', hands: 1, range: 0, bulk: 'L', price: '4 sp' },
  { name: 'Mace', category: 'simple', damageDie: '1d6', damageType: 'B', traits: ['shove'], group: 'Club', hands: 1, range: 0, bulk: '1', price: '1 gp' },
  { name: 'Morningstar', category: 'simple', damageDie: '1d6', damageType: 'B', traits: ['versatile P'], group: 'Club', hands: 1, range: 0, bulk: '1', price: '1 gp' },
  { name: 'Sap', category: 'simple', damageDie: '1d6', damageType: 'B', traits: ['agile', 'nonlethal'], group: 'Club', hands: 1, range: 0, bulk: 'L', price: '1 sp' },
  { name: 'Spear', category: 'simple', damageDie: '1d6', damageType: 'P', traits: ['thrown 20 ft'], group: 'Spear', hands: 1, range: 0, bulk: '1', price: '1 sp' },
  { name: 'Spiked Gauntlet', category: 'simple', damageDie: '1d4', damageType: 'P', traits: ['agile', 'free-hand'], group: 'Brawling', hands: 1, range: 0, bulk: 'L', price: '3 sp' },
  { name: 'Staff', category: 'simple', damageDie: '1d4', damageType: 'B', traits: ['two-hand d8'], group: 'Club', hands: 1, range: 0, bulk: '1' },

  // ── Simple ranged ──
  // Blowgun deals a FLAT 1 piercing, not a die — one of the few weapons in the game that does, so
  // `damageDie` carries '1' rather than a dice expression. Consumers that parse NdM must tolerate it.
  { name: 'Blowgun', category: 'simple', damageDie: '1', damageType: 'P', traits: ['agile', 'nonlethal', 'reload 1'], group: 'Dart', hands: 1, range: 20, bulk: 'L', price: '1 sp' },
  { name: 'Crossbow', category: 'simple', damageDie: '1d8', damageType: 'P', traits: ['reload 1'], group: 'Crossbow', hands: 2, range: 120, bulk: '1', price: '3 gp' },
  { name: 'Dart', category: 'simple', damageDie: '1d4', damageType: 'P', traits: ['agile', 'thrown 20 ft'], group: 'Dart', hands: 1, range: 20, bulk: 'L', price: '1 cp' },
  { name: 'Hand Crossbow', category: 'simple', damageDie: '1d6', damageType: 'P', traits: ['reload 1'], group: 'Crossbow', hands: 1, range: 60, bulk: 'L', price: '3 gp' },
  { name: 'Heavy Crossbow', category: 'simple', damageDie: '1d10', damageType: 'P', traits: ['reload 2'], group: 'Crossbow', hands: 2, range: 120, bulk: '2', price: '4 gp' },
  { name: 'Javelin', category: 'simple', damageDie: '1d6', damageType: 'P', traits: ['thrown 30 ft'], group: 'Dart', hands: 1, range: 30, bulk: 'L', price: '1 sp' },
  { name: 'Shortbow', category: 'simple', damageDie: '1d6', damageType: 'P', traits: ['deadly d10'], group: 'Bow', hands: 2, range: 60, bulk: '1', price: '3 gp' },
  { name: 'Sling', category: 'simple', damageDie: '1d6', damageType: 'B', traits: ['propulsive', 'reload 1'], group: 'Sling', hands: 1, range: 50, bulk: 'L' },

  // ── Martial melee ──
  { name: 'Bastard Sword', category: 'martial', damageDie: '1d8', damageType: 'S', traits: ['two-hand d12'], group: 'Sword', hands: 1, range: 0, bulk: '1', price: '4 gp' },
  { name: 'Battle Axe', category: 'martial', damageDie: '1d8', damageType: 'S', traits: ['sweep'], group: 'Axe', hands: 1, range: 0, bulk: '1', price: '1 gp' },
  { name: 'Falchion', category: 'martial', damageDie: '1d10', damageType: 'S', traits: ['forceful', 'sweep'], group: 'Sword', hands: 2, range: 0, bulk: '2', price: '3 gp' },
  { name: 'Flail', category: 'martial', damageDie: '1d6', damageType: 'B', traits: ['disarm', 'sweep', 'trip'], group: 'Flail', hands: 1, range: 0, bulk: '1', price: '8 sp' },
  { name: 'Glaive', category: 'martial', damageDie: '1d8', damageType: 'S', traits: ['deadly d8', 'forceful', 'reach'], group: 'Polearm', hands: 2, range: 0, bulk: '2', price: '1 gp' },
  { name: 'Greataxe', category: 'martial', damageDie: '1d12', damageType: 'S', traits: ['sweep'], group: 'Axe', hands: 2, range: 0, bulk: '2', price: '2 gp' },
  { name: 'Greatclub', category: 'martial', damageDie: '1d10', damageType: 'B', traits: ['backswing', 'shove'], group: 'Club', hands: 2, range: 0, bulk: '2', price: '1 gp' },
  { name: 'Greatpick', category: 'martial', damageDie: '1d10', damageType: 'P', traits: ['fatal d12'], group: 'Pick', hands: 2, range: 0, bulk: '2', price: '1 gp' },
  { name: 'Greatsword', category: 'martial', damageDie: '1d12', damageType: 'S', traits: ['versatile P'], group: 'Sword', hands: 2, range: 0, bulk: '2', price: '2 gp' },
  { name: 'Guisarme', category: 'martial', damageDie: '1d10', damageType: 'S', traits: ['reach', 'trip'], group: 'Polearm', hands: 2, range: 0, bulk: '2', price: '2 gp' },
  { name: 'Halberd', category: 'martial', damageDie: '1d10', damageType: 'P', traits: ['reach', 'versatile S'], group: 'Polearm', hands: 2, range: 0, bulk: '2', price: '2 gp' },
  { name: 'Hatchet', category: 'martial', damageDie: '1d6', damageType: 'S', traits: ['agile', 'sweep', 'thrown 10 ft'], group: 'Axe', hands: 1, range: 0, bulk: 'L', price: '4 sp' },
  { name: 'Lance', category: 'martial', damageDie: '1d8', damageType: 'P', traits: ['deadly d8', 'jousting d6', 'reach'], group: 'Spear', hands: 2, range: 0, bulk: '2', price: '2 gp' },
  { name: 'Light Hammer', category: 'martial', damageDie: '1d6', damageType: 'B', traits: ['agile', 'thrown 20 ft'], group: 'Hammer', hands: 1, range: 0, bulk: 'L', price: '3 sp' },
  { name: 'Light Pick', category: 'martial', damageDie: '1d4', damageType: 'P', traits: ['agile', 'fatal d8'], group: 'Pick', hands: 1, range: 0, bulk: 'L', price: '4 sp' },
  { name: 'Longspear', category: 'martial', damageDie: '1d8', damageType: 'P', traits: ['reach'], group: 'Spear', hands: 2, range: 0, bulk: '2', price: '5 sp' },
  { name: 'Longsword', category: 'martial', damageDie: '1d8', damageType: 'S', traits: ['versatile P'], group: 'Sword', hands: 1, range: 0, bulk: '1', price: '1 gp' },
  { name: 'Main-gauche', category: 'martial', damageDie: '1d4', damageType: 'P', traits: ['agile', 'disarm', 'finesse', 'parry', 'versatile S'], group: 'Knife', hands: 1, range: 0, bulk: 'L', price: '5 sp' },
  { name: 'Maul', category: 'martial', damageDie: '1d12', damageType: 'B', traits: ['shove'], group: 'Hammer', hands: 2, range: 0, bulk: '2', price: '3 gp' },
  { name: 'Pick', category: 'martial', damageDie: '1d6', damageType: 'P', traits: ['fatal d10'], group: 'Pick', hands: 1, range: 0, bulk: '1', price: '7 sp' },
  { name: 'Ranseur', category: 'martial', damageDie: '1d10', damageType: 'P', traits: ['disarm', 'reach'], group: 'Polearm', hands: 2, range: 0, bulk: '2', price: '2 gp' },
  { name: 'Rapier', category: 'martial', damageDie: '1d6', damageType: 'P', traits: ['deadly d8', 'disarm', 'finesse'], group: 'Sword', hands: 1, range: 0, bulk: '1', price: '2 gp' },
  { name: 'Scimitar', category: 'martial', damageDie: '1d6', damageType: 'S', traits: ['forceful', 'sweep'], group: 'Sword', hands: 1, range: 0, bulk: '1', price: '1 gp' },
  { name: 'Scythe', category: 'martial', damageDie: '1d10', damageType: 'S', traits: ['deadly d10', 'trip'], group: 'Polearm', hands: 2, range: 0, bulk: '2', price: '2 gp' },
  // Shield boss / spikes are weapons ATTACHED to a shield — they are what makes a Shield Bash a real
  // Strike, which is why they live in the weapon table and not with the shields.
  { name: 'Shield Boss', category: 'martial', damageDie: '1d6', damageType: 'B', traits: ['attached to shield'], group: 'Shield', hands: 1, range: 0, bulk: 'L', price: '5 sp' },
  { name: 'Shield Spikes', category: 'martial', damageDie: '1d6', damageType: 'P', traits: ['attached to shield'], group: 'Shield', hands: 1, range: 0, bulk: 'L', price: '5 sp' },
  { name: 'Shortsword', category: 'martial', damageDie: '1d6', damageType: 'P', traits: ['agile', 'finesse', 'versatile S'], group: 'Sword', hands: 1, range: 0, bulk: 'L', price: '9 sp' },
  { name: 'Starknife', category: 'martial', damageDie: '1d4', damageType: 'P', traits: ['agile', 'deadly d6', 'finesse', 'thrown 20 ft', 'versatile S'], group: 'Knife', hands: 1, range: 0, bulk: 'L', price: '2 gp' },
  { name: 'Trident', category: 'martial', damageDie: '1d8', damageType: 'P', traits: ['thrown 20 ft'], group: 'Spear', hands: 1, range: 0, bulk: '1', price: '1 gp' },
  { name: 'War Flail', category: 'martial', damageDie: '1d10', damageType: 'B', traits: ['disarm', 'sweep', 'trip'], group: 'Flail', hands: 2, range: 0, bulk: '2', price: '2 gp' },
  { name: 'Warhammer', category: 'martial', damageDie: '1d8', damageType: 'B', traits: ['shove'], group: 'Hammer', hands: 1, range: 0, bulk: '1', price: '1 gp' },
  { name: 'Whip', category: 'martial', damageDie: '1d4', damageType: 'S', traits: ['disarm', 'finesse', 'nonlethal', 'reach', 'trip'], group: 'Flail', hands: 1, range: 0, bulk: '1', price: '1 sp' },

  // ── Martial ranged ──
  { name: 'Bola', category: 'martial', damageDie: '1d6', damageType: 'B', traits: ['nonlethal', 'ranged trip', 'thrown 20 ft'], group: 'Sling', hands: 1, range: 20, bulk: 'L', price: '5 sp' },
  { name: 'Composite Longbow', category: 'martial', damageDie: '1d8', damageType: 'P', traits: ['deadly d10', 'propulsive', 'volley 30 ft'], group: 'Bow', hands: 2, range: 100, bulk: '2', price: '20 gp' },
  { name: 'Composite Shortbow', category: 'martial', damageDie: '1d6', damageType: 'P', traits: ['deadly d10', 'propulsive'], group: 'Bow', hands: 2, range: 60, bulk: '1', price: '14 gp' },
  { name: 'Longbow', category: 'martial', damageDie: '1d8', damageType: 'P', traits: ['deadly d10', 'volley 30 ft'], group: 'Bow', hands: 2, range: 100, bulk: '2', price: '6 gp' },

  // ── Advanced ──
  // Only one advanced weapon is catalogued. The rest of the advanced table is dominated by
  // ancestry- and region-named weapons, which are either uncommon (needing access rules this
  // catalog does not model yet) or carry setting-specific names — and I was not confident enough of
  // the remaining stat lines to author them. See PF2_EQUIPMENT_GAPS.
  { name: 'Katana', category: 'advanced', damageDie: '1d6', damageType: 'S', traits: ['deadly d8', 'two-hand d10', 'uncommon'], group: 'Sword', hands: 1, range: 0, bulk: '1', price: '2 gp' },
];

// ── Armor ────────────────────────────────────────────────────────────────────────────────────────
//
// AC = 10 + min(Dex, dexCap) + proficiency + acBonus (rules.pf2ArmorClass). `strength` is the
// Strength MODIFIER that cancels the check and speed penalties — Remaster expresses it that way, and
// the seed in content.ts already uses modifiers, so the two agree.
export const PF2_ARMORS_FULL: PF2ArmorDef[] = [
  { name: 'Unarmored', category: 'unarmored', acBonus: 0, dexCap: null, strength: 0, checkPenalty: 0, speedPenalty: 0 },
  { name: "Explorer's Clothing", category: 'unarmored', acBonus: 0, dexCap: 5, strength: 0, checkPenalty: 0, speedPenalty: 0, group: 'Cloth', bulk: 'L', price: '1 sp', traits: ['comfort'] },

  // Light
  { name: 'Padded Armor', category: 'light', acBonus: 1, dexCap: 3, strength: 0, checkPenalty: 0, speedPenalty: 0, group: 'Cloth', bulk: 'L', price: '2 sp', traits: ['comfort'] },
  { name: 'Leather', category: 'light', acBonus: 1, dexCap: 4, strength: 1, checkPenalty: -1, speedPenalty: 0, group: 'Leather', bulk: '1', price: '2 gp' },
  { name: 'Studded Leather', category: 'light', acBonus: 2, dexCap: 3, strength: 1, checkPenalty: -1, speedPenalty: 0, group: 'Leather', bulk: '1', price: '3 gp' },
  { name: 'Chain Shirt', category: 'light', acBonus: 2, dexCap: 3, strength: 1, checkPenalty: -1, speedPenalty: 0, group: 'Chain', bulk: '1', price: '5 gp', traits: ['flexible', 'noisy'] },

  // Medium
  { name: 'Hide', category: 'medium', acBonus: 3, dexCap: 2, strength: 2, checkPenalty: -2, speedPenalty: -5, group: 'Leather', bulk: '2', price: '2 gp' },
  { name: 'Scale Mail', category: 'medium', acBonus: 3, dexCap: 2, strength: 2, checkPenalty: -2, speedPenalty: -5, group: 'Composite', bulk: '2', price: '4 gp' },
  { name: 'Chain Mail', category: 'medium', acBonus: 4, dexCap: 1, strength: 3, checkPenalty: -2, speedPenalty: -5, group: 'Chain', bulk: '2', price: '6 gp', traits: ['flexible', 'noisy'] },
  { name: 'Breastplate', category: 'medium', acBonus: 4, dexCap: 1, strength: 3, checkPenalty: -2, speedPenalty: -5, group: 'Plate', bulk: '2', price: '8 gp' },

  // Heavy
  { name: 'Splint Mail', category: 'heavy', acBonus: 5, dexCap: 1, strength: 3, checkPenalty: -3, speedPenalty: -10, group: 'Composite', bulk: '3', price: '13 gp' },
  { name: 'Half Plate', category: 'heavy', acBonus: 5, dexCap: 1, strength: 3, checkPenalty: -3, speedPenalty: -10, group: 'Plate', bulk: '3', price: '18 gp' },
  // Bulwark: use a flat +3 in place of your Dex modifier on Reflex saves against area effects.
  { name: 'Full Plate', category: 'heavy', acBonus: 6, dexCap: 0, strength: 4, checkPenalty: -3, speedPenalty: -10, group: 'Plate', bulk: '4', price: '30 gp', traits: ['bulwark'] },
];

// ── Shields ──────────────────────────────────────────────────────────────────────────────────────
//
// Shields get their own shape rather than a `PF2ItemDef` row because their numbers are load-bearing:
// Shield Block subtracts the shield's Hardness from the damage, the shield takes the remainder, and
// it breaks at its Break Threshold. Stuffing Hardness/HP/BT into prose would make that rule
// unresolvable by code. A shield's AC bonus applies only while Raised.
export interface PF2ShieldDef {
  name: string;
  /** Circumstance bonus to AC while the shield is Raised. */
  acBonus: number;
  hardness: number;
  hp: number;
  /** Break Threshold — at or below this the shield is broken and gives no bonus until repaired. */
  bt: number;
  bulk: string;
  price?: string;
  traits?: string[];
  /** Speed penalty in feet, where the shield imposes one (tower shields do). */
  speedPenalty?: number;
  note?: string;
}
export const PF2_SHIELDS: PF2ShieldDef[] = [
  { name: 'Buckler', acBonus: 1, hardness: 3, hp: 6, bt: 3, bulk: 'L', price: '1 gp', note: 'Strapped to the forearm, so the hand stays free — but that hand can hold nothing while the buckler is Raised.' },
  { name: 'Wooden Shield', acBonus: 2, hardness: 3, hp: 12, bt: 6, bulk: '1', price: '1 gp' },
  { name: 'Steel Shield', acBonus: 2, hardness: 5, hp: 20, bt: 10, bulk: '1', price: '2 gp' },
  { name: 'Tower Shield', acBonus: 2, hardness: 5, hp: 20, bt: 10, bulk: '4', price: '10 gp', speedPenalty: -5, note: 'Can be planted to Take Cover, upgrading the protection to standard cover while it stays Raised.' },
];

// ── Runes ────────────────────────────────────────────────────────────────────────────────────────
//
// PF2's item maths runs through runes: a "+1 striking longsword" is a longsword plus two fundamental
// runes, not a distinct magic item. Fundamentals set accuracy (potency) and dice count (striking /
// resilient); property runes add effects, and how many a piece of gear can hold is capped by its
// potency rune's value.
//
// PRICES: the fundamental-rune price/level ladder is fixed and well known, so it is given in full.
// Property-rune prices are given ONLY where I was confident; where I was not, the price is omitted
// and the level and mechanic are still recorded. See PF2_EQUIPMENT_GAPS.
export const PF2_RUNES: PF2RuneDef[] = [
  // ── Fundamental: weapon ──
  { name: 'Weapon Potency (+1)', level: 2, price: '35 gp', kind: 'fundamental', appliesTo: 'weapon', effect: '+1 item bonus to attack rolls with this weapon, and it can hold one property rune.', source: 'Player Core' },
  { name: 'Weapon Potency (+2)', level: 10, price: '935 gp', kind: 'fundamental', appliesTo: 'weapon', effect: '+2 item bonus to attack rolls; the weapon can hold two property runes.', source: 'Player Core' },
  { name: 'Weapon Potency (+3)', level: 16, price: '8,935 gp', kind: 'fundamental', appliesTo: 'weapon', effect: '+3 item bonus to attack rolls; the weapon can hold three property runes.', source: 'Player Core' },
  { name: 'Striking', level: 4, price: '65 gp', kind: 'fundamental', appliesTo: 'weapon', effect: 'A successful Strike rolls two weapon damage dice instead of one.', source: 'Player Core' },
  { name: 'Greater Striking', level: 12, price: '1,065 gp', kind: 'fundamental', appliesTo: 'weapon', effect: 'A successful Strike rolls three weapon damage dice.', source: 'Player Core' },
  { name: 'Major Striking', level: 19, price: '31,065 gp', kind: 'fundamental', appliesTo: 'weapon', effect: 'A successful Strike rolls four weapon damage dice.', source: 'Player Core' },

  // ── Fundamental: armor ──
  { name: 'Armor Potency (+1)', level: 5, price: '160 gp', kind: 'fundamental', appliesTo: 'armor', effect: '+1 item bonus to AC, and the armor can hold one property rune.', source: 'Player Core' },
  { name: 'Armor Potency (+2)', level: 11, price: '1,060 gp', kind: 'fundamental', appliesTo: 'armor', effect: '+2 item bonus to AC; the armor can hold two property runes.', source: 'Player Core' },
  { name: 'Armor Potency (+3)', level: 18, price: '20,560 gp', kind: 'fundamental', appliesTo: 'armor', effect: '+3 item bonus to AC; the armor can hold three property runes.', source: 'Player Core' },
  { name: 'Resilient', level: 8, price: '340 gp', kind: 'fundamental', appliesTo: 'armor', effect: '+1 item bonus to saving throws while the armor is worn.', source: 'Player Core' },
  { name: 'Greater Resilient', level: 14, price: '3,440 gp', kind: 'fundamental', appliesTo: 'armor', effect: '+2 item bonus to saving throws.', source: 'Player Core' },
  { name: 'Major Resilient', level: 20, price: '49,440 gp', kind: 'fundamental', appliesTo: 'armor', effect: '+3 item bonus to saving throws.', source: 'Player Core' },

  // ── Property: weapon ──
  // The four "energy" runes share a level and price; each adds a d6 of its damage type on a hit and
  // has its own critical rider. Riders are stated only where I was sure of them.
  { name: 'Corrosive', level: 8, price: '500 gp', kind: 'property', appliesTo: 'weapon', effect: 'A hit deals an extra 1d6 acid damage; on a critical hit the acid also eats at the target’s armor or shield.', source: 'Player Core' },
  { name: 'Flaming', level: 8, price: '500 gp', kind: 'property', appliesTo: 'weapon', effect: 'A hit deals an extra 1d6 fire damage; a critical hit also inflicts 1d10 persistent fire damage.', source: 'Player Core' },
  { name: 'Frost', level: 8, price: '500 gp', kind: 'property', appliesTo: 'weapon', effect: 'A hit deals an extra 1d6 cold damage.', source: 'Player Core' },
  { name: 'Shock', level: 8, price: '500 gp', kind: 'property', appliesTo: 'weapon', effect: 'A hit deals an extra 1d6 electricity damage; on a critical hit the current also arcs to nearby creatures.', source: 'Player Core' },
  { name: 'Thundering', level: 8, price: '500 gp', kind: 'property', appliesTo: 'weapon', effect: 'A hit deals an extra 1d6 sonic damage; on a critical hit the target must save or be deafened.', source: 'Player Core' },
  { name: 'Ghost Touch', level: 4, price: '75 gp', kind: 'property', appliesTo: 'weapon', effect: 'The weapon harms incorporeal creatures as though they were corporeal, and they can’t ignore it by being incorporeal.', source: 'Player Core' },
  { name: 'Returning', level: 3, price: '55 gp', kind: 'property', appliesTo: 'weapon', effect: 'After a thrown Strike, the weapon flies back to the thrower’s hand at the end of the action.', source: 'Player Core' },
  { name: 'Keen', level: 13, price: '3,000 gp', kind: 'property', appliesTo: 'weapon', effect: 'An attack roll of natural 19 that would be a hit becomes a critical hit instead.', source: 'Player Core' },
  { name: 'Disrupting', level: 5, kind: 'property', appliesTo: 'weapon', effect: 'A hit deals an extra 1d6 vitality damage to undead, and a critically failed save leaves the undead enfeebled.', source: 'Player Core' },
  { name: 'Wounding', level: 7, kind: 'property', appliesTo: 'weapon', effect: 'A hit also deals persistent bleed damage.', source: 'Player Core' },
  { name: 'Grievous', level: 9, kind: 'property', appliesTo: 'weapon', effect: 'Improves the weapon group’s critical specialization effect on a critical hit.', source: 'Player Core' },

  // ── Property: armor ──
  // The five energy-resistant runes are one mechanic in five flavours, so they share an entry each
  // rather than being spelled out ten times.
  { name: 'Acid-Resistant', level: 8, kind: 'property', appliesTo: 'armor', effect: 'Grants resistance 5 to acid; the greater version (level 12) grants resistance 10.', source: 'Player Core' },
  { name: 'Cold-Resistant', level: 8, kind: 'property', appliesTo: 'armor', effect: 'Grants resistance 5 to cold; the greater version (level 12) grants resistance 10.', source: 'Player Core' },
  { name: 'Electricity-Resistant', level: 8, kind: 'property', appliesTo: 'armor', effect: 'Grants resistance 5 to electricity; the greater version (level 12) grants resistance 10.', source: 'Player Core' },
  { name: 'Fire-Resistant', level: 8, kind: 'property', appliesTo: 'armor', effect: 'Grants resistance 5 to fire; the greater version (level 12) grants resistance 10.', source: 'Player Core' },
  { name: 'Sonic-Resistant', level: 8, kind: 'property', appliesTo: 'armor', effect: 'Grants resistance 5 to sonic; the greater version (level 12) grants resistance 10.', source: 'Player Core' },
  { name: 'Fortification', level: 12, kind: 'property', appliesTo: 'armor', effect: 'When you are critically hit, attempt a DC 17 flat check; on a success the critical hit becomes an ordinary hit. Greater fortification (level 18) uses DC 14.', source: 'Player Core' },
  { name: 'Glamered', level: 5, kind: 'property', appliesTo: 'armor', effect: 'The armor can be made to look like ordinary clothing, keeping all its statistics.', source: 'Player Core' },
  { name: 'Invisibility', level: 8, kind: 'property', appliesTo: 'armor', effect: 'Once per day the armor can be activated to turn the wearer invisible for a short time.', source: 'Player Core' },
  { name: 'Shadow', level: 5, kind: 'property', appliesTo: 'armor', effect: '+1 item bonus to Stealth checks; greater and major versions raise the bonus to +2 and +3.', source: 'Player Core' },
  { name: 'Slick', level: 5, kind: 'property', appliesTo: 'armor', effect: '+1 item bonus to Acrobatics checks to Escape and Squeeze; greater and major versions raise it to +2 and +3.', source: 'Player Core' },
];

// ── Items: gear, consumables, alchemical, wondrous ───────────────────────────────────────────────
//
// SOURCE ATTRIBUTION CAVEAT: the Remaster redistributed content across Player Core and GM Core
// (most permanent magic items moved to GM Core). Mundane gear, runes, and baseline consumables are
// attributed to Player Core; the wondrous item below to GM Core. Where a book attribution was
// genuinely uncertain I still had to pick one, so treat `source` on the consumable/magic rows as
// indicative rather than citable — this is logged in PF2_EQUIPMENT_GAPS.
export const PF2_ITEMS: PF2ItemDef[] = [
  // ── Adventuring gear ──
  { name: 'Backpack', level: 0, price: '1 sp', bulk: 'L', traits: [], category: 'gear', effect: 'Carries up to 4 Bulk of goods; the first 2 Bulk inside doesn’t count against you. Worn, it is negligible Bulk itself.', source: 'Player Core' },
  { name: 'Bedroll', level: 0, price: '1 cp', bulk: 'L', traits: [], category: 'gear', effect: 'Somewhere to sleep outdoors.', source: 'Player Core' },
  { name: 'Caltrops', level: 0, price: '3 sp', bulk: 'L', traits: [], category: 'gear', effect: 'Scatter to cover a 5-foot square; a creature entering it risks piercing damage and a reduced Speed until the wound is treated.', source: 'Player Core' },
  { name: 'Chalk', level: 0, price: '1 cp', bulk: '—', traits: [], category: 'gear', effect: 'Ten pieces, for marking a route or a surface.', source: 'Player Core' },
  { name: 'Climbing Kit', level: 0, price: '5 sp', bulk: '1', traits: [], category: 'gear', effect: 'Pitons, a hammer, and rope harness used to Climb more securely.', source: 'Player Core' },
  { name: 'Crowbar', level: 0, bulk: '1', traits: [], category: 'gear', effect: 'Grants an item bonus to Athletics checks to Force Open a door, lid, or lock.', source: 'Player Core' },
  { name: 'Flint and Steel', level: 0, price: '5 cp', bulk: '—', traits: [], category: 'gear', effect: 'Lights a fire given tinder and time.', source: 'Player Core' },
  { name: 'Grappling Hook', level: 0, bulk: 'L', traits: [], category: 'gear', effect: 'Thrown and set to secure a rope for climbing.', source: 'Player Core' },
  { name: "Healer's Tools", level: 0, price: '5 gp', bulk: '1', traits: [], category: 'gear', effect: 'The bandages and instruments required to Treat Wounds, Treat Poison, Treat Disease, or use Battle Medicine. An expanded set also grants an item bonus to Medicine checks.', source: 'Player Core' },
  { name: 'Hooded Lantern', level: 0, price: '7 sp', bulk: 'L', traits: [], category: 'gear', effect: 'Burns oil to cast bright light in a 30-foot radius (and dim light beyond); the hood can shutter it.', source: 'Player Core' },
  { name: 'Bullseye Lantern', level: 0, bulk: 'L', traits: [], category: 'gear', effect: 'Casts bright light in a cone rather than all around, which makes it directional but leaves the wielder’s flanks dark.', source: 'Player Core' },
  { name: 'Rope', level: 0, price: '5 sp', bulk: 'L', traits: [], category: 'gear', effect: '50 feet of rope. Athletics governs what you do with it.', source: 'Player Core' },
  { name: 'Spellbook (Blank)', level: 0, price: '10 gp', bulk: '1', traits: [], category: 'gear', effect: 'Blank pages a prepared arcane caster copies spells into; a wizard needs one to prepare from.', source: 'Player Core' },
  { name: "Thieves' Tools", level: 0, price: '3 gp', bulk: 'L', traits: [], category: 'gear', effect: 'Required to Pick a Lock or Disable a Device by hand. Broken picks can be replaced individually; an infiltrator set grants an item bonus to Thievery.', source: 'Player Core' },
  { name: 'Torch', level: 0, price: '1 cp', bulk: 'L', traits: [], category: 'gear', effect: 'Bright light in a 20-foot radius and dim light beyond, and it can be swung as an improvised weapon that also deals fire damage.', source: 'Player Core' },
  { name: 'Repair Toolkit', level: 0, bulk: '1', traits: [], category: 'gear', effect: 'The tools needed to Repair a damaged item with Crafting.', source: 'Player Core' },
  { name: 'Arrows', level: 0, price: '1 sp', bulk: 'L', traits: [], category: 'gear', effect: 'Ten arrows for a bow. Fired ammunition is generally expended.', source: 'Player Core' },
  { name: 'Crossbow Bolts', level: 0, price: '1 sp', bulk: 'L', traits: [], category: 'gear', effect: 'Ten bolts for a crossbow.', source: 'Player Core' },
  { name: 'Sling Bullets', level: 0, price: '1 cp', bulk: 'L', traits: [], category: 'gear', effect: 'Ten lead bullets for a sling.', source: 'Player Core' },

  // ── Consumables: healing ──
  // The healing-potion ladder is the most-referenced consumable line in the game; grade, level,
  // price, and heal amount are all given because all four are firm.
  { name: 'Minor Healing Potion', level: 1, price: '4 gp', bulk: 'L', traits: ['consumable', 'healing', 'magical', 'potion'], category: 'consumable', activate: '1', usage: 'Drink it', effect: 'Restores 1d8 Hit Points.', source: 'Player Core' },
  { name: 'Lesser Healing Potion', level: 3, price: '12 gp', bulk: 'L', traits: ['consumable', 'healing', 'magical', 'potion'], category: 'consumable', activate: '1', usage: 'Drink it', effect: 'Restores 2d8+5 Hit Points.', source: 'Player Core' },
  { name: 'Moderate Healing Potion', level: 6, price: '50 gp', bulk: 'L', traits: ['consumable', 'healing', 'magical', 'potion'], category: 'consumable', activate: '1', usage: 'Drink it', effect: 'Restores 3d8+10 Hit Points.', source: 'Player Core' },
  { name: 'Greater Healing Potion', level: 12, price: '400 gp', bulk: 'L', traits: ['consumable', 'healing', 'magical', 'potion'], category: 'consumable', activate: '1', usage: 'Drink it', effect: 'Restores 6d8+20 Hit Points.', source: 'Player Core' },
  { name: 'Major Healing Potion', level: 18, price: '5,000 gp', bulk: 'L', traits: ['consumable', 'healing', 'magical', 'potion'], category: 'consumable', activate: '1', usage: 'Drink it', effect: 'Restores 8d8+30 Hit Points.', source: 'Player Core' },

  // ── Alchemical: elixirs and treatments ──
  { name: 'Minor Elixir of Life', level: 1, price: '3 gp', bulk: 'L', traits: ['alchemical', 'consumable', 'elixir', 'healing'], category: 'alchemical', activate: '1', usage: 'Drink it', effect: 'Restores 1d6 Hit Points and grants a +1 item bonus to saves against diseases and poisons for a short time.', source: 'Player Core' },
  { name: 'Lesser Antidote', level: 1, price: '3 gp', bulk: 'L', traits: ['alchemical', 'consumable', 'elixir'], category: 'alchemical', activate: '1', usage: 'Drink it', effect: 'Grants a +2 item bonus to saving throws against poisons for several hours.', source: 'Player Core' },
  { name: 'Lesser Antiplague', level: 1, price: '3 gp', bulk: 'L', traits: ['alchemical', 'consumable', 'elixir'], category: 'alchemical', activate: '1', usage: 'Drink it', effect: 'Grants a +2 item bonus to saving throws against diseases for several hours.', source: 'Player Core' },

  // ── Alchemical: bombs ──
  // Bombs are thrown weapons with the splash trait: splash damage lands even on a miss, and hits
  // everyone adjacent to the target, which is why it is called out separately from the main die.
  { name: "Lesser Alchemist's Fire", level: 1, price: '3 gp', bulk: 'L', traits: ['alchemical', 'bomb', 'consumable', 'fire', 'splash', 'thrown 20 ft'], category: 'alchemical', activate: '1', usage: 'Thrown as a Strike', effect: '1d8 fire damage, 1 persistent fire damage, and 1 fire splash damage.', source: 'Player Core' },
  { name: 'Lesser Acid Flask', level: 1, price: '3 gp', bulk: 'L', traits: ['acid', 'alchemical', 'bomb', 'consumable', 'splash', 'thrown 20 ft'], category: 'alchemical', activate: '1', usage: 'Thrown as a Strike', effect: '1d6 acid damage, 1 persistent acid damage, and 1 acid splash damage.', source: 'Player Core' },
  { name: 'Lesser Frost Vial', level: 1, price: '3 gp', bulk: 'L', traits: ['alchemical', 'bomb', 'cold', 'consumable', 'splash', 'thrown 20 ft'], category: 'alchemical', activate: '1', usage: 'Thrown as a Strike', effect: '1d6 cold damage and 1 cold splash damage; the chill also hampers the target’s movement briefly.', source: 'Player Core' },
  { name: 'Lesser Thunderstone', level: 1, price: '3 gp', bulk: 'L', traits: ['alchemical', 'bomb', 'consumable', 'sonic', 'splash', 'thrown 20 ft'], category: 'alchemical', activate: '1', usage: 'Thrown as a Strike', effect: '1d4 sonic damage and 1 sonic splash damage; those caught in the blast must save or be deafened.', source: 'Player Core' },

  // ── Item categories that are defined by a formula, not a fixed row ──
  // A scroll/wand/staff isn't one item — it's a template parameterised by the spell inside. Level
  // is given because it is a rule (and gates availability); the per-rank price tables are omitted.
  { name: 'Scroll', level: 1, traits: ['consumable', 'magical', 'scroll'], category: 'consumable', usage: 'Held in one hand', activate: 'varies', effect: 'Holds a single spell of one rank, cast once and then consumed, using the scroll’s own rank rather than yours. A scroll of an Nth-rank spell is an item of level 2N−1, so a rank-1 scroll is level 1 and a rank-3 scroll is level 5. Its price rises with the spell’s rank.', source: 'Player Core' },
  { name: 'Wand', level: 3, bulk: 'L', traits: ['magical', 'wand'], category: 'wand', usage: 'Held in one hand', activate: 'varies', effect: 'Holds one spell that can be cast once per day. It can be overcharged for an extra casting, but doing so risks destroying the wand. A wand of an Nth-rank spell is an item of level 2N+1.', source: 'Player Core' },
  { name: 'Staff', level: 3, bulk: '1', traits: ['magical', 'staff'], category: 'staff', usage: 'Held in one hand', activate: 'varies', effect: 'Holds several related spells at a range of ranks. Once prepared for the day it carries charges equal to the highest spell rank you can cast, and casting a spell from it spends charges equal to that spell’s rank.', source: 'Player Core' },

  // ── Wondrous ──
  { name: 'Bag of Holding (Type I)', level: 4, price: '75 gp', bulk: '1', traits: ['extradimensional', 'magical'], category: 'wondrous', usage: 'Carried', effect: 'An extradimensional space that holds far more than its size allows while the bag itself stays 1 Bulk. Living creatures can’t be stored inside, and a damaged bag can spill its contents.', source: 'GM Core' },
];

// ── Convenience lookups (case-insensitive, matching the pattern at the bottom of content.ts) ─────
export const pf2WeaponFull = (name: string) => PF2_WEAPONS_FULL.find(w => w.name.toLowerCase() === name.toLowerCase()) || null;
export const pf2ArmorFull = (name: string) => PF2_ARMORS_FULL.find(a => a.name.toLowerCase() === name.toLowerCase()) || null;
export const pf2Shield = (name: string) => PF2_SHIELDS.find(s => s.name.toLowerCase() === name.toLowerCase()) || null;
export const pf2Rune = (name: string) => PF2_RUNES.find(r => r.name.toLowerCase() === name.toLowerCase()) || null;
export const pf2Item = (name: string) => PF2_ITEMS.find(i => i.name.toLowerCase() === name.toLowerCase()) || null;

/** Any piece of equipment by name, whichever table it lives in — what an AI tool call actually wants. */
export const pf2Equipment = (name: string) =>
  pf2WeaponFull(name) ?? pf2ArmorFull(name) ?? pf2Shield(name) ?? pf2Rune(name) ?? pf2Item(name);

// ── Honest coverage report ───────────────────────────────────────────────────────────────────────
//
// Ground Rule 3 in practice: what is NOT here, and why. Surfaced as data (not a comment) so the UI
// and the AI can both say "not catalogued" instead of implying the value doesn't exist.
export const PF2_EQUIPMENT_GAPS: string[] = [
  'Advanced weapons: only the katana is catalogued. The rest of the advanced table is largely ancestry- or region-named and uncommon; I was not confident of those stat lines and access rules are not modelled.',
  'Uncommon/rare weapons generally (ancestry weapons, firearms) are absent — there is no rarity or access field on PF2WeaponDef yet.',
  'Several mundane gear prices are omitted (crowbar, grappling hook, bullseye lantern, repair toolkit, rations, waterskin, tents) — I was not confident of the exact figures.',
  'Property-rune prices are given only for the level-8 energy runes, ghost touch, returning, and keen. Disrupting, wounding, grievous, the energy-resistant line, fortification, glamered, invisibility, shadow, and slick carry level + mechanic but no price.',
  'Critical-hit riders on the frost rune, and the exact save DCs/conditions on thundering and disrupting, are omitted or stated without numbers.',
  'Elixir of life is catalogued at the minor grade only; the lesser/moderate/greater/major healing values were not firm.',
  'Mutagens, poisons, talismans, oils, and the wider alchemical table are absent.',
  'Precious materials (cold iron, silver, adamantine, mithral, orichalcum) and their price/level tiers are absent — they modify an item rather than being one, and need their own shape.',
  'Specific magic weapons/armor and the wider wondrous-item table are absent apart from one bag of holding; runes cover the maths that the sheet actually needs.',
  'Book attribution on consumables and magic items is indicative: the Remaster moved content between Player Core and GM Core and I could not confirm every placement.',
  'Weapon critical specialization effects (per weapon group) are not catalogued; grievous references them but they are not defined anywhere yet.',
];
