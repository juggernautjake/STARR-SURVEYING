// lib/dnd/system-rules.ts — the AUTHORITATIVE, in-code rules catalog per game system
// (Phase V, system-grounding). This is the deterministic guarantee that a character never gets
// the wrong mechanics/stats for its system: these mechanical facts are injected into every AI
// build prompt (via grounding) with ZERO dependency on embeddings or the DB, and the validator
// (system-validate.ts) checks a built sheet against them.
//
// Content is concise MECHANICAL FACTS + numbers (paraphrased, not verbatim rulebook prose), each
// attributed to its source book. Keyed strictly by system so nothing crosses editions.
import { SYSTEM_AMBIGUOUS, systemLabel, type CharacterSystem } from './systems';

export interface AbilityModel {
  /** The ability keys/abbreviations this system uses. */
  abilities: string[];
  /** How ability scores/attributes are generated at creation. */
  generation: string;
  /** The legal range at creation and the in-play cap. */
  range: string;
  /** Hard maximum a normal character can reach (for validation). */
  scoreMax: number;
  /** Minimum legal ability value (for validation). */
  scoreMin: number;
  /** How the modifier is derived. */
  modifier: string;
}

export interface SystemRules {
  key: string;
  label: string;
  /** Primary rulebook the facts are drawn from. */
  source: string;
  ability: AbilityModel;
  /** Proficiency / competence model (bonus vs ranks) + how it scales. */
  proficiency: string;
  /** Proficiency bonus by level as a lookup, when the system uses a flat bonus (else null). */
  profBonusByLevel: number[] | null;
  levelMin: number;
  levelMax: number;
  advancement: string;
  saves: string;
  coreResolution: string;
  actionEconomy: string;
  rest: string;
  /** ASI / feat / boost cadence — where "stats change" happens (a common source of errors). */
  progressionCadence: string;
  /** Extra must-know facts / edition gotchas that keep mechanics correct. */
  keyFacts: string[];
}

const DND_ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
// 5e proficiency bonus by character level (index 1..20); index 0 unused.
const PB_5E = [0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];

