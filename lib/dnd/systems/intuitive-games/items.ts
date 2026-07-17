// lib/dnd/systems/intuitive-games/items.ts — the Intuitive Games gear rules (weapons + armor + shields),
// transcribed from intuitivegames.net (/weapons, /armor-shields). Source-only. The WEAPONS page is a
// declared work-in-progress: it defines the mechanical framework (classes, properties, costs) but lists NO
// named weapons yet — recorded as WIP here, not fabricated. The ARMOR & SHIELDS page is complete.

// ── Weapons (WIP on the site: framework only, no named roster) ──────────────────────────────────────
export const IG_WEAPON_RULES =
  'Weapons are organized by CLASS (Light / One-Handed / Two-Handed / Heavy for melee; One-Handed / Two-Handed ' +
  '/ Heavy for ranged) and DAMAGE TYPE (bludgeoning, piercing, slashing); proficiency covers a class + type ' +
  '(e.g. "Heavy Slashing"). Each weapon has one base property; extra properties add cost and a multi-property ' +
  'weapon loses damage dice for each property beyond the first. Prices use Solidas / Coins / Pennies (10 ' +
  'Pennies = 1 Coin; 2 Coins = 1 Solidas). NOTE: the site’s weapons page is a WORK IN PROGRESS — it ' +
  'defines the system but lists NO specific named weapons yet.';

export interface IGWeaponClass { name: string; kind: 'Melee' | 'Ranged'; cost: string; notes: string }
export const IG_WEAPON_CLASS_DATA: IGWeaponClass[] = [
  { name: 'Light', kind: 'Melee', cost: '10 Solidas', notes: 'Automatically has the Throwing property.' },
  { name: 'One-Handed', kind: 'Melee', cost: '15 Solidas', notes: 'Standard single-hand weapon.' },
  { name: 'Two-Handed', kind: 'Melee', cost: '20 Solidas', notes: 'Requires both hands.' },
  { name: 'Heavy', kind: 'Melee', cost: '30 Solidas', notes: 'The largest melee weapons.' },
  { name: 'One-Handed Ranged', kind: 'Ranged', cost: '10 Solidas', notes: '1d6 damage, 50-foot range.' },
  { name: 'Two-Handed Ranged', kind: 'Ranged', cost: '20 Solidas', notes: '1d8 damage, 80-foot range.' },
  { name: 'Heavy Ranged', kind: 'Ranged', cost: '30 Solidas', notes: 'Adds Strength modifier to damage; requires a Strength threshold to reload.' },
  { name: 'Ammunition', kind: 'Ranged', cost: '1 Solidas', notes: '50 units per purchase.' },
];

export interface IGWeaponProperty { name: string; appliesTo: 'Melee' | 'Ranged' | 'Both'; text: string }
export const IG_WEAPON_PROPERTIES: IGWeaponProperty[] = [
  { name: 'Alternate Damage', appliesTo: 'Melee', text: '+1 Solidas. Switch between two damage types as a free action.' },
  { name: 'Double-Ended', appliesTo: 'Melee', text: '+10 Solidas. Deals damage on both ends.' },
  { name: 'Expanded Critical', appliesTo: 'Both', text: 'Score a critical on a total 15+ higher than the target instead of 20+.' },
  { name: 'Nonlethal', appliesTo: 'Melee', text: 'Bludgeoning only; deals nonlethal damage.' },
  { name: 'Powerful Critical', appliesTo: 'Both', text: 'Critical hits deal triple damage.' },
  { name: 'Throwing', appliesTo: 'Melee', text: '20-foot range (or 50 feet with the Greater variant for light weapons).' },
  { name: 'Reach', appliesTo: 'Melee', text: '+5 Solidas. Attack targets 10 feet away.' },
  { name: 'Engineered', appliesTo: 'Both', text: 'Requires proficiency; grants trained status with one combat skill when using it.' },
  { name: 'Additional Range', appliesTo: 'Ranged', text: 'Multiply the weapon’s range by 1.5×.' },
];

// ── Armor & Shields (complete on the site) ──────────────────────────────────────────────────────────
export const IG_ARMOR_RULES =
  'Armor grants Damage Reduction (DR) based on its material and type, which directly reduces incoming damage. ' +
  'A character NOT proficient with the armor takes a penalty on Reflex saves equal to the DR it grants. A ' +
  'character not proficient with a shield takes a penalty on attack rolls equal to the shield’s Reflex-save bonus.';

export interface IGArmor { name: string; group: 'Full' | 'Banded' | 'Component'; dr: string; strength: string; cost: string; notes: string }
export const IG_ARMORS: IGArmor[] = [
  { name: 'Metal Armor', group: 'Full', dr: '8', strength: 'STR 16', cost: '200 Solidas', notes: 'Vulnerable to electricity and fire (1d6 damage).' },
  { name: 'Leather Armor', group: 'Full', dr: '6', strength: 'STR 14', cost: '125 Solidas', notes: '' },
  { name: 'Wood Armor', group: 'Full', dr: '4', strength: 'STR 12', cost: '40 Solidas', notes: 'Loses 1 Structure Point when exposed to flame.' },
  { name: 'Bone Armor', group: 'Full', dr: '4', strength: 'STR 12', cost: '40 Solidas', notes: '' },
  { name: 'Cloth Armor', group: 'Full', dr: '2', strength: 'STR 10', cost: '10 Solidas', notes: '' },
  { name: 'Banded Metal', group: 'Banded', dr: '6', strength: 'STR 14', cost: '100 Solidas', notes: 'Fire/electricity vulnerabilities.' },
  { name: 'Banded Leather', group: 'Banded', dr: '4', strength: 'STR 12', cost: '50 Solidas', notes: '' },
  { name: 'Component Armor', group: 'Component', dr: '1–2 per piece', strength: 'STR 10 (2+ pieces), STR 12 (all four)', cost: '—', notes: 'Stackable pieces: helmet, breastplate, bracers, greaves.' },
];

export const IG_SHIELD_RULES =
  'Braced shields give a +2 Reflex bonus passively and +2 more when readied (they require a full hand). ' +
  'Bucklers give no passive bonus and +2 when readied (forearm-mounted, so the hand stays free).';

export interface IGShield { name: string; group: 'Braced' | 'Buckler'; cost: string; notes: string }
export const IG_SHIELDS: IGShield[] = [
  { name: 'Metal Shield', group: 'Braced', cost: '20 Solidas', notes: 'Fire/electricity penalties.' },
  { name: 'Stone Shield', group: 'Braced', cost: '20 Solidas', notes: 'Requires STR 14.' },
  { name: 'Wooden Shield', group: 'Braced', cost: '15 Solidas', notes: 'Flame vulnerability.' },
  { name: 'Metal Buckler', group: 'Buckler', cost: '10 Solidas', notes: '' },
  { name: 'Stone Buckler', group: 'Buckler', cost: '10 Solidas', notes: '' },
  { name: 'Wooden Buckler', group: 'Buckler', cost: '5 Solidas', notes: '' },
];
