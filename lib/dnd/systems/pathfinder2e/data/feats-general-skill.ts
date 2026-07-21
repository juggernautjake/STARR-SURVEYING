// lib/dnd/systems/pathfinder2e/data/feats-general-skill.ts — the GENERAL and SKILL feat catalog.
//
// PF2 advances on four parallel feat tracks. Two of them are shared by every character regardless of
// class or ancestry: general feats (levels 3, 7, 11, 15, 19) and skill feats (every even level, plus
// the one your background grants). This file is those two tracks. Ancestry and class feats are scoped
// to their ancestry/class and live elsewhere.
//
// LICENSING: PF2 mechanics are ORC-licensed, which expressly permits reproducing rules mechanics.
// Reserved Material — Paizo trademarks, deities, characters, locations, lore, art — must never appear
// here. Every entry carries `source`. Mechanical facts and numbers, PARAPHRASED; never verbatim
// rulebook prose. Remaster terminology and Remaster levels throughout.
//
// GROUND RULE 3 — NEVER INVENT A FEAT, A LEVEL, OR A PREREQUISITE. This is a rules platform, and a
// plausible-but-wrong level or prerequisite is worse than an absent entry: eligibility.ts turns these
// fields into a hard gate, so a wrong prereq makes the builder REFUSE a legal choice, which is the one
// failure mode a player cannot work around. Where a feat's level, rank, or action cost was not known
// with confidence the entry is OMITTED entirely, or the uncertain FIELD is omitted. Nothing here is
// filled in from vibes, and the catalog is deliberately not padded toward completeness.
//
// HOW PREREQUISITES ARE AUTHORED (this is the load-bearing part — see eligibility.ts):
//   • `prereqs` is CHECKED, and the entries are ANDed together. Every skill-rank, attribute, feat,
//     level, class, and ancestry prerequisite that applies unconditionally goes here.
//   • `prereqText` is DISPLAYED and never enforced. Two kinds of prerequisite must live here:
//       (a) DISJUNCTIONS — "trained in Arcana, Nature, Occultism, or Religion". The array is an AND,
//           so structuring these would demand all four ranks and block legal picks.
//       (b) PARAMETRIC ranks — "trained in the chosen skill" (Assurance, Additional Lore). The skill
//           is not known until the player picks it, so there is nothing to name.
//     Both are shown to the player rather than silently enforced or silently dropped.
//   • ATTRIBUTE values are MODIFIERS, not scores — PF2 has no scores in play (see model.ts). A legacy
//     "Strength 16" prerequisite is authored as `{ kind: 'attribute', attribute: 'STR', value: 3 }`.
//   • Skill names must match `PF2_SKILLS` in content.ts exactly; the gate looks them up by key.
import type { PF2FeatFull } from '../defs';

// ══ GENERAL FEATS ═════════════════════════════════════════════════════════════════════════════════
// Taken with a general feat slot (levels 3, 7, 11, 15, 19). A general feat's own level is a floor, so
// a level-1 general feat is simply the common case rather than something you can take at level 1.
// Skill feats also carry the `general` trait, but they occupy skill slots and live in the next section.

