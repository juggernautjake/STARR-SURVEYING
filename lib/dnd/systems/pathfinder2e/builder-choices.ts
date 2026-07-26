// lib/dnd/systems/pathfinder2e/builder-choices.ts — the PF2 Foundations builder's picks, recorded in the
// SAME ledger the PF2 level walker reads (`data.pf2Build.choices`).
//
// The PF2 mirror of `lib/dnd/statgen/builder-choices.ts`, and it closes the defect the owner reported:
//
//   "at every level we get access to all spells and feats and just about everything … they can click on as
//    many as they want. We shouldn't be able to give 10 different feats to a character at level 2."
//
// PF2 is the sharpest case, because it already knew better. `pf2PlanLevelUp` is fully slot-driven — one
// prompt per (level, TRACK), where the tracks are ancestry / class / skill / general — and
// `pf2LevelBreakdown` already returns exactly which tracks a level grants. `PF2CharacterBuilder` even
// DISPLAYS the number ("3 chosen · 7 owed by level 12"). Then it stored the picks in a flat `feats: string[]`
// with an unbounded toggle, so a level-1 character could hold thirty feats and none of them was attached to
// the slot it was meant to fill. The information was computed, shown to the player, and thrown away.
//
// Assigning feats earliest-first, and within a level in FEAT_TRACKS order, is the same argument as the 5e
// module: the builder never asks which slot a feat belongs to, so no information is being discarded — this
// is the only mapping consistent with what the player was shown. Feats beyond the ladder's length stay in
// `picks.feats` unattributed rather than inventing a slot: at that point the character is no longer a plain
// vanilla build, which is the "altered vanilla" state the owner asked for (see the slot plan, S8).
import { pf2LevelBreakdown, type PF2RecordedChoice } from './levelup';
import { PF2_CLASS_PROGRESSIONS } from './data/classes';
import type { PF2FeatTrack } from './defs';

/** One feat slot the class's own schedule grants: a level plus the track it belongs to. */
export interface PF2FeatSlot {
  level: number;
  track: PF2FeatTrack;
}

/**
 * Every feat slot a character of this class has by `level`, in the order they are earned.
 *
 * Reads `pf2LevelBreakdown`, which is the tested schedule (`pf2FeatLevelsFor` + the class's own
 * `classFeatLevels`) — so this stays correct for a class whose class-feat levels are unusual, and it cannot
 * drift from what the level walker prompts for.
 */
export function pf2FeatSlots(className: string | undefined, level: number): PF2FeatSlot[] {
  if (!className) return [];
  return pf2LevelBreakdown(className, level)
    .flatMap((step) => step.featTracks.map((track) => ({ level: step.level, track })));
}

/** How many feats this character is entitled to by `level` — the number the builder should cap at. */
export function pf2FeatSlotCount(className: string | undefined, level: number): number {
  return pf2FeatSlots(className, level).length;
}

export interface PF2BuilderChoiceInput {
  className?: string;
  level: number;
  /** The feat picks, in the order the player selected them. */
  feats?: string[];
  /** The chosen subclass (Instinct / Bloodline / Doctrine …). */
  subclass?: string;
}

/** The ledger entries implied by a PF2 Foundations build. */
export function pf2BuilderChoicesFor(input: PF2BuilderChoiceInput): PF2RecordedChoice[] {
  const level = Math.max(1, Math.min(20, Math.round(input.level || 1)));
  const out: PF2RecordedChoice[] = [];

  const feats = (input.feats ?? []).map((f) => (f ?? '').trim()).filter(Boolean);
  const slots = pf2FeatSlots(input.className, level);
  // Only as many slots as there are feats: an unfilled slot must stay OUTSTANDING, because the player
  // really does still owe that choice.
  slots.slice(0, feats.length).forEach((s, i) => {
    out.push({ level: s.level, kind: 'feat', track: s.track, value: feats[i] });
  });

  // The subclass moment (Instinct/Bloodline/Doctrine/…) — recorded at the first level the class grants it,
  // and only when the class HAS one. `subclassLevels` falls back to [1], matching `pf2PlanLevelUp`.
  const subclass = (input.subclass ?? '').trim();
  if (subclass) {
    const prog = PF2_CLASS_PROGRESSIONS.find((p) => p.className === input.className);
    const levels = prog?.subclassLevels ?? (prog?.subclassName ? [1] : []);
    const first = levels.filter((l) => l <= level).sort((a, b) => a - b)[0];
    if (first != null) out.push({ level: first, kind: 'subclass', value: subclass });
  }

  return out.sort((a, b) => a.level - b.level);
}

/**
 * Fold a Foundations build's choices into whatever the ledger already holds.
 *
 * Same rule as the 5e module: the build replaces the kinds it owns at levels it covers (it is a rebuild),
 * and leaves everything else — notably the 5/10/15/20 attribute BOOSTS, which Foundations does not collect,
 * and any choice recorded above the built level.
 */
export function mergePf2BuilderChoices(
  existing: PF2RecordedChoice[] | undefined,
  builder: PF2RecordedChoice[],
  builtLevel: number,
): PF2RecordedChoice[] {
  const owned = new Set(builder.map((c) => c.kind));
  const kept = (existing ?? []).filter((c) => !(owned.has(c.kind) && c.level <= builtLevel));
  return [...kept, ...builder].sort((a, b) => a.level - b.level);
}
