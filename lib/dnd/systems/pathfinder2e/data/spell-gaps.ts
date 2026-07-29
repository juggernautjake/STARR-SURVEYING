// lib/dnd/systems/pathfinder2e/data/spell-gaps.ts — the `PF2_*_GAPS` convention, extended to spells
// (P8-4, audit E-3).
//
// The DATA layer has been honest about this from the start. Both status blocks say it outright: "a missing
// spell here means 'not catalogued yet', NEVER 'does not exist in Pathfinder 2e'." Nobody using the app
// could learn that. The picker's empty state read **"Nothing matches that search."**, which says the exact
// opposite of what the catalogue itself knows — and a player who types "Heal" and is told nothing matches
// concludes the app is broken or the spell is not in the game.
//
// So this file is two things: the missing `PF2_SPELL_GAPS` list, and the numbers behind it — DERIVED, so
// they cannot drift from the catalogue the way a hand-kept count immediately would.
import { PF2_SPELLS_R0_3, PF2_SPELLS_R0_3_STATUS } from './spells-0-3';
import { PF2_SPELLS_R4_10, PF2_FOCUS_SPELLS, PF2_SPELLS_R4_10_STATUS } from './spells-4-10';
import { PF2_CLASS_PROGRESSIONS } from './classes';

/** Every catalogued spell, slot-cast and focus alike. (The barrel re-exports this as PF2_ALL_SPELLS;
 *  computed locally here so this module has no dependency on the barrel that imports it.) */
const ALL = [...PF2_SPELLS_R0_3, ...PF2_SPELLS_R4_10, ...PF2_FOCUS_SPELLS];

/** The four magical traditions. A spell belongs to one or more. */
export const PF2_TRADITIONS = ['arcane', 'divine', 'occult', 'primal'] as const;
export type PF2Tradition = (typeof PF2_TRADITIONS)[number];

export interface PF2SpellCoverage {
  total: number;
  slotCast: number;
  focus: number;
  /**
   * How many catalogued SLOT-CAST spells sit at each rank 0–10.
   *
   * Focus spells are excluded, and that is not tidiness. Most focus spells are rank 1, so counting them
   * here made rank 1 read 125 against rank 2's 12 — a number that looks like excellent coverage of first
   * -rank spells and is nothing of the sort. A derived figure can still mislead if it derives the wrong
   * thing.
   */
  byRank: Record<number, number>;
  /** How many catalogued slot-cast spells each tradition can reach. */
  byTradition: Record<PF2Tradition, number>;
  /** Classes with catalogued focus spells. */
  focusClasses: string[];
  /**
   * Classes that CAST and have no catalogued focus spells.
   *
   * Restricted to spellcasting classes on purpose. The first version listed every class with no focus
   * entries, which named Alchemist, Barbarian, Fighter and Rogue — none of which has focus spells to
   * begin with. A gaps list that reports four non-gaps is worse than one that reports none, because it
   * teaches the reader to distrust the rest of it.
   */
  castersWithoutFocusSpells: string[];
  complete: false;
}

/**
 * The catalogue's coverage, computed from the catalogue.
 *
 * Every number here is counted rather than recorded. The alternative — a hand-written summary — is the
 * thing this whole convention exists to avoid: it would be right on the day it was written and quietly
 * wrong afterwards, which is worse than no summary at all because it reads authoritative.
 */