export const PF2_FEATS_GENERAL: PF2FeatFull[] = [
  {
    name: 'Adopted Ancestry',
    level: 1,
    track: 'general',
    traits: ['general'],
    prereqText: 'You were raised by people of an ancestry other than your own.',
    effect:
      'Choose an ancestry other than your own. You count as a member of that ancestry for the purpose of qualifying for its ancestry feats, and can select its ancestry feats with your ancestry feat slots. You do not gain that ancestry\'s other benefits, such as its Hit Points or vision.',
    source: 'Player Core',
  },
  {
    name: 'Ancestral Paragon',
    level: 3,
    track: 'general',
    traits: ['general'],
    effect: 'Gain a 1st-level ancestry feat of your choice, over and above your usual ancestry feats.',
    source: 'Player Core',
  },
  {
    name: 'Armor Proficiency',
    level: 1,
    track: 'general',
    traits: ['general'],
    effect:
      'Become trained in light armor. If you were already trained in light armor, you become trained in medium armor instead; if already trained in medium, you become trained in heavy armor.',
    repeatable: true,
    source: 'Player Core',
  },
  {
    name: 'Breath Control',
    level: 1,
    track: 'general',
    traits: ['general'],
    effect:
      'You can hold your breath far longer than normal, and you gain a +1 circumstance bonus to saves against inhaled threats. A success against such a threat counts as a critical success.',
    source: 'Player Core',
  },
  {
    name: 'Canny Acumen',
    level: 1,
    track: 'general',
    traits: ['general'],
    prereqText: 'You are not already an expert in the saving throw or Perception you choose.',
    effect:
      'Choose Perception or one saving throw. You become an expert in it, and at 17th level you become a master in it instead.',
    source: 'Player Core',
  },
  {
    name: 'Diehard',
    level: 1,
    track: 'general',
    traits: ['general'],
    effect: 'You die from the dying condition at dying 5 rather than dying 4, giving you one more chance to be stabilized.',
    source: 'Player Core',
  },
  {
    name: 'Fast Recovery',
    level: 1,
    track: 'general',
    traits: ['general'],
    // "Constitution 14" in legacy terms; the model stores modifiers, so +2.
    prereqs: [{ kind: 'attribute', attribute: 'CON', value: 2 }],
    effect:
      'You regain twice as many Hit Points from resting. When you rest while afflicted by a disease or poison, a successful save against it counts as two successes, speeding your recovery.',
    source: 'Player Core',
  },
  {
    name: 'Feather Step',
    level: 1,
    track: 'general',
    traits: ['general'],
    prereqs: [{ kind: 'attribute', attribute: 'DEX', value: 2 }],
    effect: 'You can Step into difficult terrain, which normally cannot be entered with a Step.',
    source: 'Player Core',
  },
  {
    name: 'Fleet',
    level: 1,
    track: 'general',
    traits: ['general'],
    effect: 'Your Speed increases by 5 feet.',
    source: 'Player Core',
  },
  {
    name: 'Incredible Initiative',
    level: 1,
    track: 'general',
    traits: ['general'],
    effect: 'You gain a +2 circumstance bonus when you roll initiative.',
    source: 'Player Core',
  },
  {
    name: 'Intimidating Prowess',
    level: 2,
    track: 'general',
    traits: ['general'],
    // "Strength 16" in legacy terms; the model stores modifiers, so +3.
    prereqs: [
      { kind: 'attribute', attribute: 'STR', value: 3 },
      { kind: 'skill', skill: 'Intimidation', rank: 'trained' },
    ],
    effect:
      'When you Coerce or Demoralize a target you are physically menacing in person, you gain a +1 circumstance bonus to the check. The bonus increases to +2 if you are legendary in Intimidation.',
    source: 'Player Core',
  },
  {
    name: 'Ride',
    level: 1,
    track: 'general',
    traits: ['general'],
    effect:
      'When you Command an Animal that you are riding to move, it uses its actions to do so without you needing to succeed at a check first, and it can still act on its own turn.',
    source: 'Player Core',
  },
  {
    name: 'Shield Block',
    level: 1,
    track: 'general',
    traits: ['general'],
    cost: 'reaction',
    trigger: 'While you have a shield raised, you take damage from a physical attack.',
    effect:
      'Your shield absorbs damage equal to its Hardness. You and the shield each take any remaining damage, which can break or destroy the shield.',
    source: 'Player Core',
  },
  {
    name: 'Toughness',
    level: 1,
    track: 'general',
    traits: ['general'],
    effect:
      'Your maximum Hit Points increase by an amount equal to your level, and the DC of your recovery checks is reduced to 9 + your dying value.',
    source: 'Player Core',
  },
  {
    name: 'Untrained Improvisation',
    level: 3,
    track: 'general',
    traits: ['general'],
    effect:
      'Checks with skills you are untrained in are no longer made at a flat bonus: you add half your level to them, and from 7th level you add your full level instead.',
    source: 'Player Core',
  },
  {
    name: 'Weapon Proficiency',
    level: 1,
    track: 'general',
    traits: ['general'],
    effect:
      'Become trained in one simple or martial weapon of your choice. If you are already trained in all martial weapons, you can choose an advanced weapon instead.',
    repeatable: true,
    source: 'Player Core',
  },
];

// ══ SKILL FEATS ═══════════════════════════════════════════════════════════════════════════════════
// Taken with a skill feat slot (every even level, plus the one granted by your background). Every skill
// feat carries BOTH the `general` and `skill` traits — the `skill` trait is what makes it spendable on
// a skill slot. Grouped by the skill that gates them; the ones gated on a skill you choose come last.

