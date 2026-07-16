// lib/dnd/systems/intuitive-games/content.ts — the VANILLA content library for the Intuitive Games
// system (Phase V, IG builder Slice 1). This is the authoritative registry of what "from the system"
// means: stances, feats, powers/spells, defensive powers, weapon-type taxonomy, movement types,
// subclasses, backgrounds, and companion creature types. The provenance classifier (Slice 2) compares a
// character's elements against these lists to flag each as vanilla or custom.
//
// Content is stored as mechanical facts (names + concise effect summaries), drawn from the uploaded
// Intuitive Games Character Sheet Template and intuitivegames.net — the same fact-only approach the
// 5e/PF2/Intuitive-Games rules catalog already uses. Names are the recognition key; effects are for the
// sheet/grounding. Extend a list to teach the system a new vanilla element.

export interface NamedEntry {
  name: string;
  /** Grouping (e.g. a spell's school, a feat's General/Combat bucket). */
  category?: string;
  /** A concise mechanical summary (optional; present for the elements that carry rules text). */
  effect?: string;
}

// ── Stances (10) — each has an A and B benefit; you adopt one at a time. ────────────────────────────
export const IG_STANCES: NamedEntry[] = [
  { name: 'Offensive', effect: 'A: advantage on attacks, disadvantage on Reflex saves. B: +½ level to damage rolls.' },
  { name: 'Defensive', effect: 'A: disadvantage on attacks, advantage on Reflex saves. B: Damage Reduction equal to ½ level.' },
  { name: 'Neutral', effect: 'A: enemies gain no stance attack/flanking bonuses against you. B: you ignore enemies’ stance bonuses.' },
  { name: 'Mobile', effect: 'A: moving into a threatened area no longer provokes reactions. B: you no longer provoke reactions from enemies.' },
  { name: 'Shifting', effect: 'A: you can’t be flanked. B: a missed attack against you provokes a reaction.' },
  { name: 'Welcoming', effect: 'A: an ally can share your square. B: an ally sharing your square gains +½ level to Reflex saves.' },
  { name: 'Swarming', effect: 'A: advantage on attacks when flanking. B: +½ level to attack rolls when flanking.' },
  { name: 'Precise', effect: 'A: Sneak Attack (+1d6) vs a flanked or Unconscious/Entangled/Paralyzed/Blinded target. B: Sneak Attack increases to 2d6.' },
  { name: 'Supportive', effect: 'A: you count as flanking when a threatening ally also threatens the enemy. B: flanking allies gain +½ level to attacks.' },
  { name: 'Menacing', effect: 'A: advantage on trained combat skills. B: advantage on all combat skills.' },
];

// ── Feats — General + Combat + special powers referenced by the sheet. ──────────────────────────────
export const IG_FEATS: NamedEntry[] = [
  { name: 'Toughness', category: 'General' },
  { name: 'Boundless Stamina', category: 'General' },
  { name: 'Armor Proficiency', category: 'General' },
  { name: 'Improviser', category: 'General' },
  { name: 'Inspiring Insight', category: 'General' },
  { name: 'Daring Quickness', category: 'General' },
  { name: 'Versatile', category: 'General' },
  { name: 'Aura Mastery', category: 'General' },
  { name: 'Quick Draw', category: 'Combat' },
  { name: 'Parry', category: 'Combat' },
  { name: 'Bodyguard', category: 'Combat' },
  { name: 'Martyr', category: 'Combat' },
  { name: 'Relentless', category: 'Combat' },
  { name: 'Death Spiral', category: 'Combat' },
  { name: 'Redistribution', category: 'Combat' },
  { name: 'Power Attack', category: 'Combat' },
  { name: 'Weapon Focus', category: 'Combat' },
  { name: 'Weapon Specialization', category: 'Combat' },
  { name: 'Careful Caster', category: 'Combat' },
  { name: 'Careful Shot', category: 'Combat' },
];

// ── Powers / Spells, grouped by school (category). ──────────────────────────────────────────────────
export const IG_POWERS: NamedEntry[] = [
  { name: 'Dispel Magic', category: 'Abjuration' }, { name: 'Mage Armor', category: 'Abjuration' },
  { name: 'Protection from Elements', category: 'Abjuration' }, { name: 'Misdirection', category: 'Abjuration' },
  { name: 'Shield Ally', category: 'Abjuration' }, { name: 'Life Connection', category: 'Abjuration' },
  { name: 'Conjure Wall', category: 'Conjuration' }, { name: 'Companion Shield', category: 'Conjuration' },
  { name: 'Create Shelter', category: 'Conjuration' }, { name: 'Gate', category: 'Conjuration' },
  { name: 'Portal', category: 'Conjuration' }, { name: 'Summon Material', category: 'Conjuration' },
  { name: 'Teleportation', category: 'Conjuration' }, { name: 'Unseen Servant', category: 'Conjuration' },
  { name: 'Material Shield', category: 'Conjuration' },
  { name: 'Detect Magic', category: 'Divination' }, { name: 'Detect Thoughts', category: 'Divination' },
  { name: 'Foresight', category: 'Divination' }, { name: 'Scrying', category: 'Divination' },
  { name: 'Command', category: 'Enchantment' }, { name: 'Enchant Creature', category: 'Enchantment' },
  { name: 'Subtle Manipulation', category: 'Enchantment' },
  { name: 'Elemental Blast', category: 'Evocation' }, { name: 'Intense Blast', category: 'Evocation' },
  { name: 'Piercing Element', category: 'Evocation' }, { name: 'Wide Blast', category: 'Evocation' },
  { name: 'Telekinesis', category: 'Evocation' }, { name: 'Wind Blast', category: 'Evocation' },
  { name: 'Create Image', category: 'Illusion' }, { name: 'Darkness', category: 'Illusion' },
  { name: 'Invisibility', category: 'Illusion' }, { name: 'Light', category: 'Illusion' },
  { name: 'Mimic Sound', category: 'Illusion' }, { name: 'Mirror Image', category: 'Illusion' },
  { name: 'Adaptation', category: 'Transmutation' }, { name: 'Natural Attacks', category: 'Transmutation' },
  { name: 'New Movement', category: 'Transmutation' },
];

