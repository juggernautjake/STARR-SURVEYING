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

import { igAllFeats } from './feats';

export interface NamedEntry {
  name: string;
  /** Grouping (e.g. a spell's school, a feat's General/Combat bucket). */
  category?: string;
  /** A concise mechanical summary (optional; present for the elements that carry rules text). */
  effect?: string;
}

// ── Stances (10) — each has a Basic (below level 5) and an Advanced (level 5+) benefit; you adopt one at
//    a time. General rules + per-stance text transcribed verbatim from intuitivegames.net/stances
//    (2026-07-17). IG_STANCE_DEFS is the structured source of truth (used by the library table + the
//    stance editor); IG_STANCES is the derived NamedEntry list the classifier + grounding consume.
export const IG_STANCE_RULES =
  'Stances are activated using an action and last for one minute. Only one stance can be active at any ' +
  'time, and can be ended with a free action on a creature’s turn. Characters below Level 5 gain the ' +
  'Basic benefit; at Level 5+ they gain the Advanced benefit instead.';

export interface IGStance {
  name: string;
  /** Benefit for a character below level 5. */
  basic: string;
  /** Added/replacing benefit at level 5+. */
  advanced: string;
}

export const IG_STANCE_DEFS: IGStance[] = [
  { name: 'Offensive', basic: 'You gain advantage on all attack rolls, but disadvantage on all Reflex saves.', advanced: 'You gain a bonus on all damage rolls equal to half your level.' },
  { name: 'Defensive', basic: 'You gain disadvantage on all attack rolls, and advantage on all Reflex saves.', advanced: 'You gain Damage Reduction equal to half your level.' },
  { name: 'Neutral', basic: 'You ignore all of your opponents’ stance bonuses that enhance attack rolls, including flanking effects.', advanced: 'You ignore all of your opponents’ stance bonuses.' },
  { name: 'Mobile', basic: 'The character no longer provokes reactions from moving through a threatened area.', advanced: 'You no longer provoke reactions.' },
  { name: 'Shifting', basic: 'You can’t be flanked.', advanced: 'If an attack misses you, it provokes a reaction.' },
  { name: 'Welcoming', basic: 'Allies can share your square.', advanced: 'One ally gains a bonus on Reflex saves equal to half your level when sharing your square.' },
  { name: 'Swarming', basic: 'You gain advantage on attack rolls when flanking.', advanced: 'You gain a bonus on attack rolls equal to half your level when flanking.' },
  { name: 'Precise', basic: 'You deal an extra 1d6 sneak attack damage when flanking or when the target is Unconscious, Entangled, Paralyzed, or Blinded.', advanced: 'Your sneak attack damage increases to 2d6.' },
  { name: 'Supportive', basic: 'You count as flanking when you threaten an enemy that an ally also threatens.', advanced: 'You grant flanking allies an attack bonus equal to half your level.' },
  { name: 'Menacing', basic: 'You gain advantage on trained combat skills.', advanced: 'You gain advantage on all combat skills.' },
];

export const IG_STANCES: NamedEntry[] = IG_STANCE_DEFS.map((s) => ({
  name: s.name,
  effect: `Basic (below Lv 5): ${s.basic} Advanced (Lv 5+): ${s.advanced}`,
}));

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

// ── Ancestries (10) — each has two ancestry traits, with the FULL trait text transcribed verbatim from
//    intuitivegames.net/traits-ancestries (2026-07-17). Names mirror `systemSpecies('intuitive-games')`
//    (drift-guarded). IG has no fixed per-ancestry size/speed — characters are Medium by default and
//    certain traits (Burrower, Colossal, Big-Boned, Pixie, Lightfoot) change size/speed themselves.
export const IG_ANCESTRY_TRAIT_RULES =
  'Traits are chosen in a variety of circumstances. Traits cannot be retrained and can only be added when ' +
  'a character is leveling up unless they are Situational Traits. Standard (non-ancestry) traits available ' +
  'to anyone: gain two ability score boosts to different scores; gain a skill proficiency; gain proficiency ' +
  'with any two weapon groups; or learn a new stance. Ancestry traits are exclusive to their ancestry.';

export interface IGAncestryTrait { name: string; text: string; }
export interface IGAncestry {
  name: string;
  /** Short flavor line from the site. */
  blurb: string;
  traits: IGAncestryTrait[];
}

