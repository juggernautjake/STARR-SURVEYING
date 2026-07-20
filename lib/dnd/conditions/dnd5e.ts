// lib/dnd/conditions/dnd5e.ts — the mechanical model of the 5e conditions, as data.
//
// The sheet already TRACKS which conditions are active (`combat.conditions`) and DISPLAYS/grounds their
// rules text. What it doesn't do yet is AUTO-FOLD their numeric effects into rolls the way exhaustion does.
// This registry is the pure foundation for that: per condition, the structured `effects` that CAN fold
// through the ledger (advantage/disadvantage on the character's OWN rolls, which flow via `ledger.rollFlags`),
// plus an honest `note` for the parts the current effect vocabulary can't express (speed 0, auto-fail saves,
// "attackers have advantage", action restrictions) — so the sheet can show those for the player/DM to apply.
//
// NOT yet wired into `buildLedger`: wiring conditions as an effect source is a deliberate behavior change
// (auto-fold vs the current show-for-the-player pattern) that's an owner decision. This is data only — no
// runtime behavior changes by adding it. Effects are 2024-RAW where editions differ; the disadvantage-on-
// attacks/checks/saves parts modeled here are identical in 2014 and 2024.
import type { Effect } from '@/app/dnd/_sheet/engine/effects';

export interface ConditionMechanics {
  /** Matches the `combat.conditions` label (title-case), e.g. "Poisoned". */
  name: string;
  /** Structured effects that fold cleanly through the ledger's roll flags (disadvantage/advantage on the
   *  character's own attack rolls / skill checks / saves). Empty when nothing about the condition is a
   *  self-roll modifier the current vocabulary can express. `source` is stamped so a ★ can attribute it. */
  effects: Effect[];
  /** The RAW parts NOT captured by `effects` — auto-fail saves, "attacks against you have advantage", speed 0,
   *  action/reaction restrictions — shown so nothing silently disappears. Empty string when fully modeled. */
  note: string;
  /** A concrete worked example of the condition resolving at the table (owner 2026-07-19). The `note`
   *  states the rule; this shows it happening with real numbers, which is what players actually ask for
   *  — "I'm Frightened, can I still shoot him?" is answered by an example far faster than by a rule. */
  example?: string;
}

const dis = (target: string, name: string): Effect => ({ target, operation: 'disadvantage', source: name } as Effect);
const adv = (target: string, name: string): Effect => ({ target, operation: 'advantage', source: name } as Effect);

