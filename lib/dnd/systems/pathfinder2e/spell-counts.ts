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
  // REDUCED CASTERS are modelled now (2026-07-27) — Magus and Summoner have real, captured tables, so they
  // no longer fall through to NONE. `slotTableModelled: false` stays on their data entries as the record of
  // what was true before the capture; this check runs first because the table is the better answer.
  const reduced = pf2ReducedSlots(className, level);
  if (reduced) {
    const slotsByRank = [...reduced];
    let topRank = 0;
    for (let r = 1; r <= 9; r++) if ((slotsByRank[r] ?? 0) > 0) topRank = r;
    return { modelled: true, kind: sc.kind ?? null, cantrips: slotsByRank[0] ?? 0, slotsByRank, topRank };
  }
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

// ── Prepared-slot enforcement (S7c, the last piece) ───────────────────────────────────────────────
//
// THE DECISION, owner 2026-07-27 ("make a good decision for 6, I trust your judgement"): **enforce it**,
// exactly the way 5e already does. `SpellsPanel.tsx` refuses a prepare past the cap (`if (held >=
// preparedCap) return c`) and disables the control with *"No room: your class prepares N spells at this
// level — un-prepare one first."* PF2 showing `Rank 1: 2/3` and then silently allowing a 4th would mean the
// two systems disagree about whether a stated budget means anything, which is worse than either answer.
//
// It sits inside S15's *"only ACQUISITION is gated"* boundary rather than against it. Preparing is not
// acquisition — nothing is added to or removed from the character. It is an assignment of spells the
// character ALREADY has into today's slots, and the slots are a number the sheet itself publishes. The
// budget was made visible first (`bfd60b94`) precisely so this cap is stated in advance: S7b's finding is
// that *a cap discovered by being refused reads as a bug; the same number stated up front reads as a rule.*
//
// FOUR EXEMPTIONS, each matching the pill display so the refusal and the number can never disagree:
//   · spontaneous casters — a repertoire is not a per-day assignment
//   · cantrips (rank 0)   — not slot-cast; their cap bites at pick time (`39137dbb`)
//   · focus spells        — cast from the focus pool, so counting them would refuse a caster who is fine
//   · any rank the character has no modelled slots for — reduced casters (Magus/Summoner) have no
//     published table, and inventing a cap for them is the exact bug this strand exists to undo

export interface Pf2PreparedRoom {
  /** Slots this rank grants, or null when no cap applies here. */
  slots: number | null;
  /** Non-focus spells of this rank already prepared, excluding the one being edited. */
  prepared: number;
  /** May one MORE spell be prepared at this rank? */
  hasRoom: boolean;
  /** Player-facing reason when there is not — null when there is. */
  reason: string | null;
}

const NO_CAP: Pf2PreparedRoom = { slots: null, prepared: 0, hasRoom: true, reason: null };

export interface Pf2PreparedSpell { name?: string; rank?: number; prepared?: boolean; focus?: boolean }

/**
 * Whether another spell may be prepared at `rank`. Pure, so the editor's control and any future
 * server-side check read the SAME rule — the duplicated "is this modelled?" question is what allowed the
 * `slotTableModelled` bug this file was written to fix.
 *
 * Over-count is GRANDFATHERED, not corrected (Q5's recorded assumption: never delete a player's content).
 * A caster already past the cap simply has no room for more; every spell they hold stays, and un-preparing
 * is always allowed because this only ever gates turning `prepared` ON.
 */
export function pf2PreparedRoom(args: {
  kind: string | null | undefined;
  slots: readonly number[] | null | undefined;
  spells: readonly Pf2PreparedSpell[] | null | undefined;
  rank: number;
  /** The spell being edited — re-saving one that is already prepared must never be refused. */
  editingName?: string;
}): Pf2PreparedRoom {
  const { kind, slots, spells, rank, editingName } = args;
  if (kind !== 'prepared') return NO_CAP;
  if (!Number.isFinite(rank) || rank <= 0) return NO_CAP;

  const granted = slots?.[rank] ?? 0;
  // `> 0` and not `>= 0`: a rank with no slots is ambiguous between "not yet available at this level" and
  // "this class's table is unmodelled", and refusing on either reading would cap a reduced caster.
  if (!(granted > 0)) return NO_CAP;

  const key = (editingName ?? '').trim().toLowerCase();
  const prepared = (spells ?? []).filter(
    (s) => !s.focus && s.prepared && s.rank === rank && (!key || (s.name ?? '').trim().toLowerCase() !== key),
  ).length;

  if (prepared < granted) return { slots: granted, prepared, hasRoom: true, reason: null };
  const noun = `slot${granted === 1 ? '' : 's'}`;
  return {
    slots: granted,
    prepared,
    hasRoom: false,
    reason: prepared > granted
      ? `${prepared} spells are prepared against ${granted} rank-${rank} ${noun} — un-prepare one before adding another.`
      : `No room: rank ${rank} grants ${granted} ${noun} and ${granted === 1 ? 'it is' : 'they are'} all prepared — un-prepare one first.`,
  };
}

