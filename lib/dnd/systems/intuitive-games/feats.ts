// lib/dnd/systems/intuitive-games/feats.ts — the Intuitive Games FEAT catalog with full rules text,
// transcribed from intuitivegames.net (General Feats: /feats-general; Combat Feats: /feats-combat — added
// in a later slice). Source-only: every feat here is on the site; nothing is invented (IG buildout rule 2).
// The library page, cross-system search, the provenance classifier, and AI grounding all read this so a
// feat carries its actual prerequisites + effect, not just a name.

export interface IGFeat {
  name: string;
  /** Which page it lives on. */
  category: 'General' | 'Combat';
  /** Sub-grouping within the page (site's own headings). */
  group: 'General' | 'Skill' | 'Special' | 'Ability' | 'Mythic Stance' | 'Style' | 'Mastery';
  /** Prerequisites exactly as the site states them, or null when none are listed. */
  prerequisites: string | null;
  /** The feat's effect (mechanically faithful to the site). */
  effect: string;
}

// ── General Feats page (/feats-general) — 83 feats across four site headings. ────────────────────────
export const IG_GENERAL_FEATS: IGFeat[] = [
  // Main General Feats
  { name: 'Advanced Magic', category: 'General', group: 'General', prerequisites: 'Training in Spellcraft and having learned a single spell that has an Advanced spell ability', effect: 'Learn an Advanced spell. Each casting requires a DC 20 Will save or you lose an action next turn.' },
  { name: 'Alert', category: 'General', group: 'General', prerequisites: 'Training in Perception', effect: 'You are never considered flat-footed so long as you can see 5 feet of your surroundings.' },
  { name: 'Arcane Heritage', category: 'General', group: 'General', prerequisites: 'Training in Arcane', effect: 'Choose one benefit from the aligned, draconic, elemental, fey, nature, occult, time, or vampiric options, each granting a specific magical ability.' },
  { name: 'Archivist', category: 'General', group: 'General', prerequisites: 'Training in Spellcraft and the ability to cast at least one spell from the Spell List', effect: 'Learn two spells from one school you already know a spell from, excluding Advanced/Expert versions.' },
  { name: 'Aura Mastery', category: 'General', group: 'General', prerequisites: 'Training in Religion', effect: 'Make a Religion check as an action; allies within 30 feet (up to your Wisdom modifier) may use the result on one check type chosen from skills, saves, or attacks with proficient weapons.' },
  { name: 'Basic Redistribution', category: 'General', group: 'General', prerequisites: 'Training in Nature', effect: 'Gain the redistribution ability as a Conduit using items of one material type, dealing damage as a 1st-level Conduit.' },
  { name: 'Bomb Crafter', category: 'General', group: 'General', prerequisites: 'Training in Craft: Bomb', effect: 'Learn two bomb types from the listed options; create a number equal to your Craft skill bonus daily using the appropriate materials.' },
  { name: 'Bully', category: 'General', group: 'General', prerequisites: 'Training in Intimidate', effect: 'As a free action you may add your Strength modifier to an Intimidate check; outside combat this costs one nonlethal damage.' },
  { name: 'Combat Healer', category: 'General', group: 'General', prerequisites: null, effect: 'You never provoke reactions for using abilities that restore hit points, and targets recover an additional 2 hit points when you heal them.' },
  { name: 'Companion Creature', category: 'General', group: 'General', prerequisites: 'Training in Handle Animal', effect: 'Gain a Companion Creature using the Archon class rules; you cannot spend two actions directing it in order to take a third action.' },
  { name: 'Cure Ailment', category: 'General', group: 'General', prerequisites: 'Training in Heal and Spellcraft', effect: 'Three-action activity that removes one condition (Confused, Entangled, Fascinated, Paralyzed, Shaken, or Sickened, magical only) from an adjacent target.' },
  { name: 'Divine Blessing / Divine Curse', category: 'General', group: 'General', prerequisites: 'Training in Religion', effect: 'Two-action activity applying a chosen blessing or curse; blessings affect up to your Wisdom modifier in targets, curses target one creature resisted by a Will save.' },
  { name: 'Eldritch Smith', category: 'General', group: 'General', prerequisites: 'Spellcraft and Craft: Eldritch Jewels', effect: 'Manufacture Eldritch Jewels, requiring a DC 30 Spellcraft check, magical components, and five working days per enchantment.' },
  { name: 'Endurance', category: 'General', group: 'General', prerequisites: null, effect: 'Ignore a number of points of nonlethal damage each day equal to your Constitution modifier.' },
  { name: 'Favored Skills', category: 'General', group: 'General', prerequisites: null, effect: '+2 bonus on rolls with two chosen skills. Can be chosen multiple times for additional skill pairs.' },
  { name: 'Fleet', category: 'General', group: 'General', prerequisites: null, effect: 'Gain 10 additional feet of move speed.' },
  { name: 'Flexible Form', category: 'General', group: 'General', prerequisites: 'Training in Nature and Arcane', effect: 'As a three-action activity, transform into a different humanoid creature, gaining its physical characteristics including size changes.' },
  { name: 'Gifted', category: 'General', group: 'General', prerequisites: null, effect: 'Gain an extra class power.' },
  { name: 'Honorbound', category: 'General', group: 'General', prerequisites: null, effect: 'Choose an honor culture (Dominance, Integrity, Nobility, or Protection) gaining its benefits while you maintain honor; lose the benefits upon dishonor.' },
  { name: 'Improviser', category: 'General', group: 'General', prerequisites: null, effect: 'Use half of the relevant ability modifier on all untrained skill checks.' },
  { name: 'Improved Initiative', category: 'General', group: 'General', prerequisites: null, effect: 'Gain advantage on initiative checks.' },
  { name: 'Keen Magic', category: 'General', group: 'General', prerequisites: 'Training in Arcane, Nature, Religion, or Spellcraft', effect: 'Double the range of your magical abilities and gain a +2 bonus on the associated magic skill checks.' },
  { name: 'Linguist', category: 'General', group: 'General', prerequisites: null, effect: 'Learn one common and one uncommon language.' },
  { name: 'Lucky', category: 'General', group: 'General', prerequisites: null, effect: 'Gain a luck pool equal to your character level; spend a point to add 1d6 to an attack/save/skill check or to assist an ally.' },
  { name: 'Martyr', category: 'General', group: 'General', prerequisites: null, effect: 'If an adjacent ally is about to suffer an effect, spend a reaction making a Will save with advantage; on success you take the effect for them.' },
  { name: 'Meddler', category: 'General', group: 'General', prerequisites: 'Training in Arcane or Religion', effect: 'Reaction when a creature uses Divine Blessing, Aura Mastery, Redistribution, or a spell within 30 feet to counter it with a Religion/Arcane check.' },
  { name: 'Mental Training', category: 'General', group: 'General', prerequisites: null, effect: 'Gain an ability score increase to a mental stat, proficiency with a new tool, and learn a common language.' },
  { name: 'Mystic', category: 'General', group: 'General', prerequisites: 'Proficiency with Religion', effect: 'Learn to cast a single Divination spell using your Religion skill and Wisdom modifier instead of Spellcraft and Intelligence.' },
  { name: 'Necromancy', category: 'General', group: 'General', prerequisites: 'Training in Arcane and Heal', effect: 'Gain the Forbidden Practices ability, raising an undead companion that lasts hours equal to your character level.' },
  { name: 'Poison Master', category: 'General', group: 'General', prerequisites: 'Training in Craft: Poison', effect: 'Create doses equal to your Craft bonus daily; learn two poison types (Inhaled, Contact, Ingested, Injury) with their penalties and onset times.' },
  { name: 'Potion Brewer', category: 'General', group: 'General', prerequisites: 'Training in Craft: Potion', effect: 'Create potions equal to your Craft bonus daily; learn two types (Healing, Restoration, Elemental Resistance, Luck, Temperature Tolerance).' },
  { name: 'Pressure Point Mastery', category: 'General', group: 'General', prerequisites: 'Training in Unarmed Combat', effect: 'Two-action unarmed attack inflicting one condition for a varied duration; the target’s armor adds a bonus to its reflex-save defense.' },
  { name: 'Prodigy', category: 'General', group: 'General', prerequisites: null, effect: 'Gain an extra skill proficiency. Can be chosen multiple times.' },
  { name: 'Quick Caster', category: 'General', group: 'General', prerequisites: null, effect: 'Cast a spell or magical ability using one fewer action; you take 2 nonlethal damage and lose your reaction that round.' },
  { name: 'Redirect Energy', category: 'General', group: 'General', prerequisites: 'Training in Arcane', effect: 'Reaction when hit by an elemental attack: make an opposed Arcane check to redirect the damage as a ranged attack to a target within 30 feet.' },
  { name: 'Sorcery', category: 'General', group: 'General', prerequisites: 'Training in Arcane; you must select this feat at Level 1', effect: 'Choose a bloodline learning two associated spells, using Charisma and Arcane instead of Intelligence and Spellcraft.' },
  { name: 'Terrain Expertise', category: 'General', group: 'General', prerequisites: 'Training in Nature', effect: 'Choose a terrain, gaining half nonlethal damage from its extreme temperature and a +2 bonus on eight listed skills within that terrain.' },
  { name: 'Scarred By Magic', category: 'General', group: 'General', prerequisites: 'Training in Arcane', effect: 'Take 1 nonlethal damage from each harmful magical effect; you constantly detect magic without spending an action.' },
  { name: 'Signature Skills', category: 'General', group: 'General', prerequisites: null, effect: 'Take 10 on two chosen skills, even in combat. Can be chosen multiple times for additional skill pairs.' },
  { name: 'Supportive', category: 'General', group: 'General', prerequisites: null, effect: 'Take multiple support actions per round, each supporting a different character.' },
  { name: 'Touch Of Life', category: 'General', group: 'General', prerequisites: 'Training in Arcane and Religion', effect: 'One action: heal yourself 1d8 + level (1 nonlethal). Two actions: heal a touched creature (1 nonlethal). Three actions: heal a touched creature (no cost).' },
  { name: 'Toughness', category: 'General', group: 'General', prerequisites: null, effect: 'Gain advantage on Fortitude saves against damage and gain 5 extra hit points.' },
  { name: 'Trap Crafter', category: 'General', group: 'General', prerequisites: 'Training in Craft: Traps', effect: 'Learn two trap types from six options with their triggers, setup times, and materials. Can be chosen multiple times.' },
  { name: 'Versatile', category: 'General', group: 'General', prerequisites: null, effect: 'Acquire an extra trait. Can only be selected once.' },
  { name: 'Wondrous Crafter', category: 'General', group: 'General', prerequisites: 'Spellcraft and the Craft skills noted in each section', effect: 'Choose two item types (Magic Items, Rods, Scrolls, Wands) to craft using Eldritch Jewels and an arcane focus.' },
  { name: 'Words of Magic', category: 'General', group: 'General', prerequisites: 'Training in Linguistics and Spellcraft', effect: 'Learn spells equal to your Intelligence modifier, cast using your Linguistics bonus; each requires a DC 10 Linguistics check and a written spell item.' },

  // General Skill Feats (one per skill)
  { name: 'Careful Steps', category: 'General', group: 'Skill', prerequisites: 'Training in Acrobatics', effect: 'You are unaffected by difficult terrain.' },
  { name: 'Deal Finder', category: 'General', group: 'Skill', prerequisites: 'Training in Appraise', effect: 'Use Appraise for bartering instead of Diplomacy, and for hidden-object searches instead of Perception.' },
  { name: 'Psychic Power', category: 'General', group: 'Skill', prerequisites: 'Training in Arcane', effect: 'Learn Create Image, Enchant Creature, and Mindlink using Arcane and Charisma instead of Spellcraft/Intelligence; you cannot learn Advanced/Expert versions.' },
  { name: 'Source of Distraction', category: 'General', group: 'Skill', prerequisites: 'Training in Artistry', effect: 'As an action, make an Artistry check opposed by a Will save to fascinate a creature using metallic or artistic objects.' },
  { name: 'Rehearsed Story', category: 'General', group: 'Skill', prerequisites: 'Training in Bluff', effect: 'Gain advantage on Bluff checks when using an invented alter ego or fall-guy persona.' },
  { name: 'Strong Grip', category: 'General', group: 'Skill', prerequisites: 'Training in Climb', effect: 'Gain or increase a climb speed by 10 feet; gain advantage on defensive rolls against disarm attempts.' },
  { name: 'Multitasking', category: 'General', group: 'Skill', prerequisites: 'Training in any Craft', effect: 'Use two different craft subskills simultaneously on separate projects.' },
  { name: 'Honeyed Tongue', category: 'General', group: 'Skill', prerequisites: 'Training in Diplomacy', effect: 'Three-action Diplomacy check opposed by a Will save to achieve peace in combat for one minute, with listed degrees of success.' },
  { name: 'Tools of the Trade', category: 'General', group: 'Skill', prerequisites: 'Training in Disable Device', effect: 'Use thieves’ tools as a 1d4 piercing proficient weapon using your Disable Device bonus; the tools have the engineered property.' },
  { name: 'Uncanny Dodge', category: 'General', group: 'Skill', prerequisites: 'Training in Escape Artist', effect: 'Use your Escape Artist bonus instead of your Reflex save bonus against melee attacks.' },
  { name: 'Master Flier', category: 'General', group: 'Skill', prerequisites: 'Training in Fly', effect: 'Use your Fly bonus instead of your Reflex save bonus against ranged attacks while flying.' },
  { name: "Nature's Friend", category: 'General', group: 'Skill', prerequisites: 'Training in Handle Animal', effect: 'Three-action Handle Animal check opposed by an animal’s Will save to achieve peace in combat, with listed degrees of success.' },
  { name: 'Natural Medicine', category: 'General', group: 'Skill', prerequisites: 'Training in Heal', effect: 'One hour of dedicated use of honey heals hit points equal to your Heal bonus; one hour with sunflower removes conditions.' },
  { name: 'Show of Force', category: 'General', group: 'Skill', prerequisites: 'Training in Intimidate', effect: 'As an action, intimidate creatures within 20 feet up to your Charisma modifier; this can be used as a single attack instead.' },
  { name: 'Lore Master', category: 'General', group: 'Skill', prerequisites: 'Training in any Lore', effect: 'Make Lore checks on topics related to your trained Craft, Perform, or Profession skills using the relevant Lore subskill bonus.' },
  { name: 'Philologist', category: 'General', group: 'Skill', prerequisites: 'Training in Linguistics', effect: 'Create a new language. Can be chosen multiple times.' },
  { name: 'Cruel Materials', category: 'General', group: 'Skill', prerequisites: 'Training in Nature', effect: 'Manufacture poisons using your Nature bonus instead of Craft: Poison, and gain immunity to all poisons and venoms.' },
  { name: 'One Eye Open', category: 'General', group: 'Skill', prerequisites: 'Training in Perception', effect: 'Take no penalty on Perception checks while asleep.' },
  { name: 'Disruptive Performance', category: 'General', group: 'Skill', prerequisites: 'Training in any Perform skill', effect: 'As an action, make a feint check without a weapon using your highest Perform bonus.' },
  { name: 'Augury', category: 'General', group: 'Skill', prerequisites: 'Training in Religion', effect: 'Meditate to ask the powers one question, choosing aligned-creature detection, clairvoyance, or specific knowledge, with the listed costs.' },
  { name: 'Careful Jockey', category: 'General', group: 'Skill', prerequisites: 'Training in Ride', effect: 'Ride any creature regardless of size so long as its weight is within your carrying capacity.' },
  { name: 'Careful Listener', category: 'General', group: 'Skill', prerequisites: 'Training in Sense Motive', effect: 'Use your Sense Motive bonus in place of your Diplomacy bonus for Diplomacy checks.' },
  { name: 'Quick Fingers', category: 'General', group: 'Skill', prerequisites: 'Training in Sleight of Hand', effect: 'Two-action activity including a stride action with a Sleight of Hand attempt at any point during the movement.' },
  { name: 'Enchanter', category: 'General', group: 'Skill', prerequisites: 'Training in Spellcraft', effect: 'Use Spellcraft to recharge enchanted items/Eldritch Jewels instead of Arcane; take half nonlethal damage on a recharge roll below 20+.' },
  { name: 'Shadow Speed', category: 'General', group: 'Skill', prerequisites: 'Training in Stealth', effect: 'Make Stealth checks while striding instead of only while taking steps.' },
  { name: 'Strong Swimmer', category: 'General', group: 'Skill', prerequisites: 'Training in Swim', effect: 'Gain or increase a swim speed by 10 feet, and hold your breath twice as long as normal.' },

  // Special Feats (proficiency + save feats)
  { name: 'Armor Proficiency', category: 'General', group: 'Special', prerequisites: null, effect: 'Eliminate the penalty on Reflex saves from wearing armor.' },
  { name: 'Boundless Stamina', category: 'General', group: 'Special', prerequisites: null, effect: 'Gain a +2 bonus on Fortitude saves.' },
  { name: 'Daring Quickness', category: 'General', group: 'Special', prerequisites: null, effect: 'Gain a +2 bonus on Reflex saves.' },
  { name: 'Inspiring Insight', category: 'General', group: 'Special', prerequisites: null, effect: 'Gain a +2 bonus on Will saves.' },
  { name: 'Shield Proficiency', category: 'General', group: 'Special', prerequisites: null, effect: 'Eliminate shield penalties; ready a shield as an action for a +2 Reflex bonus for one round; use the shield for its bonus and as a weapon simultaneously.' },
  { name: 'Weapon Training', category: 'General', group: 'Special', prerequisites: null, effect: 'Gain proficiency with any two weapon groups. Can be chosen multiple times for additional weapon-group pairs.' },

  // Ability Score Feats
  { name: 'Strength', category: 'General', group: 'Ability', prerequisites: null, effect: 'Gain an Ability Score Boost to Strength, and reroll one Strength-based skill check daily.' },
  { name: 'Dexterity', category: 'General', group: 'Ability', prerequisites: null, effect: 'Gain an Ability Score Boost to Dexterity, and reroll one Dexterity-based skill check daily.' },
  { name: 'Constitution', category: 'General', group: 'Ability', prerequisites: null, effect: 'Gain an Ability Score Boost to Constitution, and remain conscious one additional turn at 0 HP unless killed.' },
  { name: 'Intelligence', category: 'General', group: 'Ability', prerequisites: null, effect: 'Gain an Ability Score Boost to Intelligence, and reroll one Intelligence-based skill check daily.' },
  { name: 'Wisdom', category: 'General', group: 'Ability', prerequisites: null, effect: 'Gain an Ability Score Boost to Wisdom, and reroll one Wisdom-based skill check daily.' },
];

/** Every authored IG feat (General now; Combat added in a later slice). */
export function igAllFeats(): IGFeat[] {
  return [...IG_GENERAL_FEATS];
}
