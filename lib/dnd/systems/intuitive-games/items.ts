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

// ── Currency ────────────────────────────────────────────────────────────────────────────────────────
export const IG_CURRENCY = '10 Pennies (silver) = 1 Coin; 2 Coins = 1 Solidas (gold).';

// ── Equipment (partial WIP on the site: packs + kits populated; other tables are empty headers) ──────
export interface IGPack { name: string; cost: string; contents: string }
export const IG_EQUIPMENT_PACKS: IGPack[] = [
  { name: "Adventurer's Pack", cost: '8 Solidas', contents: 'Rope, map, compass, flint, torch, carving knife, pot, mug, waterskins, tent, blanket, and bandages.' },
  { name: "Craftsman's Pack", cost: '10 Solidas', contents: "A professional's kit, map, cooking/drinking items, shelter, and basic supplies." },
  { name: "Emissary's Pack", cost: '6 Solidas', contents: 'A religious token and tome, plus standard camping gear.' },
  { name: "Wanderer's Pack", cost: '2 Solidas', contents: 'A minimal kit with cooking, drinking, and shelter items.' },
];
/** Professional / crafting kits — 4 Solidas each. */
export const IG_PROFESSIONAL_KITS = ["Artisan's", "Brewer's", "Butcher's", "Carpenter's", "Cartographer's", "Mason's", "Smith's", "Weaver's"];
export const IG_EQUIPMENT_NOTE =
  `Currency: ${IG_CURRENCY} Professional/crafting kits cost 4 Solidas each: ${["Artisan's", "Brewer's", "Butcher's", "Carpenter's", "Cartographer's", "Mason's", "Smith's", "Weaver's"].join(', ')}. ` +
  'NOTE: the site also has Outdoor Equipment, Tools, Refined Items, Sustenance, and Materials tables, but they are present as empty headers only — that content is a work in progress.';

// ── Tools (WIP on the site: the concept is defined, no roster) ───────────────────────────────────────
export const IG_TOOL_RULES =
  'Tools serve two functions: some checks require the right tool, and a character trained with a specific ' +
  'tool set gains proficiency on the relevant skill checks (e.g. someone trained with lockpicking tools makes ' +
  'a Disable Device check as if proficient, regardless of their normal training in the skill). NOTE: the ' +
  'site’s Tools page is a WORK IN PROGRESS — it explains the concept but lists no specific tools or costs ' +
  '(it points to the Equipment tab for tool details).';

// ── Magical Items (complete on the site: the Eldritch Jewels system + 12 enchantments) ──────────────
export const IG_MAGIC_ITEM_RULES =
  'Magical power comes from Eldritch Jewels — gems enchanted via a DC 30 Spellcraft check plus a magical ' +
  'component (dragon scales, phoenix feathers, etc.), taking 50 work-hours per enhancement (each new ' +
  'enchantment is a fresh attempt with new components; several small gems can substitute for one large gem, ' +
  '+5 DC per enchantment). You can wear at most 5 jewels at once (more knocks you unconscious), and jewels ' +
  'placed too close together go inert. Slots: Head (1), Arms (1), Legs (1), Torso (2). A burnt-out jewel is ' +
  'recharged with a DC 20 Arcana check (trained only, three actions; on a failure it deals nonlethal damage ' +
  'equal to the shortfall). Pricing: one enhancement 100 Solidas, two 250, three 625.';

export interface IGEnchantment { name: string; effect: string }
export const IG_ENCHANTMENTS: IGEnchantment[] = [
  { name: 'Bonded Weapon', effect: 'A dismissible/summonable weapon granting proficiency or +2 to attack/damage; burns out after 10 summons.' },
  { name: 'Elemental Assault', effect: 'Melee elemental damage — 5 charges, 5 points each.' },
  { name: 'Elemental Blast', effect: 'Ranged elemental damage — 2 charges, 10 points each.' },
  { name: 'Enhanced Movement', effect: 'Grants or boosts movement speeds; lasts 1 day of active use.' },
  { name: 'Enhanced Sense', effect: 'Grants or extends sensory abilities; lasts 1 day of active use.' },
  { name: 'Enhanced Skill', effect: '+2 bonus to a chosen skill; never burns out.' },
  { name: 'Healing', effect: 'Restores up to 20 HP per jewel.' },
  { name: 'Heavyweight', effect: 'Increases gravity effects with damage/defense tradeoffs; lasts 1 minute.' },
  { name: 'Invisibility', effect: '20 rounds of invisibility.' },
  { name: 'Lightweight', effect: 'Reduces gravity effects with speed/defense tradeoffs; lasts 1 minute.' },
  { name: 'Protection from Elements', effect: 'Absorbs 20 points of a chosen elemental damage type.' },
  { name: 'Teleportation', effect: 'Single-use transport to "The Echo" pocket dimension.' },
];