// One entry per 5e condition tracked by the sheet (CONDITIONS_5E), Exhaustion excepted (its own tiered model).
export const CONDITION_MECHANICS_5E: ConditionMechanics[] = [
  { name: 'Blinded', effects: [dis('attack_roll', 'Blinded')],
    note: 'Attack rolls against you have advantage. You automatically fail any ability check that requires sight.',
    example: "A Rogue blinded by Darkness attacks the orc in front of her: her attack has disadvantage, and the orc's attacks against her have advantage. She auto-fails a Perception check to spot a lever across the room, because that check needs sight — but she could still hear it being pulled." },
  { name: 'Charmed', effects: [],
    note: "You can't attack the charmer or target them with harmful effects; the charmer has advantage on social checks with you.",
    example: "A bandit charmed by Charm Person won't swing at you and can't target you with a harmful spell, but he'll happily attack the Fighter beside you. Your Persuasion check to talk him into opening the gate has advantage. When the hour is up, he knows exactly what you did." },
  { name: 'Deafened', effects: [],
    note: 'You automatically fail any ability check that requires hearing.',
    example: "A Wizard deafened by a thunderclap auto-fails a check to hear footsteps in the corridor. He can still cast spells with verbal components — being deafened stops you hearing, not speaking." },
  { name: 'Frightened', effects: [dis('attack_roll', 'Frightened'), dis('all_skills', 'Frightened')],
    note: 'Only while the source of fear is in line of sight; you also can’t willingly move closer to it. (Raw ability checks with no skill aren’t auto-folded — apply the same disadvantage by hand.)',
    example: "A Ranger frightened by a dragon can see it, so her attacks and ability checks have disadvantage. She can move sideways or back, but not one step closer. If she ducks behind a pillar and breaks line of sight, the disadvantage lifts while the condition lasts." },
  { name: 'Grappled', effects: [],
    note: 'Speed 0 (can’t benefit from bonuses to speed); you have disadvantage on attack rolls against any target other than the grappler. Ends if the grappler is Incapacitated or you’re moved away.',
    example: "A Fighter grappled by an ogre has speed 0 — Dash won't help. He can still attack the ogre normally, but attacks against anyone else have disadvantage. If an ally shoves the ogre 10 feet away, the grapple ends." },
  { name: 'Incapacitated', effects: [],
    note: 'You can’t take actions, bonus actions, or reactions; concentration breaks; you can’t speak.',
    example: "A Cleric who becomes Incapacitated loses her action, bonus action, and reaction, and any spell she was concentrating on ends immediately — so the Bless running on the party drops." },
  { name: 'Invisible', effects: [adv('attack_roll', 'Invisible')],
    note: 'Attack rolls against you have disadvantage. You’re heavily obscured for being seen; you still make noise/tracks.',
    example: "An invisible Rogue attacks with advantage, and the guard swinging back has disadvantage. She isn't silent, though: the guard can still hear her, and a creature with Blindsight ignores the whole thing." },
  { name: 'Paralyzed', effects: [dis('str_saves', 'Paralyzed'), dis('dex_saves', 'Paralyzed')],
    note: 'Incapacitated, can’t move or speak. You AUTOMATICALLY FAIL STR and DEX saves (modeled here as disadvantage — treat as auto-fail). Attacks against you have advantage and auto-crit within 5 ft.',
    example: "A paralysed Fighter is also Incapacitated — no actions, no reactions, no concentration. He auto-fails Strength and Dexterity saves outright, so a Fireball's Dex save is simply a failure. Worse, any attack hitting him from within 5 feet is an automatic critical." },
  { name: 'Petrified', effects: [dis('str_saves', 'Petrified'), dis('dex_saves', 'Petrified')],
    note: 'Incapacitated; transformed to solid substance; resistance to ALL damage; immune to poison & disease. You auto-fail STR and DEX saves (shown as disadvantage). Attacks against you have advantage.',
    example: "A petrified Wizard is stone: Incapacitated, unaware, auto-failing Strength and Dexterity saves. She also has resistance to all damage and immunity to poison and disease, so the statue is far harder to destroy than the person was." },
  { name: 'Poisoned', effects: [dis('attack_roll', 'Poisoned'), dis('all_skills', 'Poisoned')],
    note: 'Disadvantage on attack rolls and ability checks. (Raw ability checks with no skill aren’t auto-folded — apply the same disadvantage by hand.)',
    example: "A Barbarian poisoned by spider venom has disadvantage on attack rolls and on every ability check — including the Athletics check to force a door. His saving throws are unaffected." },
  { name: 'Prone', effects: [dis('attack_roll', 'Prone')],
    note: 'Melee attack rolls against you have advantage; ranged attacks against you have disadvantage. Standing up costs half your movement.',
    example: "A knocked-down Fighter is attacked in melee with advantage, but the archer 60 feet away has disadvantage against him. Standing costs half his movement — 15 feet of a 30-foot speed — and his own melee attacks have disadvantage while he stays down." },
  { name: 'Restrained', effects: [dis('attack_roll', 'Restrained'), dis('dex_saves', 'Restrained')],
    note: 'Speed 0 (can’t benefit from speed bonuses); attack rolls against you have advantage.',
    example: "A Druid caught in a net has speed 0 and disadvantage on attacks, attackers have advantage against her, and her Dexterity saves have disadvantage — so a nearby Fireball is far likelier to land full force." },
  { name: 'Stunned', effects: [dis('str_saves', 'Stunned'), dis('dex_saves', 'Stunned')],
    note: 'Incapacitated, can’t move, can speak only falteringly. You auto-fail STR and DEX saves (shown as disadvantage). Attacks against you have advantage.',
    example: "A stunned enemy is Incapacitated, can't move, and auto-fails Strength and Dexterity saves, while every attack against it has advantage. This is why stunning swings a fight so hard: the target loses its turn AND becomes easy to hit." },
  { name: 'Unconscious', effects: [dis('str_saves', 'Unconscious'), dis('dex_saves', 'Unconscious')],
    note: 'Incapacitated, can’t move or speak, unaware; you drop what you’re holding and fall Prone. Auto-fail STR and DEX saves (shown as disadvantage). Attacks have advantage and auto-crit within 5 ft.',
    example: "A Wizard dropped to 0 hit points falls unconscious and Prone, dropping his staff. He auto-fails Strength and Dexterity saves, attacks against him have advantage, and any hit from within 5 feet is an automatic critical — costing him two death save failures at once." },
];

const BY_NAME = new Map(CONDITION_MECHANICS_5E.map((c) => [c.name.toLowerCase(), c]));

/** The mechanical model for a 5e condition by name (case-insensitive), or undefined for an unknown/custom one. */
export function conditionMechanics5e(name: string | null | undefined): ConditionMechanics | undefined {
  if (!name) return undefined;
  return BY_NAME.get(name.trim().toLowerCase());
}

/** The combined structured effects for a set of active conditions — the input a future `buildLedger` wiring
 *  would add as an effect source. Pure; unknown conditions contribute nothing (never invented). */
export function conditionEffects5e(active: readonly string[] | undefined): Effect[] {
  return (active ?? []).flatMap((name) => conditionMechanics5e(name)?.effects ?? []);
}