// ── REDUCED CASTERS — Magus and Summoner (captured 2026-07-27) ───────────────────────────────────
//
// These were recorded for weeks as blocked on "the published reduced-caster tables (Ground Rule 3)".
// They are published, on the class pages themselves, and the two tables are IDENTICAL:
//
//   Magus    (2e.aonprd.com/Classes.aspx?ID=17)  "you have no more than two spell slots of your highest
//                                                 level and, if you can cast 2nd-level spells or higher,
//                                                 two spell slots of 1 level lower"
//   Summoner (2e.aonprd.com/Classes.aspx?ID=18)  "you begin to lose lower-level spell slots once you
//                                                 reach 5th level. The maximum number of spell slots you
//                                                 get from the summoner class is four"
//
// WHY THE SEARCH KEPT FAILING: the rule is PROSE on both pages, and the grid is an unlabelled table among
// six others. Looking for "the reduced-caster table" finds nothing because Paizo never publishes one — it
// publishes two class tables that happen to agree. The blocker was the shape of the question.
//
// Rows are levels 1–20; each row is slots by rank, index 0 = cantrips. Transcribed cell-for-cell from the
// two grids, which match each other exactly. Magus's table marks some empty cells with an asterisk noting
// that its 'studious spells' feature grants extra slots for SPECIFIC spells — a class feature, not a slot
// count, so it is not folded in here.
const PF2_REDUCED_SLOTS: readonly (readonly number[])[] = [
  /*  1 */ [5, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  /*  2 */ [5, 2, 0, 0, 0, 0, 0, 0, 0, 0],
  /*  3 */ [5, 2, 1, 0, 0, 0, 0, 0, 0, 0],
  /*  4 */ [5, 2, 2, 0, 0, 0, 0, 0, 0, 0],
  /*  5 */ [5, 0, 2, 2, 0, 0, 0, 0, 0, 0],
  /*  6 */ [5, 0, 2, 2, 0, 0, 0, 0, 0, 0],
  /*  7 */ [5, 0, 0, 2, 2, 0, 0, 0, 0, 0],
  /*  8 */ [5, 0, 0, 2, 2, 0, 0, 0, 0, 0],
  /*  9 */ [5, 0, 0, 0, 2, 2, 0, 0, 0, 0],
  /* 10 */ [5, 0, 0, 0, 2, 2, 0, 0, 0, 0],
  /* 11 */ [5, 0, 0, 0, 0, 2, 2, 0, 0, 0],
  /* 12 */ [5, 0, 0, 0, 0, 2, 2, 0, 0, 0],
  /* 13 */ [5, 0, 0, 0, 0, 0, 2, 2, 0, 0],
  /* 14 */ [5, 0, 0, 0, 0, 0, 2, 2, 0, 0],
  /* 15 */ [5, 0, 0, 0, 0, 0, 0, 2, 2, 0],
  /* 16 */ [5, 0, 0, 0, 0, 0, 0, 2, 2, 0],
  /* 17 */ [5, 0, 0, 0, 0, 0, 0, 0, 2, 2],
  /* 18 */ [5, 0, 0, 0, 0, 0, 0, 0, 2, 2],
  /* 19 */ [5, 0, 0, 0, 0, 0, 0, 0, 2, 2],
  /* 20 */ [5, 0, 0, 0, 0, 0, 0, 0, 2, 2],
];

/** The classes whose slots come from the reduced table above rather than the full-caster one. */
const REDUCED_CASTERS = new Set(['magus', 'summoner']);

export function pf2IsReducedCaster(className: string | undefined): boolean {
  return REDUCED_CASTERS.has((className ?? '').trim().toLowerCase());
}

/** Slots by rank for a reduced caster at 'level' (index 0 = cantrips), or null for any other class. */
export function pf2ReducedSlots(className: string | undefined, level: number): readonly number[] | null {
  if (!pf2IsReducedCaster(className)) return null;
  const lvl = Math.max(1, Math.min(20, Math.round(level || 1)));
  return PF2_REDUCED_SLOTS[lvl - 1];
}
