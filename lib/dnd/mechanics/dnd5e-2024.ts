// lib/dnd/mechanics/dnd5e-2024.ts — the core 2024 rules, as first-class entries.
//
// S8 of DND_2024_COMPLETE_LIBRARY_2026-07-20. Conditions and spellcasting already had entries;
// this is everything else a table actually stops to look up mid-session — cover, surprise,
// death saves, resting, the action list, hiding, grappling.
//
// WHY THIS MATTERS MORE THAN IT LOOKS: 2024 quietly rewrote several of these, and the rewrites
// are the kind a group carries a 2014 habit straight through. Surprise no longer costs you a
// turn. Exhaustion is a flat −2 per level to every d20 Test. Grapple and Shove are Unarmed
// Strike options with a save, not contested checks. Two-Weapon Fighting needs the Light
// property AND is folded into the Attack action. Every entry that changed carries an
// `editionNote` saying so, because a rule you think you know is the one you never look up.
//
// House style: paraphrased mechanics + numbers, attributed. Each entry pairs the rule with a
// worked example, same as the spellcasting explainers.

export type MechanicCategory =
  | 'core' | 'combat' | 'action' | 'movement' | 'exploration' | 'rest' | 'social';

export interface RuleEntry {
  key: string;
  name: string;
  category: MechanicCategory;
  /** The rule, paraphrased. */
  rule: string;
  /** A concrete worked example — the numbers are where people go wrong. */
  example: string;
  /** Set when 2024 changed this rule from 2014. */
  editionNote?: string;
  source: string;
}

const PHB = 'PHB 2024';