export const IG_SPELL_SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Transmutation'] as const;

// ── Defensive Powers (spent as reactions). ──────────────────────────────────────────────────────────
export const IG_DEFENSIVE_POWERS: NamedEntry[] = [
  { name: 'Companion Shield', effect: 'Companion spends a reaction to give you +2 Reflex saves vs an attacker until your next turn.' },
  { name: 'Material Shield', effect: 'Touching a known material, spend a reaction for +2 Reflex saves until your next turn.' },
  { name: 'Armor Skin', effect: 'As an action, gain Damage Reduction equal to your level for one minute.' },
  { name: 'Redirect', effect: 'On a successful Reflex save, spend a reaction to redirect the attack at another target in range.' },
  { name: 'Sidestep', effect: 'On a successful Reflex save vs an attack, take a free 5-foot step.' },
  { name: 'Counterattack', effect: 'When attacked, spend a reaction to attack the aggressor if they’re within your weapon’s range.' },
];

// ── Weapon-type taxonomy: {Light, One-Handed, Two-Handed, Heavy, Ranged} × {Slashing, Piercing, Bludgeoning}. ──
export const IG_WEAPON_CLASSES = ['Light', 'One-Handed', 'Two-Handed', 'Heavy', 'Ranged'] as const;
export const IG_DAMAGE_TYPES = ['Slashing', 'Piercing', 'Bludgeoning'] as const;
export const IG_WEAPON_TYPES: string[] = IG_WEAPON_CLASSES.flatMap((c) => IG_DAMAGE_TYPES.map((d) => `${c} ${d}`));

// ── Movement types. ─────────────────────────────────────────────────────────────────────────────────
export const IG_MOVEMENT_TYPES: string[] = ['None', 'Fast', ...['Fly', 'Climb', 'Burrow', 'Swim'].flatMap((m) => [10, 20, 30].map((n) => `${m} ${n}`))];

// ── Subclasses + backgrounds (the documented ones; extensible). ─────────────────────────────────────
// The five SUBCLASSES from the template's "Subclass List" (Data Sheet) — distinct from the 13 classes.
export const IG_SUBCLASSES: string[] = ['Arcanist', 'Summoner', 'Champion', 'Witch', 'Shifter'];
export const IG_BACKGROUNDS: string[] = [];

// ── Companion creature type categories (the bestiary groups). ───────────────────────────────────────
export const IG_CREATURE_TYPES: string[] = ['Animals', 'Dragons', 'Elementals', 'Fey', 'Magical Beasts', 'Undead', 'Humanoid Monsters'];

// ── The recognized element kinds + their vanilla name lists (used by the classifier). Ancestries,
//    classes, skills, and conditions come from the shared rules catalog (system-rules.ts), so they're
//    resolved there; the kinds below are Intuitive-Games-specific content. ──────────────────────────
export type IGContentKind =
  | 'stance' | 'feat' | 'power' | 'spell' | 'defensive-power' | 'weapon-type' | 'movement-type'
  | 'subclass' | 'background' | 'creature-type';

const KIND_NAMES: Record<IGContentKind, string[]> = {
  stance: IG_STANCES.map((s) => s.name),
  feat: IG_FEATS.map((f) => f.name),
  power: IG_POWERS.map((p) => p.name),
  spell: IG_POWERS.map((p) => p.name), // "spell" is an alias for a power in this system
  'defensive-power': IG_DEFENSIVE_POWERS.map((d) => d.name),
  'weapon-type': IG_WEAPON_TYPES,
  'movement-type': IG_MOVEMENT_TYPES,
  subclass: IG_SUBCLASSES,
  background: IG_BACKGROUNDS,
  'creature-type': IG_CREATURE_TYPES,
};

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** The vanilla names for an Intuitive Games content kind (empty for an unknown kind). */
export function igVanillaNames(kind: IGContentKind): string[] {
  return KIND_NAMES[kind] ?? [];
}

/** True when `name` is a recognized vanilla element of `kind` in the Intuitive Games system. */
export function igIsVanilla(kind: IGContentKind, name: string): boolean {
  const set = new Set(igVanillaNames(kind).map(norm));
  return set.has(norm(name));
}

/** The full content catalog for grounding/UI (name lists per kind). */
export function igContentSummary(): Record<IGContentKind, string[]> {
  return { ...KIND_NAMES };
}