export const PF2_FEATS_SKILL: PF2FeatFull[] = [
  // ── Acrobatics ────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Cat Fall',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Acrobatics', rank: 'trained' }],
    effect:
      'Treat falls as 10 feet shorter for damage. This improves to 25 feet shorter if you are an expert and 50 feet shorter if you are a master; if you are legendary, you always land upright and take no damage regardless of the distance.',
    source: 'Player Core',
  },
  {
    name: 'Quick Squeeze',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Acrobatics', rank: 'trained' }],
    effect:
      'You Squeeze through tight spaces at 5 feet per round rather than per minute, or 10 feet per round if you are a master in Acrobatics.',
    source: 'Player Core',
  },
  {
    name: 'Steady Balance',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Acrobatics', rank: 'trained' }],
    effect:
      'A success on a check to Balance counts as a critical success, and you are never off-guard while Balancing. You can also use Acrobatics to Balance on uneven ground that would normally not permit it.',
    source: 'Player Core',
  },
  {
    name: 'Nimble Crawl',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Acrobatics', rank: 'expert' }],
    effect: 'You Crawl at half your Speed, or at your full Speed if you are a master in Acrobatics.',
    source: 'Player Core',
  },
  {
    name: 'Kip Up',
    level: 7,
    track: 'skill',
    traits: ['general', 'skill'],
    cost: 'free',
    prereqs: [{ kind: 'skill', skill: 'Acrobatics', rank: 'master' }],
    effect: 'You stand up from prone without spending an action and without triggering reactions.',
    source: 'Player Core',
  },

  // ── Arcana ────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Arcane Sense',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Arcana', rank: 'trained' }],
    effect:
      'You can cast detect magic at will as an innate arcane spell. The rank you cast it at improves as your Arcana proficiency increases.',
    source: 'Player Core',
  },
  {
    name: 'Unified Theory',
    level: 15,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Arcana', rank: 'legendary' }],
    effect:
      'You understand all magic as one discipline: you can use Arcana in place of Nature, Occultism, or Religion for any check those skills would govern regarding magic.',
    source: 'Player Core',
  },

  // ── Athletics ─────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Combat Climber',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Athletics', rank: 'trained' }],
    effect:
      'You are not off-guard while Climbing, you can Climb with a hand occupied, and you can fight while climbing.',
    source: 'Player Core',
  },
  {
    name: 'Hefty Hauler',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Athletics', rank: 'trained' }],
    effect: 'Your encumbered and maximum Bulk limits each increase by 2.',
    source: 'Player Core',
  },
  {
    name: 'Quick Jump',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Athletics', rank: 'trained' }],
    effect:
      'You can High Jump or Long Jump as a single action instead of a two-action activity, and you do not need to Stride 10 feet first.',
    source: 'Player Core',
  },
  {
    name: 'Titan Wrestler',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Athletics', rank: 'trained' }],
    effect:
      'You can Disarm, Grapple, Shove, or Trip creatures up to two sizes larger than you, or up to three sizes larger if you are legendary in Athletics.',
    source: 'Player Core',
  },
  {
    name: 'Underwater Marauder',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Athletics', rank: 'trained' }],
    effect:
      'You are not off-guard while in water, and you do not take the usual penalty for making bludgeoning or slashing attacks underwater.',
    source: 'Player Core',
  },
  {
    name: 'Powerful Leap',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Athletics', rank: 'expert' }],
    effect: 'You jump 5 feet up when you High Jump, and add 5 feet to the distance you cover with a Long Jump.',
    source: 'Player Core',
  },
  {
    name: 'Rapid Mantel',
    level: 7,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Athletics', rank: 'master' }],
    effect:
      'You can pull yourself up onto a ledge you can reach and stand in a single motion, and you can Grab an Edge with any part of your body rather than needing a free hand.',
    source: 'Player Core',
  },
  {
    name: 'Wall Jump',
    level: 7,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Athletics', rank: 'master' }],
    effect:
      'While jumping, you can kick off a wall within reach to keep going, extending your jump. You cannot use the same wall twice in one jump.',
    source: 'Player Core',
  },
  {
    name: 'Cloud Jump',
    level: 15,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Athletics', rank: 'legendary' }],
    effect:
      'Triple the distance you cover with a Long Jump and double the height of your High Jump, and you can add extra actions to a jump to extend it further.',
    source: 'Player Core',
  },

  // ── Crafting ──────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Alchemical Crafting',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Crafting', rank: 'trained' }],
    effect:
      'You can use Crafting to make alchemical items, and you learn the formulas for four common 1st-level alchemical items.',
    source: 'Player Core',
  },
  {
    name: 'Quick Repair',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Crafting', rank: 'trained' }],
    effect:
      'You Repair an item in 1 minute rather than 10. If you are an expert in Crafting this drops to 3 actions, and if you are a master, to a single action.',
    source: 'Player Core',
  },
  {
    name: 'Snare Crafting',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Crafting', rank: 'trained' }],
    effect: 'You can use Crafting to make snares, and you learn the formulas for four common snares.',
    source: 'Player Core',
  },
  {
    name: 'Specialty Crafting',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Crafting', rank: 'trained' }],
    effect:
      'Choose a category of items, such as blacksmithing or alchemy. You gain a +1 circumstance bonus to Crafting checks to make items in that category, increasing to +2 if you are an expert in Crafting.',
    repeatable: true,
    source: 'Player Core',
  },
  {
    name: 'Magical Crafting',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Crafting', rank: 'expert' }],
    effect:
      'You can use Crafting to make magic items, and you learn the formulas for four common magic items of 2nd level or lower.',
    source: 'Player Core',
  },
  {
    name: 'Impeccable Crafting',
    level: 7,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [
      { kind: 'skill', skill: 'Crafting', rank: 'master' },
      { kind: 'feat', name: 'Specialty Crafting' },
    ],
    effect:
      'When you Craft an item in your Specialty Crafting category, a success on the check counts as a critical success.',
    source: 'Player Core',
  },
  {
    name: 'Inventor',
    level: 7,
    track: 'skill',
    traits: ['downtime', 'general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Crafting', rank: 'master' }],
    effect:
      'You can spend downtime inventing a formula for a common item yourself rather than having to buy or find it, paying the usual cost in materials and time.',
    source: 'Player Core',
  },
  {
    name: 'Craft Anything',
    level: 15,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Crafting', rank: 'legendary' }],
    effect:
      'You can ignore most secondary requirements for Crafting an item — special materials, particular tools, or the specific circumstances a formula calls for — substituting whatever you have on hand.',
    source: 'Player Core',
  },

  // ── Deception ─────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Charming Liar',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Deception', rank: 'trained' }],
    effect:
      'When you critically succeed at a Lie, the target\'s attitude toward you improves by one step, to a maximum of friendly.',
    source: 'Player Core',
  },
  {
    name: 'Lengthy Diversion',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Deception', rank: 'trained' }],
    effect:
      'When you critically succeed at Create a Diversion, you remain hidden from the creatures you fooled even after you leave your hiding place, until you do something that would end the effect.',
    source: 'Player Core',
  },
  {
    name: 'Lie to Me',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Deception', rank: 'trained' }],
    effect:
      'You can use Deception in place of Perception to detect a lie during a conversation, spotting inconsistencies in another creature\'s story.',
    source: 'Player Core',
  },
  {
    name: 'Confabulator',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Deception', rank: 'expert' }],
    effect:
      'You reduce the bonus a target gets for having seen your trick before. The reduction improves as your Deception proficiency increases, and at legendary they gain no bonus at all.',
    source: 'Player Core',
  },
  {
    name: 'Slippery Secrets',
    level: 7,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Deception', rank: 'expert' }],
    effect:
      'When a spell or effect would read your mind, detect your lies, or reveal your true nature, you can attempt a Deception check against its DC to prevent it from learning anything.',
    source: 'Player Core',
  },

  // ── Diplomacy ─────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Bargain Hunter',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Diplomacy', rank: 'trained' }],
    effect:
      'You can use Diplomacy to Earn Income by seeking out bargains, and you start play with extra coin from your knack for a good deal.',
    source: 'Player Core',
  },
  {
    name: 'Group Impression',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Diplomacy', rank: 'trained' }],
    effect:
      'When you Make an Impression, you can affect two targets with one check. The number of targets doubles at each higher Diplomacy proficiency rank.',
    source: 'Player Core',
  },
  {
    name: 'Hobnobber',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Diplomacy', rank: 'trained' }],
    effect:
      'You Gather Information in half the usual time. If you are a master in Diplomacy and Gather Information at the normal speed, a success counts as a critical success.',
    source: 'Player Core',
  },
  {
    name: 'Glad-Hand',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Diplomacy', rank: 'expert' }],
    effect:
      'You can Make an Impression on a creature the moment you meet it, without the usual minute of conversation, taking a penalty to the check. You can retry after the conversation has run its usual course.',
    source: 'Player Core',
  },
  {
    name: 'Legendary Negotiation',
    level: 15,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Diplomacy', rank: 'legendary' }],
    effect:
      'You can talk your way out of a fight, forcing enemies to negotiate rather than attack. On a success they hear you out and combat pauses while terms are discussed.',
    source: 'Player Core',
  },

  // ── Intimidation ──────────────────────────────────────────────────────────────────────────────
  {
    name: 'Intimidating Glare',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Intimidation', rank: 'trained' }],
    effect:
      'You can Demoralize with a look alone, so you do not take the penalty for lacking a language in common with the target.',
    source: 'Player Core',
  },
  {
    name: 'Quick Coercion',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Intimidation', rank: 'trained' }],
    effect: 'You can Coerce a target in a single round of threatening rather than the usual minute of conversation.',
    source: 'Player Core',
  },
  {
    name: 'Lasting Coercion',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Intimidation', rank: 'expert' }],
    effect:
      'A target you Coerce stays cowed for longer than usual, extending how long they comply before their attitude reasserts itself.',
    source: 'Player Core',
  },
  {
    name: 'Battle Cry',
    level: 7,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Intimidation', rank: 'master' }],
    trigger: 'You roll initiative.',
    effect:
      'You let out a cry as combat begins and Demoralize one foe you can see. If you are legendary in Intimidation, a critical success on a Demoralize you make this way makes the target flee for 1 round.',
    source: 'Player Core',
  },
  {
    name: 'Terrified Retreat',
    level: 7,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Intimidation', rank: 'master' }],
    effect:
      'When you critically succeed at Demoralize against a creature of a lower level than you, it must spend its actions fleeing from you for 1 round.',
    source: 'Player Core',
  },
  {
    name: 'Scare to Death',
    level: 15,
    track: 'skill',
    traits: ['death', 'emotion', 'fear', 'general', 'incapacitation', 'mental', 'skill'],
    cost: '1',
    prereqs: [{ kind: 'skill', skill: 'Intimidation', rank: 'legendary' }],
    effect:
      'Attempt an Intimidation check against one visible creature\'s Will DC. On a critical success it must attempt a Fortitude save or die of fright, becoming frightened 4 and fleeing even if it survives; on a success it becomes frightened 2 and flees for 1 round; on a failure it is frightened 1.',
    source: 'Player Core',
  },

  // ── Medicine ──────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Battle Medicine',
    level: 1,
    track: 'skill',
    traits: ['general', 'healing', 'manipulate', 'skill'],
    cost: '1',
    prereqs: [{ kind: 'skill', skill: 'Medicine', rank: 'trained' }],
    effect:
      'Treat a wounded creature within reach in the middle of combat, healing it as though you had spent the time to Treat Wounds. That creature is then temporarily immune to your Battle Medicine for a day.',
    source: 'Player Core',
  },
  {
    name: 'Risky Surgery',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Medicine', rank: 'trained' }],
    effect:
      'When you Treat Wounds, you can first deal 1d8 slashing damage to the patient. If you do, a success on the check counts as a critical success.',
    source: 'Player Core',
  },
  {
    name: 'Continual Recovery',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Medicine', rank: 'expert' }],
    effect:
      'Your Treat Wounds makes a patient temporarily immune for only 10 minutes rather than an hour, so you can tend the same patient again far sooner.',
    source: 'Player Core',
  },
  {
    name: 'Robust Recovery',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Medicine', rank: 'expert' }],
    effect:
      'When you Treat a Disease or Treat a Poison, the bonus you grant the patient\'s save increases, and a success on your check counts as a critical success.',
    source: 'Player Core',
  },
  {
    name: 'Ward Medic',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Medicine', rank: 'expert' }],
    effect:
      'You can Treat Disease or Treat Wounds for two patients at once with a single check. This doubles to four patients if you are a master in Medicine and eight if you are legendary.',
    source: 'Player Core',
  },
  {
    name: 'Legendary Medic',
    level: 15,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Medicine', rank: 'legendary' }],
    effect:
      'Once per day per patient, you can spend an hour of treatment to remove a disease or one of several debilitating conditions from them.',
    source: 'Player Core',
  },

  // ── Nature ────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Natural Medicine',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Nature', rank: 'trained' }],
    effect:
      'You can use Nature in place of Medicine to Treat Wounds, gathering herbs to do so. In an environment rich in the right plants you gain a circumstance bonus to the check.',
    source: 'Player Core',
  },
  {
    name: 'Train Animal',
    level: 1,
    track: 'skill',
    traits: ['downtime', 'general', 'manipulate', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Nature', rank: 'trained' }],
    effect:
      'With a week of downtime you can teach an animal a trick it will perform when you Command it, such as coming when called or attacking a target you point out.',
    source: 'Player Core',
  },
  {
    name: 'Bonded Animal',
    level: 2,
    track: 'skill',
    traits: ['downtime', 'general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Nature', rank: 'expert' }],
    effect:
      'After a week spent with an animal, it becomes permanently bonded to you, acting as a minion you can Command rather than a creature you must convince each time.',
    source: 'Player Core',
  },

  // ── Occultism ─────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Oddity Identification',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Occultism', rank: 'trained' }],
    effect:
      'You gain a +2 circumstance bonus to Occultism checks to Identify Magic that has the mental, possession, prediction, or scrying trait.',
    source: 'Player Core',
  },
  {
    name: 'Schooled in Secrets',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Occultism', rank: 'trained' }],
    effect:
      'You can use Occultism to Gather Information about secretive groups and cults, and to Impersonate a member of one convincingly enough to pass as an initiate.',
    source: 'Player Core',
  },
  {
    name: 'Bizarre Magic',
    level: 7,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Occultism', rank: 'master' }],
    effect:
      'Your magic manifests so strangely that the DC to identify your spells and magical effects, or to Recognize a Spell you cast, increases by 5.',
    source: 'Player Core',
  },

  // ── Performance ───────────────────────────────────────────────────────────────────────────────
  {
    name: 'Fascinating Performance',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Performance', rank: 'trained' }],
    effect:
      'When you Perform, compare your check to the Will DC of one observing creature; on a success it becomes fascinated by you for 1 round. The number of creatures you can affect increases with your Performance proficiency.',
    source: 'Player Core',
  },
  {
    name: 'Impressive Performance',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Performance', rank: 'trained' }],
    effect: 'You can use Performance in place of Diplomacy to Make an Impression, winning a crowd over by entertaining it.',
    source: 'Player Core',
  },
  {
    name: 'Virtuosic Performer',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Performance', rank: 'trained' }],
    effect:
      'Choose one type of performance, such as singing or dance. You gain a +1 circumstance bonus to Performance checks of that type, increasing to +2 if you are a master in Performance.',
    repeatable: true,
    source: 'Player Core',
  },

  // ── Religion ──────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Student of the Canon',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Religion', rank: 'trained' }],
    effect:
      'Your critical failures on Religion checks to Recall Knowledge about religious matters count as failures instead, and you can tell a false or heretical claim from an accurate one.',
    source: 'Player Core',
  },
  {
    name: 'Divine Guidance',
    level: 15,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Religion', rank: 'legendary' }],
    effect:
      'Spend 10 minutes poring over scripture while you have a mystery or puzzle in mind; on a successful Religion check you receive a cryptic hint toward solving it.',
    source: 'Player Core',
  },

  // ── Society ───────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Courtly Graces',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Society', rank: 'trained' }],
    effect:
      'You can use Society in place of Deception to Impersonate a noble, or in place of Diplomacy to Make an Impression on someone of high status, by observing the correct etiquette.',
    source: 'Player Core',
  },
  {
    name: 'Multilingual',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Society', rank: 'trained' }],
    effect:
      'You learn two new languages, chosen from the common languages of your region and any language a creature you have access to can teach you. You learn more as your Society proficiency increases.',
    repeatable: true,
    source: 'Player Core',
  },
  {
    name: 'Read Lips',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Society', rank: 'trained' }],
    effect:
      'You can read the lips of creatures you can clearly see who are speaking a language you know. In bad conditions you must succeed at a Society check, and you are fascinated while concentrating on doing so.',
    source: 'Player Core',
  },
  {
    name: 'Sign Language',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Society', rank: 'trained' }],
    effect: 'You learn the sign languages of every language you know, letting you communicate silently with anyone who shares them.',
    source: 'Player Core',
  },
  {
    name: 'Streetwise',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Society', rank: 'trained' }],
    effect:
      'You can use Society in place of Diplomacy to Gather Information, and you can Recall Knowledge about the current events, personalities, and politics of a settlement you have spent time in.',
    source: 'Player Core',
  },
  {
    name: 'Connections',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [
      { kind: 'skill', skill: 'Society', rank: 'expert' },
      { kind: 'feat', name: 'Courtly Graces' },
    ],
    effect:
      'Your web of contacts can get you an introduction to an influential person, or persuade someone to do you a favour that would not unduly inconvenience them.',
    source: 'Player Core',
  },
  {
    name: 'Legendary Codebreaker',
    level: 15,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Society', rank: 'legendary' }],
    effect:
      'You can Decipher Writing at a glance while reading at normal speed, and a success on a check made at the usual slower pace counts as a critical success.',
    source: 'Player Core',
  },
  {
    name: 'Legendary Linguist',
    level: 15,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [
      { kind: 'skill', skill: 'Society', rank: 'legendary' },
      { kind: 'feat', name: 'Multilingual' },
    ],
    effect:
      'You can construct a rough pidgin on the spot, letting you communicate simple concepts with any creature that has a language, even one you have never encountered.',
    source: 'Player Core',
  },

  // ── Stealth ───────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Experienced Smuggler',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Stealth', rank: 'trained' }],
    effect:
      'When you Conceal an Object, treat a roll lower than 10 as a 10. If you are a master in Stealth treat it as a 15, and if you are legendary, the object is simply not found by a casual search.',
    source: 'Player Core',
  },
  {
    name: 'Terrain Stalker',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Stealth', rank: 'trained' }],
    effect:
      'Choose a type of difficult terrain such as rubble, snow, or undergrowth. While in it, you can Sneak without attempting a check as long as you stay more than 10 feet from enemies.',
    repeatable: true,
    source: 'Player Core',
  },
  {
    name: 'Quiet Allies',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Stealth', rank: 'expert' }],
    effect:
      'When you and your allies Avoid Notice as a group, you roll a single Stealth check for the whole party instead of each rolling separately.',
    source: 'Player Core',
  },
  {
    name: 'Foil Senses',
    level: 7,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Stealth', rank: 'master' }],
    effect:
      'Whenever you Avoid Notice, Hide, or Sneak, you are always considered to be taking precautions against creatures with special senses such as scent or tremorsense.',
    source: 'Player Core',
  },
  {
    name: 'Swift Sneak',
    level: 7,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Stealth', rank: 'master' }],
    effect: 'You can move at your full Speed while Sneaking rather than at half Speed.',
    source: 'Player Core',
  },
  {
    name: 'Legendary Sneak',
    level: 15,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [
      { kind: 'skill', skill: 'Stealth', rank: 'legendary' },
      { kind: 'feat', name: 'Swift Sneak' },
    ],
    effect:
      'You can Hide and Sneak even without cover or anything to hide behind, and you are always considered to be Avoiding Notice while exploring.',
    source: 'Player Core',
  },

  // ── Survival ──────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Experienced Tracker',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Survival', rank: 'trained' }],
    effect:
      'You can Track while moving at full Speed, taking a penalty to the check; the penalty goes away if you are a master in Survival. If you are legendary, you no longer need to re-attempt the check each hour.',
    source: 'Player Core',
  },
  {
    name: 'Forager',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Survival', rank: 'trained' }],
    effect:
      'When you Subsist in the wild, you provide for more creatures than yourself, and the number you can support grows as your check result and Survival proficiency improve.',
    source: 'Player Core',
  },
  {
    name: 'Survey Wildlife',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Survival', rank: 'trained' }],
    effect:
      'After studying an area for 10 minutes, you can attempt a Survival check to Recall Knowledge about the creatures that live there, at a penalty for working only from indirect signs.',
    source: 'Player Core',
  },
  {
    name: 'Terrain Expertise',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Survival', rank: 'trained' }],
    effect:
      'Choose a type of terrain. You gain a +1 circumstance bonus to Survival checks made in that terrain.',
    repeatable: true,
    source: 'Player Core',
  },
  {
    name: 'Planar Survival',
    level: 7,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Survival', rank: 'master' }],
    effect: 'You can use Survival to Subsist on planes other than the one you come from, adapting to their alien conditions.',
    source: 'Player Core',
  },

  // ── Thievery ──────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Pickpocket',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Thievery', rank: 'trained' }],
    effect:
      'You can Steal or Palm an Object that is closely guarded without the usual penalty. If you are a master in Thievery, you can spend an extra action to Steal from a creature that is alert and in combat.',
    source: 'Player Core',
  },
  {
    name: 'Subtle Theft',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Thievery', rank: 'trained' }],
    effect:
      'When you successfully Steal something, observers take a penalty to notice, and after you Palm an Object or Steal, creatures do not immediately realize you are the culprit.',
    source: 'Player Core',
  },
  {
    name: 'Wary Disarmament',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'skill', skill: 'Thievery', rank: 'expert' }],
    effect:
      'If you trigger a trap or a device while trying to disarm it, you gain a +2 circumstance bonus to your AC and saving throw against it.',
    source: 'Player Core',
  },
  {
    name: 'Legendary Thief',
    level: 15,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [
      { kind: 'skill', skill: 'Thievery', rank: 'legendary' },
      { kind: 'feat', name: 'Pickpocket' },
    ],
    effect:
      'You can attempt to Steal objects that are actively worn, wielded, or closely watched, taking a steep penalty to the check.',
    source: 'Player Core',
  },

  // ── Gated on a skill you CHOOSE, or on a group of skills ──────────────────────────────────────
  // These are the entries whose prerequisite cannot be structured. See the header: `prereqs` is an AND,
  // so a disjunction ("Arcana, Nature, Occultism, or Religion") would demand all four ranks, and a
  // parametric rank ("the chosen skill") names no skill at all. Both stay in `prereqText`, visible.
  {
    name: 'Additional Lore',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqText: 'Trained in Lore.',
    effect:
      'Become trained in an additional Lore subcategory of your choice. Your proficiency in it rises automatically as you level: expert at 3rd, master at 7th, and legendary at 15th.',
    repeatable: true,
    source: 'Player Core',
  },
  {
    name: 'Assurance',
    level: 1,
    track: 'skill',
    traits: ['fortune', 'general', 'skill'],
    prereqText: 'Trained in the chosen skill.',
    effect:
      'Choose a skill you are trained in. You can forgo rolling a check with that skill to instead get a fixed result equal to 10 plus your proficiency bonus, ignoring all other bonuses, penalties, and modifiers.',
    repeatable: true,
    source: 'Player Core',
  },
  {
    name: 'Automatic Knowledge',
    level: 2,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqs: [{ kind: 'feat', name: 'Assurance' }],
    prereqText: 'Expert in the chosen skill, and Assurance in that same skill.',
    effect:
      'Choose a skill you have Assurance in and are an expert in. Once per round you can Recall Knowledge with that skill as a free action, using Assurance to determine the result.',
    repeatable: true,
    source: 'Player Core',
  },
  {
    name: 'Dubious Knowledge',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqText: 'Trained in at least one skill that can be used to Recall Knowledge.',
    effect:
      'When you fail a check to Recall Knowledge, you learn one true piece of information and one erroneous one, without knowing which is which.',
    source: 'Player Core',
  },
  {
    name: 'Quick Identification',
    level: 1,
    track: 'skill',
    traits: ['general', 'skill'],
    prereqText: 'Trained in Arcana, Nature, Occultism, or Religion.',
    effect:
      'You Identify Magic in 1 minute rather than 10. If you are an expert in the relevant skill this drops to 3 actions, and if you are a master, to a single action.',
    source: 'Player Core',
  },
  {
    name: 'Recognize Spell',
    level: 1,
    track: 'skill',
    traits: ['general', 'secret', 'skill'],
    cost: 'reaction',
    prereqText: 'Trained in Arcana, Nature, Occultism, or Religion.',
    trigger: 'A creature nearby casts a spell you can see or hear, and you do not already know what it is.',
    effect:
      'Attempt a check with the skill matching the spell\'s tradition against a DC set by its rank. On a success you identify the spell; on a critical success you also gain a bonus to your defenses against it. A critical failure leaves you convinced it was some other spell.',
    source: 'Player Core',
  },
  {
    name: 'Trick Magic Item',
    level: 1,
    track: 'skill',
    traits: ['general', 'manipulate', 'skill'],
    prereqText: 'Trained in Arcana, Nature, Occultism, or Religion.',
    effect:
      'Attempt a check with the skill matching a magic item\'s tradition to activate an item you would otherwise be unable to use. On a success you can activate it for this turn; a critical failure means you cannot try again on that item for a day.',
    source: 'Player Core',
  },
];

// ── Lookup ────────────────────────────────────────────────────────────────────────────────────────

/** Both tracks in one list, for a single pass over everything a character can spend a general or
 *  skill slot on. */
export const PF2_FEATS_GENERAL_SKILL: PF2FeatFull[] = [...PF2_FEATS_GENERAL, ...PF2_FEATS_SKILL];

const BY_NAME = new Map<string, PF2FeatFull>(
  PF2_FEATS_GENERAL_SKILL.map((f) => [f.name.trim().toLowerCase(), f]),
);

/** Find a general or skill feat by name, case- and whitespace-insensitively. Returns null rather than
 *  undefined, matching `pf2Spell`/`pf2Class` in content.ts. */
export function pf2GeneralOrSkillFeat(name: string): PF2FeatFull | null {
  return BY_NAME.get(String(name ?? '').trim().toLowerCase()) ?? null;
}
