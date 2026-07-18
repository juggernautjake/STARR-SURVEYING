// lib/dnd/systems/intuitive-games/spell-tiers.ts — the Advanced + Expert tier text for every IG spell/power,
// scraped verbatim from intuitivegames.net/spell-list (2026-07-18). Closes A19's last gap: IG_POWERS carries a
// power's base Description; this carries its two upgrade TIERS (what the spell gains when cast as an Advanced or
// Expert version), so the library + AI can show a spell's full progression, not just its base effect. Data only,
// verbatim from the site (Ground Rule 2). Keyed by the same power name as IG_POWERS / IG_SPELL_ROSTER (first-seen
// wins where the site lists the same name twice).
export interface IGSpellTiers { advanced: string; expert: string }
export const IG_SPELL_TIERS: Record<string, IGSpellTiers> = {
  "Adaptation": { advanced: "Ignore any penalties imposed by this spell, such as disadvantage on attack rolls and reflex saves.", expert: "Gain temporary HP equal to your Constitution score when using this ability." },
  "Burst": { advanced: "You instead move up to three times your speed.", expert: "You instead move up to four times your speed." },
  "Calm": { advanced: "You remove a number of conditions equal to your intelligence modifier.", expert: "This ability can be used as a reaction." },
  "Carapace Growth": { advanced: "This DR applies against force damage.", expert: "You are immune to critical hits while this spell is in effect." },
  "Command": { advanced: "You can direct the creature to take two actions of your choice.", expert: "The duration for the spell is doubled." },
  "Comprehend": { advanced: "You do not need to touch the creature, but need to lock your gaze on them while casting the spell.", expert: "The casting of this spell takes only one action." },
  "Conjure Wall": { advanced: "As an action, you can rearrange the wall. You cannot exceed the spell's range and one end point of the wall must remain in place.", expert: "Each section of wall is twice as tall as normal." },
  "Create Image": { advanced: "Your illusion also makes noise and emanates odors as appropriate for the illusion.", expert: "Your Spellcraft checks to maintain the illusion against target creatures are made with advantage." },
  "Create Shelter": { advanced: "The shelter becomes a two-layer structure, with twice as much space.", expert: "The shelter only needs to be renewed once a week before disappearing." },
  "Creature Morph": { advanced: "You can choose a creature that is Tiny or Huge.", expert: "The creature gets one of the Companion Aspects in addition to all other changes." },
  "Darkness": { advanced: "Cause creatures inside of the spell to be shaken for a number of rounds equal to your intelligence modifier. Creatures make a fortitude save opposed by your Spellcraft skill to negate the effect.", expert: "Double the duration of the shaken condition." },
  "Destruction": { advanced: "Ignore the hardness of objects when dealing damage with this ability.", expert: "This becomes a two-action ability." },
  "Detect Magic": { advanced: "You gain advantage on any Spellcraft checks to identify spells while Detect Magic is active.", expert: "Detect Magic lasts for a number of hours per level equal to your Spellcraft modifier, or whenever you fail a Fortitude save against damage taken." },
  "Detect Thoughts/Emotions": { advanced: "You can search through the creature's mind and determine their answer to a single question.", expert: "You understand all languages the creature speaks when reading their thoughts." },
  "Disguise": { advanced: "The creature’s height and weight are changed to match the chosen target.", expert: "Creatures do not get advantage on checks against the disguise by touching the creature within the first round of interaction.The spell lasts for a number of hours equal to your Spellcraft skill." },
  "Dispel Magic": { advanced: "This spell can be used on existing spells as a two action activity, not just as a reaction.", expert: "You gain advantage on all Spellcraft rolls made with this spell." },
  "Elemental Blade": { advanced: "The weapon deals an additional 1d8 damage.", expert: "The weapon deals an additional 1d8 damage." },
  "Enchant Creature": { advanced: "So long as the creature does not take damage, they do not perceive imminent danger from drawn weapons or combat nearby them.", expert: "The duration for the spell is doubled." },
  "Erase Memory": { advanced: "This spell becomes a two-action activity.", expert: "This spell becomes a one-action activity." },
  "Foresight": { advanced: "Your meditation time is cut in half for any Foresight except Aligned Creatures.", expert: "You are always using the Foresight for Aligned Creatures while you are conscious." },
  "Gate": { advanced: "You can change the size of the gate, increasing it by up to 10 feet per level in its combined length and width.", expert: "The gate remains open as long as you are conscious or until you will it to close with an action." },
  "Hold Creature": { advanced: "The duration increases to two rounds.", expert: "The duration increases to a total of three rounds." },
  "Intense Blast": { advanced: "The additional damage increases to 2d6 in total.", expert: "The additional damage increases to 3d6 in total." },
  "Invisibility": { advanced: "Invisible creatures and objects also make no sound, except for speaking if the creature does so.", expert: "Invisibility does not wear off when the subject attacks another creature." },
  "Item Shift": { advanced: "The maximum mass of the object altered is now equal to double your Spellcraft modifier.", expert: "The item is shifted permanently." },
  "Light": { advanced: "Cause creatures inside of the spell to be blinded for one round. Creatures make a fortitude save opposed by your Spellcraft skill to negate the effect.", expert: "Double the duration of the blindness." },
  "Mimic Sound": { advanced: "The sound may deal sonic damage equal to your Elemental Blast to a target within range if you choose.", expert: "You no longer need to spend an action maintaining this illusion. If you spend an action, you may choose a new target to deal Elemental Blast damage." },
  "Mind Scream": { advanced: "The damage increases to 1d6x2.", expert: "You can target two ability scores with this ability." },
  "Mindlink": { advanced: "The range of this ability increases to a number of miles equal to your level.", expert: "The spell does not need to be cast on only a willing target, but an unwilling target may make a Will save to resist the effect." },
  "Mirror Image": { advanced: "The starting number of mirror images increases to 6.", expert: "You can move the images away from you, causing duplicates of yourself to appear in multiple locations. Directing them requires a free action. When you move, they may move to any square within range. All actions you take and words you speak seem to emanate from you and the images simultaneously." },
  "Named Bullet": { advanced: "The attack is made at advantage and bypasses all DR the creature possesses.", expert: "If the attack hits, the creature is stunned for one round." },
  "Natural Ally": { advanced: "Summon a number of creatures equal to half your level.", expert: "The creatures can all be directed using a free action." },
  "Natural Attacks": { advanced: "The natural attacks deal 1d10 points of damage.", expert: "The natural attacks deal 2d6 points of damage." },
  "New Movement": { advanced: "The movement speed granted is doubled.", expert: "The duration increases to a number of hours equal to your intelligence modifier." },
  "Poison Dart": { advanced: "The damage increases to 1d6x2.", expert: "You can target two ability scores with this ability." },
  "Portal": { advanced: "When casting the spell, you can move up to 10 feet per level.", expert: "You do not need to be able to see your destination to teleport there. If the destination is occupied by a creature or object, you must make a DC 20 reflex save or else fall prone in the nearest adjacent square." },
  "Protection From Elements": { advanced: "The resistance applies to any type of elemental damage.", expert: "The resistance applies to any type of damage." },
  "Quick Claw": { advanced: "When you attack with the claw, you may make one extra attack as a free action. This only applies once per round.", expert: "The bleed damage from each attack increases to 2d6." },
  "Radiance": { advanced: "Creatures within the area also heal 2 points of nonlethal damage.", expert: "Creatures in the area gain all benefits, including the removal of any of the listed conditions afflicting them when the spell is cast." },
  "Repeating Blast": { advanced: "Launch a total of three blasts with this ability.", expert: "Launch a total of three blasts with this ability." },
  "Scrying": { advanced: "You only need to meet one of the familiarity requirements to scry on a creature.", expert: "There is no range limit on your scrying." },
  "Shield Ally": { advanced: "The bonus granted applies to all saving throws, not just reflex saves.", expert: "The spells effects last for one minute." },
  "Spectral Sling": { advanced: "The attack deals an additional 1d8 damage.", expert: "The attack deals an additional 1d8 damage." },
  "Subtle Manipulation": { advanced: "If you succeed the check, this spell does not count as rigorous activity and you take no non-lethal damage for using it.", expert: "If you succeed the check, this spell does not count as rigorous activity and you take no non-lethal damage for using it." },
  "Summon Material": { advanced: "You cover twice as much area with this ability.", expert: "As an action, you can rearrange the material. You cannot exceed the spell's range and one end point of the material must remain in place." },
  "Telekinesis": { advanced: "Your telekinesis can affect a number of targets equal to your intelligence modifier.", expert: "When you hit a creature with the spell, they move twice as far as normal with the effect and the damage is doubled." },
  "Teleportation": { advanced: "You can bring a number of creatures equal to your intelligence modifier", expert: "You can teleport to any point on a map, landing within 100 feet of the specified location." },
  "Temporary Weapon": { advanced: "Gain advantage on all combat skills with the weapon.", expert: "The weapon bypasses all DR." },
  "Trace": { advanced: "The creature only needs to have been within 1000 feet of your current location.", expert: "The creature only needs to have been within a mile of your current location." },
  "Unburdened Vision": { advanced: "You can affect any touched, willing creature with this spell.", expert: "The range of the effects from this spell increase to 60 feet." },
  "Unseen Servant": { advanced: "You conjure a number of unseen servants equal to half your level.", expert: "The unseen servants can all be directed using a free action." },
  "Vitality": { advanced: "This spell becomes a two-action activity.", expert: "This spell becomes a one-action activity." },
  "Wave Crash": { advanced: "The damage increases to 2d6.", expert: "The damage increases to 3d6." },
  "Wind Blast": { advanced: "Any target of your Wind Blast is also subject to a Reposition attempt with a bonus equal to your Spellcraft bonus. Both effects are determined by the same reflex save.", expert: "A creature hit by your Wind Blast attack is also Confused for one round." },
};

/** The Advanced/Expert tiers for a spell/power by name (case-insensitive), or undefined if not captured. */
export function igSpellTiers(name: string | null | undefined): IGSpellTiers | undefined {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  for (const [k, v] of Object.entries(IG_SPELL_TIERS)) if (k.toLowerCase() === key) return v;
  return undefined;
}