export const IG_ANCESTRIES: IGAncestry[] = [
  { name: 'Dwarf', blurb: 'Short, wide humanoids with large coarse hair; males keep long beards. Mountain dwellers.', traits: [
    { name: 'Cave Vision', text: 'Gain darkvision out to a range of 30 feet.' },
    { name: 'Robust', text: 'You gain a +2 bonus on fortitude saves. Gain advantage on fortitude saves against venoms and poisons, including alcohol.' },
  ] },
  { name: 'Elf', blurb: 'Tall, narrow humanoids with soft features, pointed ears, and melodic voices. Live near fresh water.', traits: [
    { name: 'Swift', text: 'Increase movement speed by 10 feet.' },
    { name: 'Near Perfect', text: 'Once per day, gain advantage on any one saving throw, skill check, or ability check.' },
  ] },
  { name: 'Gnome', blurb: 'Short humanoids with precise claws. Volcano enthusiasts who burrow underground.', traits: [
    { name: 'Burrower', text: 'Change size to small instead of medium. Ability increase to dexterity. Ability penalty to strength. Gain a +2 bonus on stealth checks. Decrease damage dice by one step. Gain a burrow speed of 20 feet with your tough nails. Your land speed is reduced to 15 feet.' },
    { name: 'Crafty', text: 'Gain proficiency in any one Craft skill and any one Profession skill.' },
  ] },
  { name: 'Halfling', blurb: 'Short humanoids with curly hair and padded feet. Plains dwellers.', traits: [
    { name: 'Lucky', text: 'Gain a +2 bonus on saving throws of one type.' },
    { name: 'Lightfoot', text: 'Change size to small instead of medium. Ability increase to dexterity. Ability penalty to strength. Gain a +2 bonus on stealth checks. Decrease damage dice by one step. Gain advantage on stealth checks.' },
  ] },
  { name: 'Human', blurb: 'An undefined breed of mixed ancestry. Favor temperate climates.', traits: [
    { name: "Companion's Friend", text: 'If you ever gain a companion creature (as from the Archon class), that creature gains two ability score boosts to any ability scores of your choice.' },
    { name: 'Dynamic', text: 'Gain your choice of one feat from the General Feats.' },
  ] },
  { name: 'Leshonki', blurb: 'Tough-skinned humanoids with gravity-defying hair. Forest dwellers who sometimes live in canopy villages.', traits: [
    { name: 'Vitality', text: 'You are able to eat mushrooms, leaves, and other plants for nutrition even if they would normally be poisonous to you. You heal from all damage, including nonlethal damage, twice as quickly as other creatures do.' },
    { name: 'Barkskin', text: 'You always have DR 2, which stacks with all other forms of DR.' },
  ] },
  { name: 'Migoi', blurb: 'Massive humanoids with excessive body hair. Live in extreme heat or cold.', traits: [
    { name: 'Colossal', text: 'Increase your size to become large instead of medium. Ability increase to strength. Ability increase to constitution. Ability penalty to dexterity. Take a -2 penalty on stealth checks. Increase damage dice by one step.' },
    { name: 'Temperature-Resistant', text: 'You can survive twice as long in areas of intense heat or cold. You ignore the first two points of nonlethal damage that you take every day.' },
  ] },
  { name: 'Naga', blurb: 'Large humanoids with chromatic skin and long jaws. Saltwater dwellers with strict class structures.', traits: [
    { name: 'Elemental', text: 'Gain resistance 5 to any one type of elemental damage.' },
    { name: 'Draconic Structure', text: 'Gain a fly speed of 10 feet with leathery wings. Gain a bite attack that deals 1d8 points of damage.' },
  ] },
  { name: 'Ogre', blurb: 'Massive humanoids who adapt to their environments; mixed-heritage ogres are especially large.', traits: [
    { name: 'Big-Boned', text: 'Increase size to become large instead of medium. Ability increase to strength. Ability penalty to dexterity. Take a -2 penalty on stealth checks. Increase damage dice by one step. Increase movement speed by 10 feet.' },
    { name: 'Acclimated', text: 'Gain an adaptation to a certain kind of terrain (Water: swim 10 ft; Mountain: climb 10 ft; Cavern: burrow 10 ft; Marsh: ignore difficult terrain from mud and vegetation).' },
  ] },
  { name: 'Sprite', blurb: 'Short, narrow humanoids with fantastical hair and eye colors. Marsh dwellers and excellent mages.', traits: [
    { name: 'Arcane Talent', text: 'Gain proficiency in either Arcana or Spellcraft. You gain a +2 bonus on all checks with whichever skill you choose.' },
    { name: 'Pixie', text: 'Change your size to small instead of medium. Ability increase to dexterity. Ability penalty to strength. Gain a +2 bonus on stealth checks. Decrease damage dice by one step. Gain a fly speed of 20 feet with insectlike wings. Movement speed is reduced to 15 feet.' },
  ] },
];

// ── Companion Creatures (from intuitivegames.net/companion-creatures) — the FOUR companion types tied to
//    Archon subclasses, plus the advancement rules. NOTE: the site does NOT spell out how a companion is
//    directed in combat / its action economy — recorded as absent per the source-only rule, not invented.
//    (Distinct from IG_CREATURES below, a broad bestiary list from the sheet template, not this web page.)
export const IG_COMPANION_RULES =
  'Companions gain HP each level equal to 2 + its Constitution modifier. A companion with Intelligence 6 ' +
  'or lower gains no skill ranks; above that it gains 2 + its Intelligence modifier ranks yearly. All ' +
  'companions receive 6 total ability score increases, distributed as the player chooses (after type-based ' +
  'modifiers). The site does not currently define how a companion is directed in combat or its action ' +
  'economy — that part of the rules is not yet published.';

