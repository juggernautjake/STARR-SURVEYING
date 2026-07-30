// lib/dnd/systems/intuitive-games/creature-mechanics.ts — make a transposed creature read as IG (B6-4).
//
// Owner: *"Make sure that creature's stat blocks are really fleshed out and working with the IG stances and
// stuff. Make that make as much sense as you can for IG."*
//
// ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────────────────────────────
//
// Intuitive Games has no published bestiary, so its 300 creatures are transposed from D&D 5e. That gets the
// numbers across honestly (B4-2) and leaves the creature speaking the wrong language: its actions say
// "restrained", "frightened" and "poisoned", which are 5e's condition names, and it has no stance at all —
// while stances are the mechanic an IG player interacts with every single turn.
//
// B1-2 already committed to the opposite: *"a PF2 creature shows its own vocabulary, not a 5e stat block
// wearing PF2 names."* This is that promise, applied to IG.
//
// ── G5 STILL GOVERNS, AND THE TWO HALVES ARE VERY DIFFERENT ──────────────────────────────────────────
//
// **Conditions are a real mapping.** IG publishes 18 conditions and most of 5e's have an exact counterpart
// with the same mechanical intent — `restrained` and `Entangled` both mean "cannot move, disadvantage on
// physical checks". Renaming those is a TRANSLATION, and the ones with no counterpart (`charmed`,
// `petrified`, `stunned`, `exhaustion`) are named as untranslatable rather than approximated. Turning
// `petrified` into "Paralyzed" would lose the part where the creature is stone.
//
// **A stance is NOT a mapping, and this is the line the slice is really about.** Nothing in a 5e stat block
// says which of IG's ten stances a creature adopts, and no derivation could — a stance is a tactical choice
// a combatant makes on its turn, not a property of the creature. So this does not assign one.
//
// What it does instead is READ THE EVIDENCE ALREADY IN THE STAT BLOCK and say which stance that behaviour
// corresponds to: a creature with Pack Tactics fights by flanking, and Swarming is IG's flanking stance.
// That is a suggestion to the DM about a creature they are about to run, labelled as a house reading in the
// same voice `deriveVariant` uses — *"Starr Tabletop house reading — not an official rule"* — and it
// returns NOTHING when the stat block offers no evidence.
//
// **Most creatures get no stance, and that is the correct outcome.** 200 invented stances would be worse
// than none: a DM who reads "Offensive" on a creature that has no reason to be in it has been told
// something false about a mechanic they will act on this turn.
import type { Statblock, StatblockEntry } from '@/lib/dnd/homebrew/statblock';
import { IG_STANCE_DEFS, IG_DEFENSIVE_POWERS, IG_CONDITIONS } from './content';

/**
 * 5e condition → the IG condition that means the same thing.
 *
 * Only entries whose MECHANICAL INTENT matches. The test is not "is there a similar word" but "would a DM
 * applying the IG condition produce the same effect at the table".
 */
export const IG_CONDITION_MAP: Record<string, string> = {
  blinded: 'Blind',
  deafened: 'Deaf',
  frightened: 'Shaken',        // both: a penalty to attacks, saves and checks while afraid
  grappled: 'Grappled',
  invisible: 'Invisible',
  paralyzed: 'Paralyzed',
  poisoned: 'Sickened',        // both: −2 to attacks, saves and checks; IG adds a Fortitude consequence
  prone: 'Prone',
  restrained: 'Entangled',     // both: cannot move, disadvantage on physical checks
  unconscious: 'Asleep',       // IG's Asleep IS "no actions, treated as paralyzed, wakes on damage"
};

/**
 * 5e conditions IG does not have, with the reason each is left alone rather than approximated.
 *
 * Naming them is the point (G6). A condition silently dropped is a rule a DM does not know is missing; a
 * condition silently renamed to its nearest neighbour is worse, because they will apply the wrong one.
 */
export const IG_CONDITION_GAPS: Record<string, string> = {
  charmed: 'IG has no charm condition — Fascinated is close but stops the creature acting entirely rather than changing whose side it is on.',
  petrified: 'IG has no petrification — Paralyzed loses the part where the creature is stone and resistant to damage.',
  stunned: 'IG has no stun. Flat-Footed and Paralyzed sit either side of it.',
  incapacitated: 'IG has no general incapacitation; the specific conditions carry it instead.',
  exhaustion: 'IG does not use an exhaustion track.',
  'turned': 'Turning is a 5e cleric mechanic with no IG counterpart.',
};