export const SYSTEM_RULES: Record<string, SystemRules> = {
  'dnd5e-2014': {
    key: 'dnd5e-2014',
    label: 'D&D 5e (2014)',
    source: "Player's Handbook (2014)",
    ability: {
      abilities: DND_ABILITIES,
      generation: 'Point Buy (27 points, each score 8–15 before bonuses), the Standard Array [15,14,13,12,10,8], or roll 4d6 drop lowest. Racial ability bonuses are then added.',
      range: 'Final scores start no higher than 17 (15 + a +2 racial). In play the cap is 20 without magic (a few effects raise it to 22–24).',
      scoreMax: 20,
      scoreMin: 1,
      modifier: 'floor((score − 10) / 2).',
    },
    proficiency: 'A single flat Proficiency Bonus tied to character level, added to attacks, saves, and skills you are proficient in. It is never multiplied except by Expertise (which doubles it).',
    profBonusByLevel: PB_5E,
    levelMin: 1,
    levelMax: 20,
    advancement: 'Levels 1–20 via XP or milestone.',
    saves: 'Six saving throws (one per ability). A class grants proficiency in exactly two. Spell save DC = 8 + Proficiency Bonus + spellcasting ability modifier.',
    coreResolution: 'Roll d20 + modifiers vs a DC (checks/saves) or AC (attacks). Advantage/Disadvantage = roll 2d20 and keep the higher/lower; they do not stack and cancel each other out.',
    actionEconomy: 'Each turn: one Action, one Bonus Action (only if something grants it), movement up to your speed, and one Reaction per round. One free (object) interaction.',
    rest: 'Short rest = 1 hour (spend Hit Dice to heal, recover some features). Long rest = 8 hours (full HP, regain up to half your total Hit Dice, reset long-rest features and all spell slots).',
    progressionCadence: 'Ability Score Improvements (or a feat) at levels 4, 8, 12, 16, 19; Fighter also at 6 & 14, Rogue also at 10. An ASI is +2 to one ability or +1 to two (never above 20). Feats are OPTIONAL rules in 2014.',
    keyFacts: [
      'Exhaustion is a 6-level TIERED table (level 1 = disadvantage on ability checks, up to level 6 = death). This is DIFFERENT from 2024.',
      'Ability bonuses come from your RACE (2014), not your background.',
      'Concentration: many spells require it; taking damage forces a CON save (DC 10 or half the damage, whichever is higher).',
      'Death saves: at 0 HP roll a d20 each turn; 10+ succeeds, three successes stabilize, three failures die, nat 20 = regain 1 HP.',
      'Weapon Mastery does NOT exist in 2014 (that is a 2024 feature).',
    ],
  },

  'dnd5e-2024': {
    key: 'dnd5e-2024',
    label: 'D&D 5e (2024)',
    source: "Player's Handbook (2024)",
    ability: {
      abilities: DND_ABILITIES,
      generation: 'Point Buy (27 points, each 8–15) or the Standard Array [15,14,13,12,10,8]. Ability score increases come from your BACKGROUND (either +2/+1 or +1/+1/+1), NOT from your species.',
      range: 'Final scores start no higher than 17. In-play cap is 20 without magic.',
      scoreMax: 20,
      scoreMin: 1,
      modifier: 'floor((score − 10) / 2).',
    },
    proficiency: 'A single flat Proficiency Bonus tied to level (same progression as 2014), added to proficient rolls; doubled by Expertise.',
    profBonusByLevel: PB_5E,
    levelMin: 1,
    levelMax: 20,
    advancement: 'Levels 1–20 via XP or milestone.',
    saves: 'Six saving throws; a class grants proficiency in two. Spell save DC = 8 + Proficiency Bonus + spellcasting ability modifier.',
    coreResolution: 'Roll d20 + modifiers vs DC/AC. Advantage/Disadvantage keep higher/lower 2d20 (no stacking). "Heroic Inspiration" lets you reroll a d20.',
    actionEconomy: 'One Action, one Bonus Action (when granted), movement, one Reaction per round. Martial characters use Weapon Mastery properties (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex) on weapons they have mastery with.',
    rest: 'Short rest = 1 hour. Long rest = 8 hours (full HP, regain up to half your Hit Dice, reset features and slots). Exhaustion is reduced by 1 per long rest.',
    progressionCadence: 'Ability Score Improvements (or a feat) at levels 4, 8, 12, 16, 19 (class-specific extras as in 2014). Every character also gains an Origin Feat from their background at level 1. Feats now have levels and prerequisites; feats are a CORE rule in 2024.',
    keyFacts: [
      'Exhaustion is a SINGLE stacking condition: each level gives −2 to all d20 tests and −5 ft speed; you die at 6. This is DIFFERENT from 2014’s tiered table.',
      'Ability increases come from your BACKGROUND, not your species (opposite of 2014).',
      'Backgrounds grant an Origin Feat + ability increases + skill/tool proficiencies.',
      'Weapon Mastery is a 2024 martial feature (does not exist in 2014).',
      'Species (2024 term for race) give traits but NO ability score bonuses.',
    ],
  },

  pathfinder2e: {
    key: 'pathfinder2e',
    label: 'Pathfinder 2e',
    source: 'Player Core (Remaster)',
    ability: {
      abilities: DND_ABILITIES, // Str, Dex, Con, Int, Wis, Cha (same six; PF2 uses attribute MODIFIERS directly)
      generation: 'Attribute modifiers built from BOOSTS and FLAWS: start every attribute at +0, then apply an ancestry flaw/boosts, a background (2 boosts), a class key-attribute boost, and 4 free boosts. Each boost is +1 (but a partial boost above +4 counts as +0). Two of the four free boosts must go to different attributes.',
      range: 'At level 1 the maximum attribute modifier is +4 (e.g. from an 18 in legacy terms). Attribute boosts at levels 5, 10, 15, 20 raise four attributes each (a boost at +4 or higher gives +1 up to a cap of +7 by level 20).',
      scoreMax: 7,  // interpreted as the attribute MODIFIER cap (Remaster), not a 3–18 score
      scoreMin: -5,
      modifier: 'Remaster uses the attribute modifier directly (no 3–18 score). (Legacy conversion: score = 10 + 2 × modifier.)',
    },
    proficiency: 'Proficiency RANKS, not a flat bonus: Untrained (+0, no level added), Trained (+2 + level), Expert (+4 + level), Master (+6 + level), Legendary (+8 + level). Your character LEVEL is added to every proficient roll — this is core to PF2 math.',
    profBonusByLevel: null,
    levelMin: 1,
    levelMax: 20,
    advancement: 'Levels 1–20; 1000 XP per level (or milestone).',
    saves: 'THREE saving throws — Fortitude, Reflex, Will — each a proficiency rank + level + governing attribute (Con/Dex/Wis). There is no per-ability save like 5e.',
    coreResolution: 'Roll d20 + modifiers vs a DC, using DEGREES OF SUCCESS: beat the DC by 10 = critical success; meet/beat = success; miss = failure; miss by 10 = critical failure. A natural 20 improves the degree by one step, a natural 1 worsens it by one.',
    actionEconomy: 'THREE actions per turn plus one reaction (and free actions). Most activities cost 1–3 actions; spells commonly cost 2 actions. There is no separate "bonus action".',
    rest: 'Daily preparations + an 8-hour rest restore HP and Focus Points; longer recovery uses Treat Wounds and downtime.',
    progressionCadence: 'Feats come on a strict schedule: ancestry feats at levels 1,5,9,13,17; class feats at even levels; skill feats at even levels; general feats at 3,7,11,15,19. Skill increases at 3,5,7…; attribute boosts (four) at 5,10,15,20. No 5e-style "ASI or feat" choice.',
    keyFacts: [
      'PF2 adds your LEVEL to every proficient check — never model it like 5e’s flat proficiency bonus.',
      'Conditions are numeric and standardized (e.g. Frightened 2, Clumsy 1). Off-Guard (−2 circumstance penalty to AC) is the Remaster term that replaced Flat-Footed.',
      'The three saves are Fortitude/Reflex/Will — do NOT use six per-ability saves.',
      'Spellcasting uses spell ranks 1–10 (not "levels"), spell slots per rank, and often 2-action casts.',
      'Do NOT import 5e feats, spells, or the six-saves model — PF2 mechanics are structurally different.',
    ],
  },
};