export interface IGCompanionType { name: string; subclass: string; text: string; }
export const IG_COMPANION_TYPES: IGCompanionType[] = [
  { name: 'Beast Companion', subclass: 'Beastmaster', text: 'Gain a physical ability boost and a -2 Intelligence penalty. Skill proficiency options: Acrobatics, Climb, Fly, Perception, Stealth, Swim. (Example: a Level 1 Tiger — Large, 16 HP, +5 attack, 1d8+4 damage.)' },
  { name: 'Elemental', subclass: 'Summoner', text: 'Choose an energy type; gain resistance to it equal to twice your level. Skill proficiency: Arcane.' },
  { name: 'Familiar', subclass: 'Eldritch Binder', text: 'Must be Small or Tiny. Gain any one skill proficiency, and gain advantage when assisting the summoner with a proficient skill.' },
  { name: 'Swarm', subclass: 'Packmaster', text: 'Must be Tiny or Small. Takes a -4 Intelligence penalty (minimum 1). Gains the Swarming stance. Skill proficiency options: Acrobatics, Climb, Fly, Perception, Stealth, Swim.' },
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
  // ── The remaining site-roster spells, effect text scraped verbatim from intuitivegames.net/spell-list
  //    (2026-07-17, all accordion toggles expanded). Closes the 26 "work in progress" powers. ──
  { name: 'Natural Ally', category: 'Conjuration', effect: 'As a three-action activity, summon a simulacrum of a level 1 animal. This creature has the stats of a real animal, and can be directed using an action. It disappears if its HP reaches 0 or after one minute, whichever occurs first. Options for this animal are detailed below.' },
  { name: 'Elemental Blade', category: 'Conjuration', effect: 'As a single action activity, create an immaterial melee weapon with no weapon properties. You are considered proficient with this weapon. It deals 1d8 points of elemental damage, of a type chosen when you cast the spell, plus your intelligence modifier. The weapon lasts for one minute. You cannot be disarmed of this weapon and it cannot harm you.' },
  { name: 'Detect Thoughts/Emotions', category: 'Divination', effect: 'As a two-action activity, you can attempt to read the active thoughts and emotions of a target within 30 feet. The creature makes a will save opposed by your Spellcraft check. Special: If you have the Aura Mastery feat, you may affect the same number of creatures with this ability that you can with Aura Mastery and may affect them at the same range. Range: A number of hexes equal to your Spellcraft modifier. Critical Success You know the active thoughts and emotions of the creature for the next minute. Success You know the active thoughts or emotions of the creature for the next minute, or until they leave your sight. Partial Success You know one of the thoughts or emotions that the creature has had within the last minute. Failure The spell fails. Critical Failure The spell fails and the creature knows someone attempted to read their thoughts.' },
  { name: 'Trace', category: 'Divination', effect: 'As a three-action activity, learn the direction a creature moved if it was within 100 feet of your current location within the last minute. This spell only gives cardinal directions and an estimate in thousands of feet. It can be used to track the direction that a creature teleported.' },
  { name: 'Unburdened Vision', category: 'Divination', effect: 'This spell has multiple uses. All versions of the effect last for one minute and affect a single touched creature.' },
  { name: 'Comprehend', category: 'Divination', effect: 'As a three-action activity, touch another creature. You learn how to understand, speak, and read that creature\'s language for a number of hours equal to your Spellcraft modifier. In addition, you can imprint on the creature an emotion of your choice as the spell takes effect. The emotion cannot be bluffed, and Sense Motive will confirm that there is no deceit.' },
  { name: 'Mindlink', category: 'Divination', effect: 'As a three-action activity, link your mind with the mind of another willing creature. You and this creature are able to communicate telepathically and share mental images up to a distance of 1 mile. This lasts for a number of hours equal to your Spellcraft modifier. You can use this ability multiple times to affect multiple creatures. This spell can only be active on a number of other creatures equal to your intelligence modifier.' },
  { name: 'Named Bullet', category: 'Divination', effect: 'As an action, touch a piece of ammunition and identify a target by name. If the ammunition is used against that target within the next minute, add your Intelligence modifier to the attack roll and your Spellcraft skill to the damage roll. The name must be a name the creature has used to identify themselves a; name given by the caster will not suffice.' },
  { name: 'Calm', category: 'Enchantment', effect: 'As an action, remove one of the following conditions from a creature within a number of hexes equal to your Intelligence modifier and heal 1 point of nonlethal damage from them. ConfusedFascinatedHeatstrokeHypothermiaShakenSickenedSpecial: If you have the Aura Mastery feat, you may affect the same number of creatures with this ability that you can with Aura Mastery and may affect them at the same range.' },
  { name: 'Erase Memory', category: 'Enchantment', effect: 'As a three-action activity, cause a creature within a number of hexes equal to your Spellcraft modifier to lose a memory per one of the options below: Recent memoryThe target may make a Will save opposed by your Spellcraft check. If your check succeeds, they lose all memory of events from the prior minute. Shared memoryThe target may make a Will save opposed by your Spellcraft check. If your check succeeds, they lose all memory of events from a time when you were with the target. You may only remove up to one minute at a time per casting with this ability. The target gets a new save for each additional minute of memories you would like to remove. Personal memoryA willing target may focus on a memory for you to remove. The removal of this memory can be painful for the target. You must make a DC 20 Spellcraft check. For every point that you fail to meet the DC, the target takes a point of nonlethal damage. Special: If you have the Aura Mastery feat, you may affect the same number of creatures with this ability that you can with Aura Mastery and may affect them at the same range.' },
  { name: 'Hold Creature', category: 'Enchantment', effect: 'As a two-action activity, cause sentient target to become paralyzed. This is opposed by the target\'s will save. Follow the Degrees of Success chart below. Critical SuccessThe duration for the effect is doubledSuccessThe subject takes the effect as writtenPartial SuccessThe subject suffers the effect for no more than 1 round. FailureThe subject suffers no ill effects. Critical FailureThe caster loses their reaction this turn.' },
  { name: 'Mind Scream', category: 'Enchantment', effect: 'As a two-action activity, target a creature within a number of hexes equal to your Intelligence modifier with a telepathic scream that deals 1d4x2 damage to a mental ability score of your choice. The target makes a will save opposed by your Spellcraft check. Upon failure, they take the ability score damage and the related effect as outlined below. IntelligenceThe target is confused for one round. WisdomThe target is shaken for one round. CharismaThe target is fascinated by you for one round. Special: If you have the Aura Mastery feat, you may affect the same number of creatures with this ability that you can with Aura Mastery and may affect them at the same range.' },
  { name: 'Destruction', category: 'Evocation', effect: 'As a three-action activity, target one creature or object within a number of hexes equal to your intelligence modifier. The target takes force damage equal to your Spellcraft bonus. This effect is opposed by a fortitude save when targeting a creature.' },
  { name: 'Repeating Blast', category: 'Evocation', effect: 'As a three-action activity, launch your Elemental Blast attack two times. You may choose one or more targets for these attacks, but all must be within range.' },
  { name: 'Radiance', category: 'Evocation', effect: 'As an action, target a single hex within sight. Any creature in or adjacent to that hex gains the following benefits for the next minute: Advantage on a roll of their choice. DR 2Alternatively, a creature can choose to remove one of the conditions listed below: ConfusedFlat-footed ShakenSickened' },
  { name: 'Spectral Sling', category: 'Evocation', effect: 'As a single action activity, attack a target with a proficient attack. This attack deals 1d8 force damage and has a range of a number of hexes equal to your Spellcraft modifier.' },
  { name: 'Vitality', category: 'Evocation', effect: 'As a three-action activity, produce an aura with a range of 5 feet. Creatures within that aura, including you, heal an amount equal to your Intelligence modifier. This effect lasts until the beginning of your next turn. Special: If you have the Aura Mastery feat, you may affect the same number of creatures with this ability that you can with Aura Mastery and may affect them at the same range.' },
  { name: 'Wave Crash', category: 'Evocation', effect: 'As a two-action activity, cause a crashing wave to appear in a number of hexes equal to your intelligence modifier. The wave has the following effects: It deals 1d6 bludgeoning damage. It causes creatures hit to become flat-footed until their next turn. The area becomes marshy until the beginning of your next turn and creatures within the area suffer double damage cold and electricity effects. This spell has a range of a number of hexes equal to your Spellcraft modifier.' },
  { name: 'Disguise', category: 'Illusion', effect: 'As a three-action activity, cause a touched, willing creature to change in appearance. This may also change the sound of their voice. This lasts for a number of hours equal to your Intelligence modifier. The creature maintains their approximate height and weight, though they may appear slightly different. They can be changed to look like any humanoid creature that you can imagine. If someone interacts directly with the target, they must make a Will save opposed by your Spellcraft check. They get advantage on the check if they touch the creature during the first round of interaction. Degrees of SuccessCritical SuccessThe creature believes the illusion and their attitude becomes more favorable to the subject by one step. SuccessThe creature believes the illusion. Partial SuccessThe creature believes the illusion, but their attitude becomes less favorable by one step. FailureThe creature does not believe the illusion, and their attitude becomes less favorable by one step. Critical FailureThe creature sees through the illusion, identifies the subject, and their attitude becomes less favorable by one step. Special: If you have the Aura Mastery feat, you may affect the same number of creatures with this ability that you can with Aura Mastery and may affect them at the same range.' },
  { name: 'Burst', category: 'Transmutation', effect: 'As an action, move up to twice your speed using any movement speed you possess. The casting of this ability and the movement used do not provoke reactions.' },
  { name: 'Carapace Growth', category: 'Transmutation', effect: 'As an action, grant yourself DR equal to your intelligence modifier for one minute. This DR does not stack with armor.' },
  { name: 'Creature Morph', category: 'Transmutation', effect: 'As a three-action activity, cause a touched willing creature to take on a new form. This effect lasts for a number of minutes equal to your Spellcraft skill. You can choose any small, medium, or large creature. Apply the relevant ability score changes as appropriate from the original size. Creatures that are not small, medium, or large can only become one of those sizes. They gain a single movement type that the creature possesses. You can choose to increase your land speed by 10 feet if the creature would have a higher land speed than yours. They gain any natural attacks that the creature might possess. These attacks follow the standard damage format for medium creatures and should be scaled to the creature\'s size. A creature with multiple attacks deals 1d6 damage with each attack, and a creature with a single attack deals 1d10 damage with that attack. After the effect wears off, the creature is paralyzed for one round as they revert to their original form.' },
  { name: 'Item Shift', category: 'Transmutation', effect: 'As a three-action activity, cause a touched object to take on a new form. The object retains this form for a number of hours equal to your Spellcraft skill. The object retains its base material or materials, and turns into an object of roughly the same mass. The mass of the object cannot exceed a number of pounds equal to your Spellcraft modifier. Common examplesChanging a weapon from one type to another. Replacing one common object with another. Reshaping natural objects. This spell cannot be used to bypass craft checks for advanced technology, but can be used to reduce the time involved in rearranging the material to create such items.' },
  { name: 'Poison Dart', category: 'Transmutation', effect: 'As a two-action activity, target a creature within a number of hexes equal to your Intelligence modifier with a poison that deals 1d4x2 damage to a physical ability score of your choice. The target makes a fortitude save opposed by your Spellcraft check. Upon failure, they take the ability score damage and the related effect as outlined below. StrengthThe target is entangled for one round. DexterityThe target is flat-footed for one round. ConstitutionThe target takes nonlethal damage equal to double the ability score damage taken. Special: If you have the Aura Mastery feat, you may affect the same number of creatures with this ability that you can with Aura Mastery and may affect them at the same range.' },
  { name: 'Quick Claw', category: 'Transmutation', effect: 'As an action, give yourself a natural attack on one of your arms, which you become proficient with. This natural attack deals 1d10 points of slashing or piercing damage and 1d6 bleed damage. The effect lasts for one minute. You may affect yourself with this spell multiple times, each time granting yourself another natural attack.' },
  { name: 'Temporary Weapon', category: 'Transmutation', effect: 'As an action, touch an adjacent material. Create a weapon of your choice out of that material, which lasts for a number of minutes equal to your Spellcraft modifier. The weapon has a single Property as normal. You are considered to be proficient with this weapon. If you were already proficient with a weapon of that type, you gain a +2 bonus on all attack and damage rolls with the weapon. Ammunition can be created in this way, but only lasts for one minute. Each action spent creates 10 pieces of ammunition.' },
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

// The COMPLETE spell roster (names by school) as published on intuitivegames.net/spell-list (scrubbed
// 2026-07-17). Each spell has Description/Advanced/Expert tiers on the site; the fetch tool declined to
// reproduce the verbatim effect text, so this roster gives the authoritative NAMES (used for recognition +
// the library's full list) while the per-spell EFFECT text in IG_POWERS is completed from Brendan's text.
export const IG_SPELL_ROSTER: Record<string, string[]> = {
  Abjuration: ['Dispel Magic', 'Protection From Elements', 'Shield Ally'],
  Conjuration: ['Conjure Wall', 'Create Shelter', 'Gate', 'Natural Ally', 'Portal', 'Summon Material', 'Teleportation', 'Unseen Servant', 'Elemental Blade'],
  Divination: ['Detect Magic', 'Detect Thoughts/Emotions', 'Foresight', 'Scrying', 'Trace', 'Unburdened Vision', 'Comprehend', 'Mindlink', 'Named Bullet'],
  Enchantment: ['Calm', 'Command', 'Enchant Creature', 'Erase Memory', 'Hold Creature', 'Mind Scream', 'Subtle Manipulation'],
  Evocation: ['Destruction', 'Intense Blast', 'Repeating Blast', 'Telekinesis', 'Radiance', 'Spectral Sling', 'Vitality', 'Wave Crash', 'Wind Blast'],
  Illusion: ['Create Image', 'Darkness', 'Disguise', 'Invisibility', 'Light', 'Mimic Sound', 'Mirror Image'],
  Transmutation: ['Adaptation', 'Burst', 'Carapace Growth', 'Creature Morph', 'Item Shift', 'Natural Attacks', 'New Movement', 'Poison Dart', 'Quick Claw', 'Temporary Weapon'],
};

/** Every spell name from the site's spell-list roster (flat). */
export function igAllSpellNames(): string[] {
  return Object.values(IG_SPELL_ROSTER).flat();
}

/** Roster spells that don't yet have effect text in IG_POWERS (pending Brendan's verbatim text). */
export function igSpellsMissingEffects(): string[] {
  const have = new Set(IG_POWERS.map((p) => norm(p.name)));
  return igAllSpellNames().filter((n) => !have.has(norm(n)));
}

/** The REVERSE discrepancy: IG_POWERS names (from the sheet template) that are NOT on the current site
 *  spell-list roster — possible renames/removals the owner/Brendan should reconcile (kept, not deleted,
 *  since only Brendan can confirm whether they're dropped or renamed). */
export function igPowersNotInRoster(): string[] {
  const roster = new Set(igAllSpellNames().map(norm));
  return IG_POWERS.map((p) => p.name).filter((n) => !roster.has(norm(n)));
}

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

// ── Classes (from intuitivegames.net/classes) — 13 classes in 4 groups. Each grants starting HP (8–12 +
//    background HP), an Ability Score Boost to its primary attribute, a proficient skill + weapon
//    proficiencies, and a starting power; each has subclass options granting additional powers,
//    specializations, greater specializations, and manifestations. (The 5 subclasses below are NOT
//    counted among the 13 classes.) Per-class full feature ladders are a follow-up (source-only). ──────
export const IG_CLASS_RULES =
  'There are 13 classes in four groups. Each class grants starting hit points (8–12, plus your background ' +
  'HP), an Ability Score Boost to the class’s primary attribute, a proficient skill and weapon ' +
  'proficiencies, and a starting power. Each class has subclass options that grant additional powers, ' +
  'specializations, greater specializations, and manifestations.';

export interface IGClassGroup { group: string; classes: string[] }
export const IG_CLASS_GROUPS: IGClassGroup[] = [
  { group: 'Summoning', classes: ['Archon', 'Beastmaster', 'Eldritch Binder', 'Packmaster'] },
  { group: 'Nature', classes: ['Conduit', 'Druid'] },
  { group: 'Combat', classes: ['Fighter', 'Freebooter', 'Marksman', 'Sohei'] },
  { group: 'Magic', classes: ['Wizard', 'Magician', 'Shaman'] },
];

// ── Per-class detail (from intuitivegames.net/classes) — captured group-by-group. FINDING: the site
//    presents Fighter as the PARENT class of Champion/Freebooter/Marksman/Sohei (subclasses), which differs
//    from this app's flat 13-class `classNames` list; flagged for owner verification, NOT restructured here.
//    Only what the site clearly states is captured (no invented per-level features). More classes are a
//    follow-up (the /classes page summarizes rather than giving verbatim per-level ladders). ──────────────
export interface IGClassDetail {
  name: string;
  /** How the site classifies it: "class" (top-level) or "subclass of <Parent>". */
  classification?: string;
  primaryAbility?: string;
  hp?: string;
  grantedStance?: string;
  defensivePower?: string;
  startingPower?: string;
  powers?: string[];
  specializations?: string[];
  note?: string;
}
export const IG_CLASS_DETAILS: IGClassDetail[] = [
  // Combat group — Fighter is the parent class; Freebooter/Marksman/Sohei/Champion are its subclasses.
  { name: 'Fighter', classification: 'class', primaryAbility: 'Strength or Dexterity', hp: '12 + Background HP', note: 'Parent class of the Champion, Freebooter, Marksman, and Sohei subclasses; base-Fighter specifics are minimal on the site.' },
  { name: 'Freebooter', classification: 'subclass of Fighter', hp: '12 + Background HP', grantedStance: 'Mobile', defensivePower: 'Redirect', powers: ['Combat Feat', 'Combat Skill Proficiency', 'Favored Enemy', 'General Skill Proficiency', 'Martial Prowess', 'Weapon Expert', 'Weapon Training'], specializations: ['Dabbler (gain subclass powers from other classes)', 'Virtuoso (advantage on skill rolls)'] },
  { name: 'Marksman', classification: 'subclass of Fighter', hp: '12 + Background HP', grantedStance: 'Shifting', defensivePower: 'Redirect', powers: ['Combat Feat', 'Rapid Reload', 'Sharpshooter', 'Shot On The Run', 'Trick Shot', 'Weapon Training'], specializations: ['Sniper (double weapon range, bonus damage)', 'Expert Shot (cover fire, challenge, switch-hitter)'] },
  { name: 'Sohei', classification: 'subclass of Fighter', hp: '12 + Background HP', grantedStance: 'Precise', defensivePower: 'Counterattack', powers: ['Advanced Combat Skill', 'Chi Strike', 'Combat Feat', 'Flurry', 'Martial Prowess', 'Weapon Expert', 'Weapon Training'], specializations: ['Chakra Master (mobility/sensory abilities)', 'Sage (apply Divine Curse aspects to attacks)'] },
  // Magic group — Wizard is the parent class; Arcanist/Magician/Shaman are its subclasses.
  { name: 'Wizard', classification: 'class', primaryAbility: 'Intelligence', hp: '8 + Background HP', startingPower: 'Elemental Blast — a 2-action ranged attack (30 ft) dealing damage = level + Intelligence modifier, in one of five elemental types', note: 'Parent class of the Arcanist, Magician, and Shaman subclasses; base powers appear under the subclasses.' },
  { name: 'Arcanist', classification: 'subclass of Wizard', primaryAbility: 'Intelligence', grantedStance: 'Mobile', defensivePower: 'Mage Armor', startingPower: 'Elemental Blast (inherited from Wizard)', powers: ['Arcane Spell', 'Elemental Strike', 'Expanded Blast', 'Magic Trick', 'Personal Style', 'Special Delivery'], specializations: ['Synergist (dual elements)', 'Magical Savant (spell advancement)'] },
  { name: 'Magician', classification: 'subclass of Wizard', note: 'The /classes page lists Magician but its full statistics/powers/specializations were not captured in the page text — a work in progress / to re-verify.' },
  { name: 'Shaman', classification: 'subclass of Wizard', note: 'The /classes page lists Shaman but its full statistics/powers/specializations were not captured in the page text — a work in progress / to re-verify.' },
  // Summoning group — Archon is the parent class; Beastmaster/Eldritch Binder/Packmaster/Summoner are subclasses.
  { name: 'Archon', classification: 'class', primaryAbility: 'Charisma', hp: '10 + Background HP', startingPower: 'Direct Companion — spend two actions directing a companion creature to give it three total actions; also enables Diplomacy checks with any creature regardless of Intelligence', powers: ['Aspect', 'Charm', 'Combat-Trained', 'Inspiration', 'New Feature', 'Conjurer', 'Relentless', 'Paired Strikes'], specializations: ['Extraordinary Creature', 'Supernatural Creature'], note: 'Parent class of the Beastmaster, Eldritch Binder, Packmaster, and Summoner subclasses.' },
  { name: 'Beastmaster', classification: 'subclass of Archon', grantedStance: 'Menacing', defensivePower: 'Companion Shield', powers: ['Aspect', 'Charm', 'Combat-Trained', 'Inspiration', 'New Feature', 'Conjurer', 'Relentless', 'Paired Strikes'], specializations: ['Extraordinary Creature', 'Supernatural Creature'] },
  { name: 'Eldritch Binder', classification: 'subclass of Archon', grantedStance: 'Welcoming', defensivePower: 'Companion Shield', powers: ['Aspect', 'Exemplary Companion', 'Inspiration', 'New Feature', 'Familiar Spell', 'Conjurer', 'Flash', 'Fortune'], specializations: ['Extraordinary Creature', 'Supernatural Creature'] },
  { name: 'Packmaster', classification: 'subclass of Archon', grantedStance: 'Swarming', defensivePower: 'Companion Shield', powers: ['Additional Creature', 'Aspect', 'Inspiration', 'New Feature', 'Swarm Assault', 'Conjurer', 'Dodger', "Master's Reach"], specializations: ['Varied Swarm', 'Identical Swarm'] },
  { name: 'Summoner', classification: 'subclass of Archon', grantedStance: 'Supportive', defensivePower: 'Companion Shield', powers: ['Aspect', 'Elemental Defense', 'Elemental Power', 'Inspiration', 'New Feature', 'Conjurer', 'Elemental Blast', 'Redirect Energy'], specializations: ['Varied Swarm', 'Identical Swarm'] },
  // Nature group — Conduit is the parent class; Druid/Shifter/Witch are subclasses.
  { name: 'Conduit', classification: 'class', primaryAbility: 'Wisdom', hp: '10 + Background HP', startingPower: 'Redistribution — rearrange matter, affecting materials equal to your Wisdom modifier (e.g. Launch Material for a ranged attack)', specializations: [], note: 'Parent class of the Druid, Shifter, and Witch subclasses.' },
  { name: 'Druid', classification: 'subclass of Conduit', primaryAbility: 'Wisdom', grantedStance: 'Neutral', defensivePower: 'Material Shield', powers: ['Elemental Storm', 'Entangle', 'Material Spray', 'Natural Storm', 'New Material', 'Temporary Shift', 'Transmuter'], specializations: ['Storm Brewer (enhanced nature checks and damage)', 'Natural Healer (heal using Wisdom/Nature)'] },
  { name: 'Shifter', classification: 'subclass of Conduit', primaryAbility: 'Wisdom', grantedStance: 'Offensive', defensivePower: 'Material Shield', powers: ['Alter Self', 'Enhance Ability', 'Material Spray', 'Nature Focus', 'Primal Shape', 'New Material', 'Temporary Shift', 'Transmuter'], specializations: ['Primal Speaker (Command spell usage)', 'Natural Healer'] },
  { name: 'Witch', classification: 'subclass of Conduit', primaryAbility: 'Wisdom', grantedStance: 'Defensive', defensivePower: 'Material Shield', powers: ['Advanced Material', 'Material Spray', 'Natural Remedy', 'New Material', 'Redistribute Complex Object', 'Swift Redistribution', 'Temporary Shift', 'Vast Manufacturing', 'Transmuter'], specializations: ['Forbidden Practices (undead companion creation)', 'Natural Healer'] },
];

// The class taxonomy AS THE SITE PRESENTS IT (confirmed across all four groups, 2026-07-17): 4 parent
// classes, each with subclasses. This differs from the app's flat 13-class `classNames` list — surfaced as
// a finding for the owner, NOT unilaterally reconciled (restructuring touches the builder, provenance,
// seeds, and validator).
export const IG_CLASS_TAXONOMY_FINDING =
  'On the site, classes are 4 PARENT classes each with subclasses — Archon → Beastmaster / Eldritch Binder ' +
  '/ Packmaster / Summoner; Conduit → Druid / Shifter / Witch; Fighter → Champion / Freebooter / Marksman / ' +
  'Sohei; Wizard → Arcanist / Magician / Shaman. This differs from the app’s flat 13-class list; pending an ' +
  'owner decision to restructure.';

// ── Subclasses + backgrounds (the documented ones; extensible). ─────────────────────────────────────
// The five SUBCLASSES (chosen within a class) — distinct from the 13 classes above.
export const IG_SUBCLASSES: string[] = ['Arcanist', 'Summoner', 'Champion', 'Witch', 'Shifter'];

// The Combat Skills (Sheet 4) — tracked separately from general skills. Str/Dex variants share these names.
export const IG_COMBAT_SKILLS = new Set(['Dirty Trick', 'Disarm', 'Feint', 'Grapple', 'Overrun', 'Reposition', 'Steal', 'Sunder', 'Trip']);

// Redistribution — the Conduit's signature ability (from intuitivegames.net/redistribution).
export const IG_REDISTRIBUTION_RULES =
  'Redistribution (the Conduit’s signature ability) is a two-action activity that rearranges materials into ' +
  'different shapes, converting between liquid and solid forms. You know a number of materials equal to your ' +
  'Wisdom modifier and can affect material up to your character level in pounds (or the equivalent square ' +
  'footage at one inch thickness). You must touch the material (barefoot contact counts); you cannot ' +
  'redistribute multiple known materials at once; quantities are subject to DM discretion. The seven material ' +
  'categories are Fine Particles, Fluids, Gems, Metal, Stone, Oozes, and Organic Matter (you cannot transmute ' +
  'organic matter that is still alive or attached to a living being). Applications — Manufacture Object: ' +
  'replaces Craft checks using the relevant skill (e.g. Nature for Organic Matter), with the same time and ' +
  'failure chance as crafting (cannot enchant Eldritch Jewels; mixed-material items need the extra materials ' +
  'sourced separately). Launch Material: a two-action ranged attack (30 ft) dealing 1d4 physical damage ' +
  '(+1d4 per two levels after the first); the damage type is set by the material (Metal offers slashing/' +
  'piercing/bludgeoning; Gems deal piercing).';

// Combat & damage mechanics (from intuitivegames.net/core-rules).
export const IG_DAMAGE_SAVE_RULES =
  'When you take damage, make a Fortitude save at the start of your next turn; the DC equals the total HP ' +
  'lost. Critical success: no ill effects and no bleed damage this turn. Success: no ill effects. Partial ' +
  'success: you lose your reaction. Failure: you lose one action this round. Critical failure: you lose two ' +
  'actions this round.';

export interface IGDamageType { name: string; note: string }
export const IG_DAMAGE_TYPE_DATA: IGDamageType[] = [
  { name: 'Physical (Piercing / Bludgeoning / Slashing)', note: 'Subject to DR; does not affect incorporeal creatures.' },
  { name: 'Bleed', note: 'Not subject to DR; recurring; does not affect incorporeal; stopped via the Heal skill or magical healing.' },
  { name: 'Elemental (Acid / Fire / Cold / Electricity / Sonic)', note: 'Subject to DR; affects incorporeal creatures.' },
  { name: 'Force', note: 'Not subject to DR; affects incorporeal creatures.' },
  { name: 'Plasma', note: 'Rare; does not affect incorporeal; deals 1 HP per object touched.' },
  { name: 'Nonlethal', note: 'Not subject to DR; affects incorporeal creatures.' },
];

export interface IGCover { name: string; effect: string }
export const IG_COVER: IGCover[] = [
  { name: 'Impassable', effect: 'Automatically critically succeeds all Reflex saves.' },
  { name: 'Full Coverage', effect: 'Double advantage on Reflex saves and Stealth checks.' },
  { name: 'Partial Coverage', effect: '+2 bonus on Reflex saves and Stealth checks.' },
  { name: 'Visibility Coverage', effect: 'Advantage on Reflex saves and Stealth checks (does not apply while flat-footed).' },
];

export const IG_MOVEMENT_RULES =
  'Walk: standard non-tactical (3 mph); you cannot heal nonlethal damage while walking. Hustle: jogging ' +
  '(6 mph); 1 nonlethal damage per 10 minutes. Tactical movement (in combat): 1 nonlethal damage per minute. ' +
  'Stride: a single action, moving 20 feet for most creatures. Run: use all three actions moving roughly ' +
  'straight, gaining an additional 20 feet.';

export const IG_SIZE_CATEGORIES = ['Miniscule', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Giant', 'Massive', 'Colossal'];
export const IG_SIZE_NOTE = 'Nine size categories; each adjusts reach, ability scores, and stealth/damage relative to Medium.';

// The level-1 character-building order (from intuitivegames.net/character-building).
export const IG_BUILD_STEPS: string[] = [
  'Character Introduction — pick a name and ancestry, record physical traits (height, weight, age), and write biographical details.',
  'Ability Scores — all six start at 10 (+0); apply 8 Ability Score Boosts (each raises a score by +2), to a maximum of 14 per ability at creation.',
  'Background — grants one stance, skill/item proficiencies, partial HP, and 2 Ability Score Boosts.',
  'Class — grants a starting power, a skill proficiency, a weapon-group proficiency, 1 Ability Score Boost, and an HP increase.',
  'Subclass — choose one at level 1, granting a single class power of your choice.',
  'Traits — pick one benefit: an ancestry option, 2 Ability Score Boosts, a skill proficiency, two weapon-group proficiencies, or a new stance.',
  'Feats — start with one Combat Feat and one General Feat.',
  'Skills — gain 2 + your Intelligence modifier ranks (maximum 1 rank per skill at level 1).',
  'Equipment — start with Solidas equal to your highest Profession, Craft, or Perform skill + 20 to buy gear.',
];
export const IG_PROGRESSION_NOTE =
  'Levels 2–10 add traits, powers, feats, and ability boosts on a fixed schedule. Specializations begin at ' +
  'Level 4 (greater specializations at Level 8), unique powers arrive at Level 6, and a capstone plus a ' +
  'manifestation occur at Level 10.';

// How the skill system works (from intuitivegames.net/skills).
export const IG_SKILL_RULES =
  'A skill check = ranks (max = your level) + proficiency (add your level if proficient) + the governing ' +
  'ability modifier (which applies only if you are proficient or have ranks in the skill). You gain 2 + your ' +
  'Intelligence modifier ranks per level to distribute. You are "trained" in a skill if you have any ranks or ' +
  'proficiency in it. Take 10 (spend 2× the actions for a guaranteed 10; not in combat or resource scarcity) ' +
  'and Take 20 (20× the actions for a guaranteed 20) are available. General DC guide: 10 anyone · 15 ' +
  'practiced · 20 expert · 25 master.';

// How combat skills work (from intuitivegames.net/skills). Some per-skill mechanics beyond Dirty Trick were
// truncated on the page — the general rule + the roster are captured; the Mastery feats (A8) enhance them.
export const IG_COMBAT_SKILL_RULES =
  'Combat skills work differently from general skills: the aggressor rolls their appropriate modifier against ' +
  'the defendant’s Reflex save (the defendant may use Strength instead of Dexterity if the skill is ' +
  'Strength-based). A defendant TRAINED in the combat skill may make an opposed combat-skill check instead of ' +
  'a Reflex save; an untrained defender provokes reactions. Example — Dirty Trick (STR or DEX): as an action, ' +
  'apply Staggered, Blinded, or Sickened opposed by the target’s Reflex save (critical success: lasts until ' +
  'your next turn and can’t be removed; success: until the target’s next turn; partial success: until the ' +
  'target’s turn; failure: no effect; critical failure: you become flat-footed until your next turn).';
// ── Backgrounds (from intuitivegames.net/backgrounds) — 10 backgrounds, each granting starting HP, two
//    ability boosts (a specific pair + any one), skill proficiencies, and a base Stance (Advanced at L5). ──
export interface IGBackground {
  name: string;
  /** Starting hit points. */
  hp: number;
  /** The ability boosts, in the site's own phrasing. */
  boosts: string;
  proficiencies: string[];
  /** The Stance this background grants (full Basic/Advanced text lives in IG_STANCE_DEFS). */
  stance: string;
}
export const IG_BACKGROUND_DEFS: IGBackground[] = [
  { name: 'Academic', hp: 8, boosts: 'Charisma or Intelligence, plus any one ability', proficiencies: ['Arcane', 'Lore', 'Linguistics', 'Religion'], stance: 'Defensive' },
  { name: 'Acolyte', hp: 10, boosts: 'Constitution or Wisdom, plus any one ability', proficiencies: ['Diplomacy', 'Lore', 'Religion'], stance: 'Mobile' },
  { name: 'Artist', hp: 8, boosts: 'Charisma or Dexterity, plus any one ability', proficiencies: ['Artistry', 'Craft', 'Lore', 'Profession'], stance: 'Supportive' },
  { name: 'Cosmopolitan', hp: 10, boosts: 'Constitution or Intelligence, plus any one ability', proficiencies: ['Lore', 'Profession', 'Stealth'], stance: 'Swarming' },
  { name: 'Hunter', hp: 10, boosts: 'Strength or Wisdom, plus any one ability', proficiencies: ['Handle Animal', 'Nature', 'Perception'], stance: 'Offensive' },
  { name: 'Laborer', hp: 12, boosts: 'Wisdom or Strength, plus any one ability', proficiencies: ['Craft', 'Profession'], stance: 'Neutral' },
  { name: 'Merchant', hp: 10, boosts: 'Charisma or Dexterity, plus any one ability', proficiencies: ['Bluff', 'Craft', 'Diplomacy'], stance: 'Welcoming' },
  { name: 'Physician', hp: 10, boosts: 'Dexterity or Wisdom, plus any one ability', proficiencies: ['Heal', 'Lore', 'Profession'], stance: 'Precise' },
  { name: 'Soldier', hp: 12, boosts: 'Constitution or Strength, plus any one ability', proficiencies: ['Armor', 'Shields'], stance: 'Menacing' },
  { name: 'Tinkerer', hp: 10, boosts: 'Intelligence or Dexterity, plus any one ability', proficiencies: ['Craft', 'Disable Device', 'Lore'], stance: 'Shifting' },
];
export const IG_BACKGROUNDS: string[] = IG_BACKGROUND_DEFS.map((b) => b.name);

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
  // The classifier recognizes every authored site feat (all General + Combat via igAllFeats + the legacy
  // short IG_FEATS list), de-duplicated — so a character with a real feat like "Fleet" or "Cleave" is
  // flagged vanilla, not custom.
  feat: Array.from(new Set([...igAllFeats().map((f) => f.name), ...IG_FEATS.map((f) => f.name)])),
  // Recognize every power/spell — the effect-carrying IG_POWERS PLUS the full site roster names — so a
  // character with a real spell (e.g. "Named Bullet", "Wave Crash") is flagged vanilla, not custom.
  power: Array.from(new Set([...IG_POWERS.map((p) => p.name), ...Object.values(IG_SPELL_ROSTER).flat()])),
  spell: Array.from(new Set([...IG_POWERS.map((p) => p.name), ...Object.values(IG_SPELL_ROSTER).flat()])), // "spell" is an alias for a power
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

/** The structured ancestry for a name (case/space-insensitive), or null when it isn't a known IG ancestry. */
export function findIGAncestry(name: string | null | undefined): IGAncestry | null {
  if (!name) return null;
  const n = norm(name);
  return IG_ANCESTRIES.find((a) => norm(a.name) === n) ?? null;
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
