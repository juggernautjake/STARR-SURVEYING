// lib/dnd/systems/pathfinder2e/data/conditions.ts — the full PF2 CONDITIONS list (Remaster).
//
// WHY THIS FILE EXISTS: conditions are the single most-referenced rules object at the table, and PF2's
// differ from 5e's in kind, not just in name — most carry a VALUE (Frightened 2, Clumsy 1) that scales
// the penalty, and several interact (Wounded raises the Dying you gain; Restrained overrides Grabbed).
// A sheet that stores "frightened: true" cannot compute the right number, so the catalog records
// `valued` explicitly and the sheet reads it rather than guessing from the name.
//
// `ends` is populated ONLY where the condition defines its own decrease/removal rule (Frightened ticks
// down on its own; Blinded does not). An empty `ends` means "the effect that applied it says when it
// ends" — that is a real answer, not a gap.
//
// LICENSING: PF2 mechanics are ORC-licensed, which expressly permits reproducing rules mechanics.
// Reserved Material — Paizo trademarks, deities, characters, locations, lore, art — never appears here.
// Everything below is a paraphrased mechanical summary with the real numbers, never rulebook prose.
//
// GROUND RULE 3 — never invent a rule. Where a specific number or sub-clause was not certain it is
// OMITTED rather than approximated; a plausible-but-wrong number is worse than an absent one.
//
// REMASTER VOCABULARY: Off-Guard (not Flat-Footed), void (not negative), vitality (not positive).
import type { PF2ConditionDef } from '../defs';