/** The rules for a system key, or null for the ambiguous / unknown case. */
export function rulesForSystem(system: CharacterSystem): SystemRules | null {
  return SYSTEM_RULES[system] ?? null;
}

/**
 * The authoritative rules block injected into every AI build/edit/transpose prompt. For a known
 * system it lays out the exact mechanical facts + numbers the AI must use; for the ambiguous case
 * it forbids any system-specific numbers. This is the deterministic anti-wrong-mechanics guarantee.
 */
export function systemRulesBlock(system: CharacterSystem): string {
  if (system === SYSTEM_AMBIGUOUS) {
    return (
      'SYSTEM-AMBIGUOUS BUILD — AUTHORITATIVE RULES:\n' +
      'Do NOT assume any specific game system. Use only generic, edition-neutral concepts (abilities, a level, ' +
      'hit points, a to-hit vs a defense, simple skills). NEVER import a number, feat, spell, proficiency ' +
      'formula, save model, or action economy that is specific to D&D 5e (2014 or 2024) or Pathfinder 2e. If a ' +
      'value depends on a system, leave it out and flag it for the user to resolve.'
    );
  }
  const r = rulesForSystem(system);
  if (!r) return '';
  const lines = [
    `AUTHORITATIVE RULES FOR ${r.label} — source: ${r.source}. These are the ONLY mechanics you may use; do not borrow from any other system, and do not invent numbers.`,
    `• Abilities: ${r.ability.abilities.join(', ')}.`,
    `• Ability generation: ${r.ability.generation}`,
    `• Ability range/cap: ${r.ability.range} Modifier: ${r.ability.modifier}`,
    `• Proficiency: ${r.proficiency}`,
    `• Levels: ${r.levelMin}–${r.levelMax}. ${r.advancement}`,
    `• Saving throws: ${r.saves}`,
    `• Core resolution: ${r.coreResolution}`,
    `• Action economy: ${r.actionEconomy}`,
    `• Rest & recovery: ${r.rest}`,
    `• Stat/feat progression: ${r.progressionCadence}`,
    `• Must-know facts:`,
    ...r.keyFacts.map((f) => `   - ${f}`),
  ];
  return lines.join('\n');
}

/** The proficiency bonus a character SHOULD have at a level for flat-bonus systems (else null). */
export function expectedProfBonus(system: CharacterSystem, level: number): number | null {
  const r = rulesForSystem(system);
  if (!r || !r.profBonusByLevel) return null;
  const lvl = Math.max(r.levelMin, Math.min(r.levelMax, Math.round(level)));
  return r.profBonusByLevel[lvl] ?? null;
}

/** A short human label used in UIs/messages. */
export function systemRulesSummary(system: CharacterSystem): string {
  if (system === SYSTEM_AMBIGUOUS) return 'System-ambiguous (edition-neutral only)';
  const r = rulesForSystem(system);
  return r ? `${r.label} — ${r.source}` : systemLabel(system);
}