const IG_CONDITION_NAMES = new Set(IG_CONDITIONS.map((c) => c.name.toLowerCase()));

export interface ConditionReading {
  /** The 5e word found in the creature's text. */
  from: string;
  /** The IG condition it becomes, or null when IG has none. */
  to: string | null;
  /** Why, when there is no counterpart. */
  note?: string;
}

/**
 * Which conditions a creature's own text mentions, and what each becomes in IG.
 *
 * Reads the PROSE rather than a structured field, because that is where a 5e creature states its
 * conditions — "the target must succeed on a DC 13 Constitution saving throw or be poisoned" — and the
 * model has no per-entry condition list to consult.
 */
export function readConditions(statblock: Statblock): ConditionReading[] {
  const text = [
    statblock.conditionImmunities ?? '',
    ...(statblock.entries ?? []).map((e) => `${e.name} ${e.body}`),
  ].join(' ').toLowerCase();

  const out: ConditionReading[] = [];
  const seen = new Set<string>();
  for (const word of [...Object.keys(IG_CONDITION_MAP), ...Object.keys(IG_CONDITION_GAPS)]) {
    // Word-bounded: "restrained" must not fire on "unrestrained", and "prone" must not fire on "pronounce".
    if (!new RegExp(`\\b${word}\\b`).test(text) || seen.has(word)) continue;
    seen.add(word);
    const to = IG_CONDITION_MAP[word] ?? null;
    out.push(to ? { from: word, to } : { from: word, to: null, note: IG_CONDITION_GAPS[word] });
  }
  // Stable order — alphabetical by the source word — so re-running the generator produces the same text
  // and an upsert is a no-op rather than a diff.
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

export interface StanceReading {
  stance: string;
  /** The words in the stat block that led here. Shown to the DM, because a suggestion they cannot check
   *  is one they have to either trust or ignore. */
  evidence: string;
}

/**
 * Evidence in a stat block, and the stance that behaviour corresponds to.
 *
 * ORDERED, most specific first: a creature with Sneak Attack AND Pack Tactics is a flanker whose payoff is
 * the sneak damage, so Precise beats Swarming. Only the first match is returned — a creature holds one
 * stance at a time, which is IG's own rule, so offering three would misrepresent the mechanic while
 * appearing more helpful.
 */
const STANCE_EVIDENCE: Array<{ stance: string; test: RegExp; evidence: string }> = [
  { stance: 'Precise', test: /\bsneak attack\b/i, evidence: 'has Sneak Attack, which Precise is the stance for' },
  { stance: 'Swarming', test: /\bpack tactics\b/i, evidence: 'has Pack Tactics — it fights by flanking, which is what Swarming rewards' },
  { stance: 'Shifting', test: /\b(incorporeal|ethereal jaunt|blink)\b/i, evidence: 'shifts in and out of reach, so it cannot be flanked' },
  { stance: 'Mobile', test: /\b(does ?n[o']t provoke|without provoking|nimble escape|disengage)\b/i, evidence: 'moves without provoking reactions, which is Mobile' },
  { stance: 'Supportive', test: /\b(pack leader|leadership|commands? (?:an )?all(?:y|ies))\b/i, evidence: 'directs its allies, which Supportive turns into flanking' },
  { stance: 'Menacing', test: /\b(frightful presence|terrifying|intimidat)/i, evidence: 'leads with fear, and Menacing is the combat-skill stance' },
  // NOT a bare `shield`. Measured against the real catalogue, that matched SPELL NAMES — `fire shield`,
  // `shield of faith`, and `shield` itself sitting in a prepared-slot list — so an Archmage was read as
  // fighting defensively because it had a spell prepared. Six of eight sampled matches were wrong, and the
  // two that were right were both Parry. `Shield Bash` is an attack, which is the opposite of the reading.
  { stance: 'Defensive', test: /\b(damage reduction|parry|parries)\b/i, evidence: 'fights behind its defences' },
];

/**
 * The stance a creature's own behaviour points at, or null.
 *
 * NULL IS THE COMMON ANSWER and is not a failure. Nothing in a 5e stat block states an IG stance, so
 * anything returned here is a reading of evidence rather than a conversion — which is why it carries its
 * evidence with it and why the caller labels it a house reading.
 */
export function suggestStance(statblock: Statblock): StanceReading | null {
  const text = (statblock.entries ?? []).map((e) => `${e.name} ${e.body}`).join(' ');
  if (!text.trim()) return null;
  for (const rule of STANCE_EVIDENCE) {
    if (rule.test.test(text)) return { stance: rule.stance, evidence: rule.evidence };
  }
  return null;
}

/** The defensive power a creature's text already describes, or null. Same rules as `suggestStance`. */
export function suggestDefensivePower(statblock: Statblock): StanceReading | null {
  const text = [statblock.resistances ?? '', ...(statblock.entries ?? []).map((e) => `${e.name} ${e.body}`)].join(' ');
  if (/\b(parry|riposte|counterattack)\b/i.test(text)) {
    return { stance: 'Counterattack', evidence: 'strikes back when attacked' };
  }
  if (/\b(damage reduction|nonmagical attacks|stone(?:'s)? endurance)\b/i.test(text)) {
    return { stance: 'Armor Skin', evidence: 'reduces incoming damage rather than avoiding it' };
  }
  if (/\b(uncanny dodge|evasion|sidestep)\b/i.test(text)) {
    return { stance: 'Sidestep', evidence: 'gets out of the way on a successful save' };
  }
  return null;
}

const stanceText = (name: string) => {
  const s = IG_STANCE_DEFS.find((d) => d.name === name);
  return s ? `Basic (below Lv 5): ${s.basic} Advanced (Lv 5+): ${s.advanced}` : '';
};
const defensiveText = (name: string) => IG_DEFENSIVE_POWERS.find((d) => d.name === name)?.effect ?? '';

/** The label every derived line carries, in the same voice `deriveVariant` uses for its house formula. */
export const IG_HOUSE_READING = 'Starr Tabletop house reading — not an official rule.';

/**
 * The IG-flavoured entries to append to a transposed creature's stat block.
 *
 * Returned as ordinary `StatblockEntry` values of kind `trait`, so they render through the existing stat
 * block with no new component and no new field — which is also what makes them survive a fork into the
 * Studio, where a DM can edit or delete them like any other trait.
 */
export function igCreatureEntries(statblock: Statblock): StatblockEntry[] {
  const out: StatblockEntry[] = [];

  const stance = suggestStance(statblock);
  if (stance) {
    out.push({
      kind: 'trait',
      name: `Stance: ${stance.stance}`,
      body: `${stanceText(stance.stance)} Suggested because this creature ${stance.evidence}. ${IG_HOUSE_READING} `
        + 'A stance is a choice made on a creature\'s turn, so change it freely — only one can be active at a time.',
    });
  }

  const defensive = suggestDefensivePower(statblock);
  if (defensive) {
    out.push({
      kind: 'trait',
      name: `Defensive Power: ${defensive.stance}`,
      body: `${defensiveText(defensive.stance)} Suggested because this creature ${defensive.evidence}. ${IG_HOUSE_READING}`,
    });
  }

  const conditions = readConditions(statblock);
  if (conditions.length) {
    const translated = conditions.filter((c) => c.to);
    const gaps = conditions.filter((c) => !c.to);
    const parts: string[] = [];
    if (translated.length) {
      parts.push(`This creature's text uses D&D condition names. In Intuitive Games: ${
        translated.map((c) => `${c.from} → ${c.to}`).join(', ')}.`);
    }
    if (gaps.length) {
      parts.push(`No Intuitive Games counterpart for ${gaps.map((c) => c.from).join(', ')} — ${
        gaps.map((c) => c.note).join(' ')}`);
    }
    out.push({ kind: 'trait', name: 'Conditions, in IG terms', body: parts.join(' ') });
  }

  return out;
}

/** Exported for the drift test: every name this module emits must exist in the published IG content. */
export function igReferencedNames(): { stances: string[]; defensivePowers: string[]; conditions: string[] } {
  return {
    stances: STANCE_EVIDENCE.map((r) => r.stance),
    defensivePowers: ['Counterattack', 'Armor Skin', 'Sidestep'],
    conditions: Object.values(IG_CONDITION_MAP),
  };
}

/** True when a name is one IG actually publishes. Used by the drift test rather than at runtime. */
export function isPublishedIgCondition(name: string): boolean {
  return IG_CONDITION_NAMES.has(name.toLowerCase());
}
