// lib/dnd/systems/pathfinder2e/spell-counts.ts — how MANY spells a PF2 caster gets, per rank.
//
// The PF2 counterpart of `lib/dnd/spells/counts.ts`, and the count source S7c said did not exist.
//
// IT MOSTLY DID. The blocking note — "`pf2SpellSlots` is a single derived full-caster table keyed on level
// alone, not per class" — is right for REDUCED casters and wrong for FULL ones: in PF2 every full caster
// shares one slot table by design, so that table *is* the per-class count for the eight classes marked
// `progression: 'full'`. What is genuinely absent is only the Magus/Summoner reduced tables, which
// `data/classes.ts` deliberately omits rather than guessing.
//
// So this reports a count where one really exists and says NOT MODELLED where it does not, instead of
// handing every caster the full table — which is exactly the bug it was extracted from: `buildPF2Character`
// gave a Magus a full caster's slots while `pf2MaxSpellRank` reported a ceiling of 0 for the same character.
//
// WHAT THIS DOES NOT DO, and why. It does not cap a picker. 5e's S7b established that aiming the cap is the
// whole risk: a prepared caster's SHEET LIST is not their prepared count — a Wizard's spellbook and a
// Cleric's access to the whole tradition are both far larger than what they cast in a day. PF2 splits the
// same way (`kind: 'prepared' | 'spontaneous'`), so `kind` is reported here and the aiming decision is left
// to whoever wires enforcement, with the same three-way split 5e used.
import { PF2_CLASS_PROGRESSIONS } from './data/classes';
import { pf2SpellSlots } from './rules';

export interface PF2SpellCounts {
  /** True when the class's slot table is really modelled. False for the reduced casters, whose tables
   *  `data/classes.ts` omits on purpose — callers must not substitute a full caster's numbers. */
  modelled: boolean;
  /** Prepared casters fill slots each day; spontaneous casters know a list. The distinction decides where
   *  a cap belongs, which is the lesson 5e's S7b paid for. Null when the class does not cast. */
  kind: 'prepared' | 'spontaneous' | null;
  /** Cantrips available. Zero when not modelled or not a caster. */
  cantrips: number;
  /** Slots by rank, index 1–10. Empty when not modelled or not a caster. */
  slotsByRank: number[];
  /** The highest rank with at least one slot; 0 when there is none. */
  topRank: number;
}

const NONE: PF2SpellCounts = { modelled: false, kind: null, cantrips: 0, slotsByRank: [], topRank: 0 };

const progressionFor = (className: string | undefined) =>
  PF2_CLASS_PROGRESSIONS.find((p) => p.className.toLowerCase() === (className ?? '').trim().toLowerCase()) ?? null;

/** How many spells this class gets at this level, or a `modelled: false` answer when the table is
 *  deliberately absent. Never invents one — see the header. */
export function pf2SpellCountsFor(className: string | undefined, level: number): PF2SpellCounts {
  const prog = progressionFor(className);
  const sc = prog?.spellcasting;
  if (!sc) return NONE;
  // An EXPLICIT false is the only thing that suppresses. A class with no flag is not a claim that its
  // table is unmodelled — the same conservatism the builder uses, so the two cannot disagree.
  if (sc.slotTableModelled === false) return { ...NONE, kind: sc.kind ?? null };

  const lvl = Math.max(1, Math.min(20, Math.round(level || 1)));
  const slots = pf2SpellSlots(lvl);
  const slotsByRank = slots.slice(0, 11);
  let topRank = 0;
  for (let r = 1; r <= 10; r++) if ((slotsByRank[r] ?? 0) > 0) topRank = r;
  return { modelled: true, kind: sc.kind ?? null, cantrips: slotsByRank[0] ?? 0, slotsByRank, topRank };
}

/** Does this class's slot table exist at all? The predicate the builder needs, so "not modelled" is decided
 *  in ONE place rather than re-derived wherever slots are emitted. */
export function pf2SlotTableModelled(className: string | undefined): boolean {
  return progressionFor(className)?.spellcasting?.slotTableModelled !== false;
}