export function pf2SpellCoverage(): PF2SpellCoverage {
  const slot = [...PF2_SPELLS_R0_3, ...PF2_SPELLS_R4_10];

  const byRank: Record<number, number> = {};
  for (let r = 0; r <= 10; r++) byRank[r] = 0;
  for (const s of slot) if (byRank[s.rank] != null) byRank[s.rank] += 1;

  const byTradition = Object.fromEntries(PF2_TRADITIONS.map((t) => [t, 0])) as Record<PF2Tradition, number>;
  for (const s of slot) {
    for (const t of s.traditions ?? []) {
      if (t in byTradition) byTradition[t as PF2Tradition] += 1;
    }
  }

  const focusClasses = [...new Set(PF2_FOCUS_SPELLS.map((s) => s.focusClass).filter((c): c is string => !!c))].sort();
  const withFocus = new Set(focusClasses.map((c) => c.toLowerCase()));
  // Only classes that CAST — a class's own `spellcasting` block is the repo's existing answer to "is this
  // a caster", so this asks that rather than deciding it here.
  //
  // Read from PF2_CLASS_PROGRESSIONS, not content.ts's PF2_CLASSES. The latter holds 14 level-1
  // definitions; the former holds all 21. Filtering the short list produced "Every spellcasting class has
  // catalogued focus spells" — a flatly FALSE sentence, since the Magus, Summoner, Psychic and
  // Thaumaturge are exactly the ones missing, and the catalogue status note has said so all along. A
  // derived claim is only as honest as the set it derives over.
  const castersWithoutFocusSpells = PF2_CLASS_PROGRESSIONS
    .filter((c) => !!c.spellcasting && !withFocus.has(c.className.toLowerCase()))
    .map((c) => c.className)
    .sort();

  return {
    total: ALL.length,
    slotCast: slot.length,
    focus: PF2_FOCUS_SPELLS.length,
    byRank,
    byTradition,
    focusClasses,
    castersWithoutFocusSpells,
    complete: false,
  };
}

/**
 * What the spell catalogue does NOT cover, in the same shape as `PF2_FEATS_CLASS_GAPS`,
 * `PF2_ANCESTRY_GAPS` and `PF2_CLASS_PROGRESSION_GAPS`.
 *
 * Partly derived: the focus-spell hole names the classes that actually have none, so it cannot claim a
 * class is missing after someone catalogues it.
 */
export function pf2SpellGaps(): string[] {
  const c = pf2SpellCoverage();
  const thinRanks = Object.entries(c.byRank).filter(([, n]) => n > 0 && n < 10).map(([r]) => r);
  const emptyRanks = Object.entries(c.byRank).filter(([, n]) => n === 0).map(([r]) => r);

  return [
    `${c.total} spells catalogued (${c.slotCast} slot-cast, ${c.focus} focus) — roughly half of Player Core. A spell that is absent is NOT catalogued yet; it is not a claim that the spell does not exist.`,
    'Entries were omitted wherever the remastered name, rank or TRADITION list could not be confirmed. A wrong tradition silently breaks the eligibility gate, which is the worst failure available here because the sheet still looks correct.',
    c.castersWithoutFocusSpells.length
      ? `No focus spells are catalogued for these spellcasting classes: ${c.castersWithoutFocusSpells.join(', ')}.`
      : 'Every spellcasting class has catalogued focus spells.',
    emptyRanks.length ? `Ranks with NO catalogued slot-cast spells at all: ${emptyRanks.join(', ')}.` : '',
    thinRanks.length ? `Ranks with fewer than ten catalogued slot-cast spells: ${thinRanks.join(', ')}.` : '',
    '46 focus spells carry source "Legacy" because their remastered form could not be confirmed; they are catalogued with their pre-remaster text rather than a guessed update.',
    'Per-spell FIELDS are gated on the same confidence as the spell itself: exact damage dice, area sizes and heightening lines are omitted where they could not be confirmed, rather than approximated.',
  ].filter(Boolean);
}

/** The frozen list, for callers that want it as data rather than as a call. */
export const PF2_SPELL_GAPS: string[] = pf2SpellGaps();

/**
 * The sentence a picker should show when a search finds nothing.
 *
 * "Nothing matches that search" is the default a UI reaches for, and it is a claim about Pathfinder rather
 * than about us. This one is a claim about us, which is the only one we can actually make.
 */
export function pf2SpellSearchMiss(query: string): string {
  const c = pf2SpellCoverage();
  const q = query.trim();
  return q
    ? `No catalogued spell matches “${q}”. ${c.total} of Pathfinder’s spells are catalogued so far, so this may be one we have not added yet rather than one that does not exist.`
    : `${c.total} spells catalogued so far — not the full list.`;
}

/** Both underlying status blocks, so a caller can show either without importing three modules. */
export const PF2_SPELL_STATUS = {
  ranks0to3: PF2_SPELLS_R0_3_STATUS,
  ranks4to10: PF2_SPELLS_R4_10_STATUS,
} as const;
