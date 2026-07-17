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

// ── Conditions (18) — the standardized states, with the FULL mechanical text transcribed verbatim from
//    intuitivegames.net/conditions (2026-07-17). The names mirror `systemConditions('intuitive-games')`
//    in system-rules.ts (guarded by a drift test); this list adds the rules body the library + AI need.
export const IG_CONDITIONS: NamedEntry[] = [
  { name: 'Asleep', effect: 'The creature can take no actions and is treated as paralyzed. Any amount of damage, loud noises, or physical contact with another creature may wake the sleeping creature.' },
  { name: 'Blind', effect: 'A blinded creature automatically fails all sight-based perception checks. They are at disadvantage on all attack rolls, reflex saves, and perception checks. If a character is permanently blinded then they may spend a trait to remove the disadvantage on one of the three penalized abilities.' },
  { name: 'Broken', effect: 'A broken item does not function properly. Technological items do not work while broken. Weapons are at disadvantage on attack rolls. Armor provides only half of the normal DR and imposes a -2 penalty on reflex saves. Shields provide no reflex save bonus when broken.' },
  { name: 'Confused', effect: 'A confused creature lashes out against those around it, making attacks wildly with whatever weapon or item it has in its hands. The confused creature must roll a die at the beginning of every turn. If it is an odd number, they cannot tell friend from foe and do everything in their power to attack the nearest creature. If it is an even number, they can tell friend from foe and will either do everything in their power to attack a foe or attack themselves. If they can tell friend from foe and provoke a reaction, they automatically fail their reflex save to avoid an attack if the creature makes one.' },
  { name: 'Deaf', effect: 'A deafened creature automatically fails all hearing-based perception checks. They are at disadvantage on all reflex saves and perception checks. If a character is permanently deafened then they may spend a trait to remove the disadvantage on one of the two penalized abilities.' },
  { name: 'Entangled', effect: 'An entangled creature is at disadvantage on all strength or dexterity-based checks, excluding any checks made to free themselves from whatever is entangling them. An entangled creature cannot move from their current location.' },
  { name: 'Fascinated', effect: 'A fascinated creature can not take any actions. The fascination can be ended prematurely if the fascinated creature is threatened or attacked. The fascinated creature is at disadvantage on all perception checks.' },
  { name: 'Flat-Footed', effect: 'A flat-footed creature does not add their dexterity modifier on any reflex saves or skill checks and can not make reactions. All creatures are flat-footed until they take an action in combat.' },
  { name: 'Grappled', effect: 'Grappled creatures are flat-footed and the creature cannot move from its current location. They also cannot take any actions which require two hands.' },
  { name: 'Heatstroke', effect: 'A creature that has been exposed to blistering heat without ample protection takes one point of nonlethal damage every ten minutes. In addition, they are treated as shaken if they do not succeed a fortitude save every 10 minutes.' },
  { name: 'Hypothermia', effect: 'A creature that has been exposed to freezing cold without ample protection takes one point of nonlethal damage every ten minutes. In addition, they are treated as entangled if they do not succeed a fortitude save every 10 minutes.' },
  { name: 'Incorporeal', effect: 'An incorporeal creature does not take damage from physical attacks and passes through solid objects. This creature can see into the spirit world by spending three actions, and upon doing so it can see through the veil between the worlds into the parallel part of the spirit world that matches where it resides in the natural world. While viewing into the spirit world, an incorporeal creature is considered blind.' },
  { name: 'Invisible', effect: 'An invisible creature gets advantage on stealth checks. Other creatures are considered flat footed to their attacks. If another creature tries to attack the invisible creature, they must identify the square they are attacking. A creature who cannot see their attacker also applies the Blind penalty against them: Disadvantage on all opposed attack rolls and reflex saves. This applies even if the attacker was not invisible, but was just unnoticed by their target until attacking.' },
  { name: 'Paralyzed', effect: 'A paralyzed creature cannot use any actions, reactions, free actions, or do anything else that requires movement. The reflex saves of the creature are always treated as if the creature rolled a Natural 1, only adding their level to the check. Rolling attacks with advantage automatically increases the degree of success by one step, skipping the benefit from the first source of advantage.' },
  { name: 'Pinned', effect: 'The creature is treated as prone along with the usual penalties of being grappled.' },
  { name: 'Prone', effect: 'A prone creature cannot make ranged attacks and is at disadvantage on all melee attack rolls and perception checks.' },
  { name: 'Shaken', effect: 'A shaken creature takes a -2 penalty on attack rolls, saving throws, skill checks, and ability checks.' },
  { name: 'Sickened', effect: 'A sickened creature takes a -2 penalty on attack rolls, saving throws, skill checks, and ability checks. If the creature fails any Fortitude save while sickened, it becomes paralyzed for a number of rounds equal to the amount it failed the save by.' },
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

// ── Powers / Spells, grouped by school (category), with mechanical effect summaries from the template's
//    Data Sheet (Spell List). ─────────────────────────────────────────────────────────────────────────
export const IG_POWERS: NamedEntry[] = [
  { name: 'Dispel Magic', category: 'Abjuration', effect: 'Reaction: when a creature within 30 ft uses a magical/divine ability or casts a spell, make an Arcane check to counter it; if you exceed their roll, their action is lost with no effect.' },
  { name: 'Mage Armor', category: 'Abjuration', effect: '3-action: inflict nonlethal damage on yourself equal to your level to gain that as a bonus on Reflex saves (max = Int modifier); lasts while active but you can’t heal the nonlethal until it ends.' },
  { name: 'Protection from Elements', category: 'Abjuration', effect: 'Grant elemental resistance vs one chosen element equal to your Int modifier, to yourself or another creature.' },
  { name: 'Misdirection', category: 'Abjuration', effect: 'Reaction after being targeted by an attack: Spellcraft check vs the target’s Perception; on success all of that target’s attacks this round are at disadvantage.' },
  { name: 'Shield Ally', category: 'Abjuration', effect: 'Reaction: grant an adjacent ally +2 on a saving throw as it’s called for; the bonus lasts one round.' },
  { name: 'Life Connection', category: 'Abjuration', effect: 'Reaction after taking damage: heal yourself a number of points equal to half your level (not nonlethal).' },
  { name: 'Conjure Wall', category: 'Conjuration', effect: '2-action: create a wall of a chosen material over hexes = level + Int mod, 10 ft tall (stackable); lasts rounds = Int modifier.' },
  { name: 'Companion Shield', category: 'Conjuration', effect: 'If your Companion is adjacent when you’re attacked, it may spend a reaction to grant you +2 Reflex saves vs that attacker until your next turn.' },
  { name: 'Create Shelter', category: 'Conjuration', effect: '10-action: create a shelter of natural materials over hexes = level + Int mod, 10 ft tall.' },
  { name: 'Gate', category: 'Conjuration', effect: '3-action: open a gate into the Echo (distance is divided by 10); spend another 3-action to reopen it and return to your home world.' },
  { name: 'Portal', category: 'Conjuration', effect: 'Action: relocate to a hex within sight, no farther than 5 ft per level; once per round.' },
  { name: 'Summon Material', category: 'Conjuration', effect: 'Summon a chosen material covering contiguous hexes = level + Int mod; it dissipates after rounds = your Spellcraft bonus.' },
  { name: 'Teleportation', category: 'Conjuration', effect: '3-action: teleport to a location you’ve been before, within miles = level + Int modifier.' },
  { name: 'Unseen Servant', category: 'Conjuration', effect: '3-action: conjure an invisible force to perform basic tasks, starting within 30 ft; only one at a time.' },
  { name: 'Material Shield', category: 'Conjuration', effect: 'While touching a known material, spend a reaction to gain +2 Reflex saves until your next turn (usable even as you’re attacked).' },
  { name: 'Detect Magic', category: 'Divination', effect: 'Action: discern magical/supernatural abilities in effect and creatures with arcane or divine connections.' },
  { name: 'Detect Thoughts', category: 'Divination', effect: '2-action: read a target’s active thoughts and emotions within 30 ft (Will save opposed by your Spellcraft check).' },
  { name: 'Foresight', category: 'Divination', effect: 'Meditate uninterrupted to look through the Void and learn about something; choose one option each time you do this.' },
  { name: 'Scrying', category: 'Divination', effect: 'Locate a creature or object (Spellcraft vs the creature’s Will save; an unfamiliar creature gains advantage on the save).' },
  { name: 'Command', category: 'Enchantment', effect: '2-action: Spellcraft vs the creature’s Will; on a failure it takes only a single action that you direct.' },
  { name: 'Enchant Creature', category: 'Enchantment', effect: '2-action: Spellcraft vs Will; the creature is enthralled for a round and follows you, sustained with a single action each turn; range 30 ft.' },
  { name: 'Subtle Manipulation', category: 'Enchantment', effect: 'Substitute a Spellcraft check for a Bluff, Diplomacy, Intimidate, or Perform check (+2 if trained in the imitated skill).' },
  { name: 'Elemental Blast', category: 'Evocation', effect: 'Proficient ranged elemental attack, range 30 ft, damage = level + Int mod; choose the damage type each attack (Acid/Cold/Electricity/Fire/Sonic). Takes 2 actions and provokes unless you have Careful Caster/Shot.' },
  { name: 'Intense Blast', category: 'Evocation', effect: 'Deal an additional 1d6 damage with one element when using your blast.' },
  { name: 'Piercing Element', category: 'Evocation', effect: 'Ignore an amount of elemental resistance or damage reduction equal to your level with one type of elemental damage.' },
  { name: 'Wide Blast', category: 'Evocation', effect: 'Increase the number of targets you can hit with one of your elemental attacks by two.' },
  { name: 'Telekinesis', category: 'Evocation', effect: '2-action: force a target creature or object to move in a chosen direction.' },
  { name: 'Wind Blast', category: 'Evocation', effect: 'Proficient bludgeoning attack equal to your Elemental Blast; also extinguishes open flames and disperses fog/mist in a radius = your blast range.' },
  { name: 'Create Image', category: 'Illusion', effect: '2-action: create an image over hexes = Spellcraft mod, 5 ft tall (stackable), sustained with a single action; non-sight senses grant a Will save vs your Spellcraft to disbelieve.' },
  { name: 'Darkness', category: 'Illusion', effect: 'Lower illumination two steps in a radius = Int mod; duration rounds = Spellcraft; range = Spellcraft hexes.' },
  { name: 'Invisibility', category: 'Illusion', effect: 'Touch a creature or object to make it invisible for rounds = Spellcraft modifier; ends if the subject attacks.' },
  { name: 'Light', category: 'Illusion', effect: 'Raise illumination two steps in a radius = Int mod; duration rounds = Spellcraft; range = Spellcraft hexes.' },
  { name: 'Mimic Sound', category: 'Illusion', effect: '2-action: create a sound within 20 ft (+20 ft per level), sustained/adjusted with a single action; hearers make Perception vs your Spellcraft.' },
  { name: 'Mirror Image', category: 'Illusion', effect: '2-action: create 1d4 mirror images for one minute; attackers must roll to pick you out of the remaining images to hit you.' },
  { name: 'Adaptation', category: 'Transmutation', effect: 'Grant a touched creature adaptation to a natural climate for hours = Int modifier (Aura Mastery extends targets + range).' },
  { name: 'Natural Attacks', category: 'Transmutation', effect: '2-action: grant a touched creature natural attacks dealing 1d6 (claw, bite, etc.) (Aura Mastery extends targets + range).' },
  { name: 'New Movement', category: 'Transmutation', effect: 'Grant a touched creature a new movement form (wings, webbed feet, etc.); an existing form increases instead (Aura Mastery extends).' },
];

// ── Actions, grouped by the 3-action economy (Reference Sheet). ──────────────────────────────────────
export const IG_ACTION_ECONOMIES = ['Single', 'Double', 'Triple', 'Reaction', 'Other'] as const;
export type IGActionEconomy = typeof IG_ACTION_ECONOMIES[number];
export interface IGAction { name: string; economy: IGActionEconomy; note?: string; }
export const IG_ACTIONS: IGAction[] = [
  { name: 'Attack', economy: 'Single' }, { name: 'Interact', economy: 'Single' },
  { name: 'Support Ally', economy: 'Single' }, { name: 'Direct Companion Creature', economy: 'Single' },
  { name: 'Combat Skills', economy: 'Single' }, { name: 'Stride', economy: 'Single' }, { name: 'Step', economy: 'Single' },
  { name: 'Redistribution', economy: 'Double' }, { name: 'Combat Skills (double)', economy: 'Double' },
  { name: 'Death Spiral', economy: 'Triple', note: 'feat' },
  { name: 'Defensive Power', economy: 'Reaction' }, { name: 'Attack of Opportunity', economy: 'Reaction' },
  { name: 'Martyr', economy: 'Reaction', note: 'feat' }, { name: 'Relentless', economy: 'Reaction', note: 'feat' },
  { name: 'Parry', economy: 'Reaction', note: 'feat' }, { name: 'Bodyguard', economy: 'Reaction', note: 'feat' },
  { name: 'Quick Draw', economy: 'Other', note: 'free' }, { name: 'Talking', economy: 'Other', note: 'free' },
];

// ── Companion-creature bestiary — the full creature list grouped by category (Data Sheet: Creatures). ──
export interface IGCreature { name: string; group: string; }
export const IG_CREATURES: IGCreature[] = [
  // Animals
  ...['Ape', 'Canine', 'Feline', 'Vulpine', 'Ursine', 'Rodent', 'Suidae', 'Bovine', 'Equine', 'Whales', 'Dolphins',
    'Lizard', 'Snake', 'Turtle/Tortoise', 'Songbird', 'Predator bird', 'Scavenger bird', 'Corvid', 'Owl',
    'Frog/Toad', 'Salamander', 'Worm', 'Insect (Flying)', 'Insect (Burrowing)', 'Spider', 'Scorpion',
    'Fish (Herbivore)', 'Fish (Carnivore)', 'Squid', 'Octopus', 'Crustacean'].map((name) => ({ name, group: 'Animals' })),
  // Dragons
  ...['Red Dragon', 'Orange Dragon', 'Yellow Dragon', 'Green Dragon', 'Blue Dragon', 'Purple Dragon', 'Black Dragon',
    'White Dragon', 'Brown Dragon', 'Diamond Dragon'].map((name) => ({ name, group: 'Dragons' })),
  // Elementals
  ...['Corrosive Elemental', 'Cold Elemental', 'Lightning Elemental', 'Flame Elemental', 'Sound Elemental',
    'Earth Elemental', 'Plant Elemental', 'Metal Elemental', 'Water Elemental', 'Wind Elemental'].map((name) => ({ name, group: 'Elementals' })),
  // Fey
  ...['Dryad', 'Naiad', 'Treant', 'Leshy', 'Pink Fairy', 'Teal Fairy', 'Sage Fairy', 'Lavender Fairy', 'Sun Nymph',
    'Moon Nymph', 'Gold Gremlin', 'Silver Gremlin', 'Bronze Gremlin', 'Copper Gremlin'].map((name) => ({ name, group: 'Fey' })),
  // Magical Beasts
  ...['Unicorn', 'Alicorn', 'Pegasus', 'Griffon', 'Hydra', 'Kraken', 'Phoenix', 'Sphinx', 'Wyvern'].map((name) => ({ name, group: 'Magical Beasts' })),
  // Undead
  ...['Ghost', 'Skeleton', 'Vampire', 'Wraith', 'Zombie', 'Werewolf'].map((name) => ({ name, group: 'Undead' })),
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

// The Combat Skills (Sheet 4) — tracked separately from general skills. Str/Dex variants share these names.
export const IG_COMBAT_SKILLS = new Set(['Dirty Trick', 'Disarm', 'Feint', 'Grapple', 'Overrun', 'Reposition', 'Steal', 'Sunder', 'Trip']);
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
  // A companion's creature is either a group name (Dragons) or a specific bestiary entry (Griffon) — both vanilla.
  'creature-type': [...IG_CREATURE_TYPES, ...IG_CREATURES.map((c) => c.name)],
};

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Actions grouped by the 3-action economy (Single/Double/Triple/Reaction/Other). */
export function igActionsByEconomy(): Record<IGActionEconomy, IGAction[]> {
  const out = Object.fromEntries(IG_ACTION_ECONOMIES.map((e) => [e, [] as IGAction[]])) as Record<IGActionEconomy, IGAction[]>;
  for (const a of IG_ACTIONS) out[a.economy].push(a);
  return out;
}

/** The bestiary grouped by category (Animals, Dragons, Elementals, Fey, Magical Beasts, Undead). */
export function igCreaturesByGroup(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of IG_CREATURES) (out[c.group] ??= []).push(c.name);
  return out;
}

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