export const PF2_CONDITIONS: PF2ConditionDef[] = [
  {
    name: 'Blinded',
    effect:
      'You cannot see. All terrain is difficult terrain to you, you automatically critically fail Perception checks that require sight, and you are immune to visual effects. If vision was your only precise sense you take a −4 status penalty to Perception checks. Blinded overrides Dazzled.',
    source: 'Player Core',
  },
  {
    name: 'Broken',
    effect:
      'An object condition: the item is at or below its Broken Threshold. It cannot be used for its normal function and grants no bonuses — except armor, which keeps its item bonus to AC but adds a status penalty to AC of −1 (light), −2 (medium), or −3 (heavy). Penalties for carrying or wearing it still apply.',
    ends: 'Repairing the item above its Broken Threshold removes the condition.',
    source: 'Player Core',
  },
  {
    name: 'Clumsy',
    valued: true,
    effect:
      'Status penalty equal to the value on Dexterity-based rolls and DCs: AC, Reflex saves, ranged attack rolls, and Acrobatics, Stealth, and Thievery checks.',
    source: 'Player Core',
  },
  {
    name: 'Concealed',
    effect:
      'You are hard to see but still observed. A creature targeting you with an attack, spell, or other effect must succeed at a DC 5 flat check or the attempt fails.',
    source: 'Player Core',
  },
  {
    name: 'Confused',
    effect:
      'You are Off-Guard, treat no one as an ally, and cannot Delay, Ready, or use reactions. You spend your actions attacking a randomly determined creature (or moving randomly if none is reachable).',
    ends: 'Each time you take damage from an attack or spell you can attempt a DC 11 flat check; on a success the condition ends.',
    source: 'Player Core',
  },
  {
    name: 'Controlled',
    effect: 'Another creature decides what you do; it chooses your actions on your turn.',
    source: 'Player Core',
  },
  {
    name: 'Dazzled',
    effect: 'All creatures and objects are Concealed from you.',
    source: 'Player Core',
  },
  {
    name: 'Deafened',
    effect:
      'You automatically critically fail Perception checks that require hearing, and take a −2 status penalty to Perception checks for initiative and to checks involving sound that do not require hearing. You must succeed at a DC 5 flat check to cast a spell with a verbal component or the spell is lost. You are immune to auditory effects.',
    source: 'Player Core',
  },
  {
    name: 'Doomed',
    valued: true,
    effect:
      'The Dying value at which you die is reduced by the Doomed value: you die when Dying reaches 4 minus your Doomed value.',
    ends: 'Decreases by 1 after a full night’s rest.',
    source: 'Player Core',
  },
  {
    name: 'Drained',
    valued: true,
    effect:
      'Status penalty equal to the value on Constitution-based rolls and DCs, notably Fortitude saves. You lose Hit Points equal to your level times the value, and your maximum Hit Points are reduced by that amount.',
    ends: 'Decreases by 1 after a full night’s rest; the lost maximum returns, but the lost Hit Points are not restored automatically.',
    source: 'Player Core',
  },
  {
    name: 'Dying',
    valued: true,
    effect:
      'You are Unconscious and near death, at 0 Hit Points. You die when Dying reaches 4 (less if Doomed). Taking damage while Dying increases the value — by 1 from a normal hit, by 2 from a critical hit or a critical failure on a save. At the start of your turn you attempt a recovery check, a flat check against DC 10 plus your Dying value: a critical success reduces Dying by 2, a success by 1, a failure increases it by 1, and a critical failure by 2.',
    ends: 'Regaining any Hit Points, or being stabilized, removes Dying — and you then gain or increase Wounded by 1.',
    source: 'Player Core',
  },
  {
    name: 'Encumbered',
    effect: 'You are Clumsy 1 and take a −10-foot status penalty to all your Speeds.',
    ends: 'Reducing your carried Bulk to your limit removes the condition.',
    source: 'Player Core',
  },
  {
    name: 'Enfeebled',
    valued: true,
    effect:
      'Status penalty equal to the value on Strength-based rolls and DCs: melee damage rolls and Athletics checks.',
    source: 'Player Core',
  },
  {
    name: 'Fascinated',
    effect:
      'You take a −2 status penalty to Perception and skill checks, and cannot use actions with the concentrate trait unless they relate to the subject of your fascination.',
    ends: 'Ends immediately if the fascinating creature or a creature allied with it uses a hostile action against you or your allies.',
    source: 'Player Core',
  },
  {
    name: 'Fatigued',
    effect:
      'You take a −1 status penalty to AC and saving throws, and cannot choose an exploration activity while travelling.',
    ends: 'A full night’s rest removes the condition.',
    source: 'Player Core',
  },
  {
    name: 'Fleeing',
    effect:
      'You must spend each of your actions trying to escape the source of the condition as expediently as possible, and you cannot Delay or Ready.',
    ends: 'Lasts for the duration set by the effect that applied it.',
    source: 'Player Core',
  },
  {
    name: 'Friendly',
    effect:
      'An NPC attitude, one step better than Indifferent: the creature likes you and is inclined to help, though it will not take serious risks for you.',
    ends: 'Changed by Diplomacy (Make an Impression) or by your behaviour.',
    source: 'GM Core',
  },
  {
    name: 'Frightened',
    valued: true,
    effect: 'Status penalty equal to the value on ALL your checks and DCs.',
    ends: 'Decreases by 1 at the end of each of your turns.',
    source: 'Player Core',
  },
  {
    name: 'Grabbed',
    effect:
      'You are Immobilized and Off-Guard. If you attempt a manipulate action while Grabbed you must succeed at a DC 5 flat check or the action is lost.',
    ends: 'Escape, or the grabbing creature releasing you.',
    source: 'Player Core',
  },
  {
    name: 'Helpful',
    effect:
      'An NPC attitude, the most positive: the creature wants to help you and will actively work on your behalf.',
    ends: 'Changed by Diplomacy (Make an Impression) or by your behaviour.',
    source: 'GM Core',
  },
  {
    name: 'Hidden',
    effect:
      'A creature knows roughly where you are but cannot precisely sense you. It must succeed at a DC 11 flat check to target you, or the attempt fails.',
    ends: 'Becoming Observed (for instance because the creature successfully Seeks you) ends it.',
    source: 'Player Core',
  },
  {
    name: 'Hostile',
    effect: 'An NPC attitude: the creature actively works against you and will typically attack.',
    source: 'GM Core',
  },
  {
    name: 'Immobilized',
    effect:
      'You cannot use any action with the move trait. If you are held in place by another creature or effect, an outside force moving you must succeed at a check against that effect’s DC.',
    source: 'Player Core',
  },
  {
    name: 'Indifferent',
    effect: 'The default NPC attitude: the creature neither helps nor hinders you.',
    source: 'GM Core',
  },
  {
    name: 'Invisible',
    effect:
      'You are Undetected by all creatures. A creature can Seek to find you, which makes you Hidden to it rather than Observed — being invisible means you can never be Observed by ordinary sight while it lasts.',
    source: 'Player Core',
  },
  {
    name: 'Observed',
    effect:
      'The baseline detection state: you are in plain view of a creature with a precise sense, and neither Concealed, Hidden, nor Undetected to it.',
    source: 'Player Core',
  },
  {
    name: 'Off-Guard',
    effect:
      'You take a −2 circumstance penalty to AC. This is the Remaster name for the condition formerly called Flat-Footed; the mechanics are unchanged.',
    source: 'Player Core',
  },
  {
    name: 'Paralyzed',
    effect:
      'Your body is frozen. You are Off-Guard and cannot act except to Recall Knowledge and use actions requiring only your mind. Your senses still work, but only where you can perceive without moving.',
    source: 'Player Core',
  },
  {
    name: 'Persistent Damage',
    effect:
      'Damage of a stated type and amount that recurs at the end of each of your turns rather than all at once. It bypasses immunity to the ongoing nature of the effect only as the source states; resistance and weakness apply each time it is dealt.',
    ends: 'After taking the damage, attempt a DC 15 flat check; on a success the condition ends. Help from yourself or another creature can lower that DC to 10.',
    source: 'Player Core',
  },
  {
    name: 'Petrified',
    effect:
      'You are turned to stone. You cannot act and your senses do not function. You become an object with double your normal Bulk, AC 9, Hardness 8, and the Hit Points you had when you were petrified.',
    source: 'Player Core',
  },
  {
    name: 'Prone',
    effect:
      'You are lying down: you are Off-Guard and take a −2 circumstance penalty to attack rolls. The only movement you can make is to Crawl or to Stand. You can Take Cover while Prone to gain greater cover against ranged attacks.',
    ends: 'The Stand action removes the condition.',
    source: 'Player Core',
  },
  {
    name: 'Quickened',
    effect:
      'You gain one additional action at the start of each of your turns. The effect that grants Quickened almost always restricts what that extra action can be used for; an unused extra action does not carry over.',
    ends: 'Lasts for the duration set by the effect that applied it.',
    source: 'Player Core',
  },
  {
    name: 'Restrained',
    effect:
      'You are tied up or otherwise pinned. You are Off-Guard and Immobilized, and can use no attack or manipulate actions except to attempt to Escape or Force Open your bonds. Restrained overrides Grabbed.',
    ends: 'Escape, or the restraining effect being removed.',
    source: 'Player Core',
  },
  {
    name: 'Sickened',
    valued: true,
    effect:
      'Status penalty equal to the value on ALL your checks and DCs. You cannot willingly ingest anything, including potions and elixirs.',
    ends: 'Spend a single action retching and attempt a Fortitude save against the DC of the sickening effect: a success reduces the value by 1, a critical success by 2.',
    source: 'Player Core',
  },
  {
    name: 'Slowed',
    valued: true,
    effect:
      'At the start of your turn you lose a number of actions equal to the value, before taking any other actions. It does not reduce reactions or free actions.',
    source: 'Player Core',
  },
  {
    name: 'Stunned',
    valued: true,
    effect:
      'You lose actions equal to the value at the start of your turn, and the value decreases by the number of actions lost. Stunned can instead be stated as a duration ("stunned for 1 round"), in which case you lose all your actions for that time. Stunned overrides Slowed: actions lost to Stunned count against those Slowed would have taken.',
    ends: 'The value counts down as you lose actions to it.',
    source: 'Player Core',
  },
  {
    name: 'Stupefied',
    valued: true,
    effect:
      'Status penalty equal to the value on Intelligence-, Wisdom-, and Charisma-based rolls and DCs, including Will saves, spell attack rolls, and spell DCs. When you Cast a Spell you must succeed at a flat check of DC 5 plus the value or the spell is lost.',
    source: 'Player Core',
  },
  {
    name: 'Unconscious',
    effect:
      'You are asleep or knocked out and cannot act. You are Off-Guard and Blinded, and take a −4 status penalty to AC, Perception, and Reflex saves. You fall Prone and drop what you are holding unless the effect says otherwise.',
    ends: 'If you are at 0 Hit Points, regaining Hit Points wakes you. If you are unconscious with Hit Points remaining, taking damage or being shaken awake with an Interact action wakes you.',
    source: 'Player Core',
  },
  {
    name: 'Undetected',
    effect:
      'A creature has no idea where you are. To attack you it must guess your square; it then attempts a DC 11 flat check, and the attack automatically misses if it guessed wrong. You are also Off-Guard to that creature only if some other effect says so — being Undetected instead makes the creature Off-Guard to you.',
    source: 'Player Core',
  },
  {
    name: 'Unfriendly',
    effect:
      'An NPC attitude, one step worse than Indifferent: the creature dislikes you and will not help, though it is not yet actively working against you.',
    source: 'GM Core',
  },
  {
    name: 'Unnoticed',
    effect:
      'A creature is entirely unaware that you are present at all. You are also Undetected by that creature. This matters mainly for effects that care whether anyone knows you exist.',
    source: 'Player Core',
  },
  {
    name: 'Wounded',
    valued: true,
    effect:
      'A record of how close to death you have already come. If you gain the Dying condition while Wounded, your Dying value starts higher by your Wounded value.',
    ends: 'Removed when someone successfully restores Hit Points to you with Treat Wounds, or when you are healed to full Hit Points and rest for 10 minutes.',
    source: 'Player Core',
  },
];

// ── Convenience lookup ──────────────────────────────────────────────────────────────────────────
export const pf2Condition = (name: string) =>
  PF2_CONDITIONS.find(c => c.name.toLowerCase() === name.toLowerCase()) || null;