export const RULES_2024: RuleEntry[] = [
  // ── Core resolution ──
  {
    key: 'd20-test', name: 'D20 Test', category: 'core',
    rule: 'Every ability check, saving throw and attack roll is a D20 Test: roll a d20, add the relevant modifiers, and compare against a Difficulty Class or Armor Class. Meeting the number succeeds.',
    example: 'A DC 15 Athletics check with +3 Athletics needs a 12 or better on the die. A roll of exactly 15 total succeeds — ties go to the roller.',
    editionNote: '2024 names the three roll types collectively "D20 Tests", which is what lets effects like Exhaustion and Bless apply to all three in one sentence.',
    source: PHB,
  },
  {
    key: 'advantage-disadvantage', name: 'Advantage and Disadvantage', category: 'core',
    rule: 'Roll two d20s and take the higher (advantage) or lower (disadvantage). They do not stack: any number of sources of advantage is still one reroll, and if you have both at once they cancel entirely.',
    example: 'You are hidden (advantage) and Poisoned (disadvantage): they cancel, and you roll one plain d20 — not two of each.',
    source: PHB,
  },
  {
    key: 'proficiency-bonus', name: 'Proficiency Bonus', category: 'core',
    rule: 'A single bonus from your character level — +2 at levels 1–4, rising to +6 at 17 — added to anything you are proficient with. It is never added twice to the same roll.',
    example: 'A level 5 character has +3. Their Perception (proficient, Wisdom +2) is +5; their Arcana (not proficient, Intelligence +1) is +1.',
    source: PHB,
  },
  {
    key: 'heroic-inspiration', name: 'Heroic Inspiration', category: 'core',
    rule: 'When you have Heroic Inspiration you can reroll any d20 immediately after rolling, and must use the new roll. You can only hold one at a time.',
    example: 'You roll a 3 on a save, spend Heroic Inspiration, and reroll — getting a 14, which stands even though you might have preferred the first.',
    editionNote: 'Renamed from "Inspiration" in 2024, and it is now a reroll rather than granting advantage.',
    source: PHB,
  },

  // ── Combat ──
  {
    key: 'initiative', name: 'Initiative', category: 'combat',
    rule: 'A Dexterity check at the start of combat sets turn order, highest first. Ties are broken however the group prefers, commonly by Dexterity score.',
    example: 'Dexterity +3 rolling a 12 acts on initiative 15, before a creature on 14.',
    source: PHB,
  },
  {
    key: 'surprise', name: 'Surprise', category: 'combat',
    rule: 'A surprised creature has DISADVANTAGE on its initiative roll. It does not lose its turn.',
    example: 'The ambushed guard rolls 2 d20s for initiative and takes the lower — say 4 rather than 17 — so he acts late in round 1. He still gets a full turn when it comes, which in 2014 he would not have.',
    editionNote: 'Materially different from 2014, where a surprised creature could not act at all on its first turn. This is one of the most commonly carried-over 2014 habits.',
    source: PHB,
  },
  {
    key: 'cover', name: 'Cover', category: 'combat',
    rule: 'Half cover gives +2 AC and +2 Dexterity saves; three-quarters cover gives +5 to both; total cover cannot be targeted directly at all. Only the most protective source applies.',
    example: 'An archer behind a low wall (half cover) has effective AC 16 instead of 14. Duck fully behind it and they cannot be targeted by an attack at all — though an area effect may still catch them.',
    source: PHB,
  },
  {
    key: 'unarmed-strike', name: 'Unarmed Strike', category: 'combat',
    rule: 'An Unarmed Strike offers three options: Damage (1 + Strength modifier bludgeoning), Grapple, or Shove. Grapple and Shove force a saving throw against DC 8 + Strength modifier + proficiency bonus.',
    example: 'A Fighter with Strength +4 and proficiency +3 grapples: the target makes a Strength or Dexterity save against DC 15, and on a failure gains the Grappled condition.',
    editionNote: '2024 replaced 2014\'s contested-check grapple and shove with a saving throw against a fixed DC — faster, and it stops a high-Athletics character auto-winning every grapple.',
    source: PHB,
  },
  {
    key: 'two-weapon-fighting', name: 'Two-Weapon Fighting', category: 'combat',
    rule: 'When you take the Attack action with a Light weapon in one hand, you can make one extra attack with a different Light weapon in the other as a Bonus Action, adding no ability modifier to its damage.',
    example: 'Two Shortswords (both Light): attack normally, then Bonus Action for a second 1d6 with no +DEX on the damage. The Nick mastery removes even the Bonus Action cost.',
    editionNote: '2024 requires the Light property on BOTH weapons and ties the extra attack to the Attack action; the Nick mastery is the way to get it without spending your Bonus Action.',
    source: PHB,
  },
  {
    key: 'death-saving-throws', name: 'Death Saving Throws', category: 'combat',
    rule: 'At 0 hit points, roll a d20 at the start of each turn: 10 or higher succeeds, lower fails. Three successes stabilise you; three failures kill you. A natural 20 restores 1 hit point; a natural 1 counts as two failures. Damage taken while down is a failure, and two if it was a critical hit.',
    example: 'You roll 7, 14, 3 — that is two failures and one success. The next failure kills you, so an ally should be spending their action now rather than after.',
    source: PHB,
  },
  {
    key: 'critical-hits', name: 'Critical Hits', category: 'combat',
    rule: 'A natural 20 on an attack roll always hits and doubles the attack\'s damage DICE — not the flat modifiers.',
    example: 'A Greatsword crit rolls 4d6 rather than 2d6, then adds Strength once. A +4 Strength bonus stays +4, it does not become +8.',
    editionNote: '2024 restricts critical hits to WEAPON attacks and unarmed strikes; a spell attack roll no longer crits.',
    source: PHB,
  },

  // ── Actions ──
  {
    key: 'action-list', name: 'Actions in Combat', category: 'action',
    rule: 'On your turn you get one action, one bonus action if something grants it, and movement. The standard actions are Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study and Utilize.',
    example: 'With a 30-foot speed you Dash for 60 feet and still take a Bonus Action to cast Misty Step for another 30 — but you cannot also Attack, because Dash used your 1 action.',
    editionNote: '2024 renamed and formalised several: Magic covers casting and magic items, Study replaces knowledge-checking, Influence covers social attempts, and Utilize covers using an object.',
    source: PHB,
  },
  {
    key: 'opportunity-attacks', name: 'Opportunity Attacks', category: 'action',
    rule: 'When a creature you can see leaves your reach, you can spend your Reaction to make one melee attack against it. Taking the Disengage action prevents them for that turn.',
    example: 'The goblin steps from 5 feet to 15 feet away and you swing as it goes. Had it Disengaged first, you would get nothing.',
    source: PHB,
  },
  {
    key: 'hiding', name: 'Hiding', category: 'action',
    rule: 'The Hide action needs a DC 15 Stealth check while heavily obscured or behind cover and unseen. Success gives you the Invisible condition until you attack, cast, make noise, or are found.',
    example: 'You roll 17 Stealth behind a pillar and are treated as Invisible: your first attack has advantage, and it ends the hiding.',
    editionNote: '2024 fixes the DC at 15 and grants the Invisible condition outright, rather than leaving it to a contested Perception check.',
    source: PHB,
  },

  // ── Movement ──
  {
    key: 'difficult-terrain', name: 'Difficult Terrain', category: 'movement',
    rule: 'Every foot of difficult terrain costs an extra foot of movement. It does not stack — two overlapping sources still cost double, not triple.',
    example: 'A 30-foot speed crosses 15 feet of rubble. Add ice on top of the rubble and it is still 15 feet, not 10.',
    source: PHB,
  },
  {
    key: 'jumping', name: 'Jumping', category: 'movement',
    rule: 'A long jump covers your Strength score in feet with a 10-foot run-up, half that from standing. A high jump reaches 3 + your Strength modifier feet, and you can extend reach by 50% of your height.',
    example: 'Strength 16 (+3): a 16-foot running long jump, 8 feet standing, and a 6-foot high jump.',
    source: PHB,
  },
  {
    key: 'falling', name: 'Falling', category: 'movement',
    rule: '1d6 bludgeoning per 10 feet fallen, to a maximum of 20d6, and you land Prone unless the fall was avoided or negated.',
    example: 'A 40-foot fall is 4d6 and you end up Prone — costing half your movement to stand once you act.',
    source: PHB,
  },

  // ── Exploration ──
  {
    key: 'vision-and-light', name: 'Vision and Light', category: 'exploration',
    rule: 'A lightly obscured area imposes disadvantage on Perception checks relying on sight; a heavily obscured area blocks sight entirely, effectively Blinding you within it. Darkvision lets you treat dim light as bright and darkness as dim — but never reveals colour.',
    example: 'In fog (heavily obscured) you cannot see the ogre 10 feet away even with 60 feet of darkvision, so your attacks have disadvantage and its attacks on you have advantage.',
    source: PHB,
  },
  {
    key: 'carrying-capacity', name: 'Carrying Capacity', category: 'exploration',
    rule: 'You can carry Strength score × 15 pounds. Beyond that, at Strength × 10 you are encumbered — speed drops and heavier loads impose disadvantage on Strength, Dexterity and Constitution D20 Tests.',
    example: 'Strength 14 carries 210 pounds; past 140 pounds the character starts paying for it.',
    source: PHB,
  },
  {
    key: 'travel-pace', name: 'Travel Pace', category: 'exploration',
    rule: 'A fast pace covers 4 miles an hour but imposes disadvantage on Perception; a normal pace 3 miles; a slow pace 2 miles but allows Stealth. Eight hours of travel is a normal day.',
    example: 'Pushing a fast pace to reach the village covers 32 miles in a day — and you are far more likely to walk into the ambush.',
    source: PHB,
  },

  // ── Rest ──
  {
    key: 'short-rest', name: 'Short Rest', category: 'rest',
    rule: 'One hour of light activity. You may spend Hit Point Dice to heal, rolling each and adding your Constitution modifier, and some features recharge.',
    example: 'A level 5 Fighter spends 3 of their d10 Hit Dice with Constitution +2: roughly 3d10 + 6 hit points back, and Second Wind returns.',
    source: PHB,
  },
  {
    key: 'long-rest', name: 'Long Rest', category: 'rest',
    rule: 'Eight hours, at most two of which are light activity. You regain all hit points, half your total Hit Point Dice, and all spell slots; Exhaustion drops by one level. Only one long rest benefits you per 24 hours.',
    example: 'A level 8 character regains all hit points and 4 of their 8 Hit Dice — the dice come back slowly on purpose, so attrition still bites over several days.',
    source: PHB,
  },
  {
    key: 'exhaustion', name: 'Exhaustion', category: 'rest',
    rule: 'Each level of Exhaustion imposes a cumulative −2 penalty to every D20 Test and reduces speed by 5 feet. Six levels is death. A long rest removes one level.',
    example: 'Exhaustion 3 means −6 on every attack, check and save, and −15 feet of speed. The old 2014 table of separate per-level effects is gone.',
    editionNote: '2024 replaced 2014\'s six distinct effects with one flat, cumulative penalty — far simpler, and it bites earlier than the old table did.',
    source: PHB,
  },
];

const BY_KEY = new Map(RULES_2024.map((r) => [r.key, r]));
const BY_NAME = new Map(RULES_2024.map((r) => [r.name.toLowerCase(), r]));

export function findRule2024(keyOrName: string): RuleEntry | undefined {
  const q = keyOrName.trim().toLowerCase();
  return BY_KEY.get(q) ?? BY_NAME.get(q);
}

export function rulesByCategory(category: MechanicCategory): RuleEntry[] {
  return RULES_2024.filter((r) => r.category === category);
}

export const MECHANIC_CATEGORIES: MechanicCategory[] = [
  'core', 'combat', 'action', 'movement', 'exploration', 'rest', 'social',
];

/** The rules 2024 changed from 2014 — the ones a group most often plays wrong from habit. */
export function changedIn2024(): RuleEntry[] {
  return RULES_2024.filter((r) => !!r.editionNote);
}
