// lib/dnd/systems/intuitive-games/levelup.ts — the DOCUMENTED IG level milestones (B13, first slice).
//
// Unlike 5e/PF2, Intuitive Games does not publish a per-level class-feature table: `IG_PROGRESSION_NOTE`
// says "Levels 2–10 add traits, powers, feats, and ability boosts on a FIXED SCHEDULE" but the site never
// enumerates that schedule — so authoring `IG_CLASS_PROGRESSIONS` (B12) stays blocked on the owner, and
// the IG Ground Rules forbid inventing it. What IS documented are the milestone levels — specializations
// at 4, unique powers at 6, greater specializations at 8, a capstone + manifestation at 10 — and each
// subclass's own specialization OPTIONS are catalogued in `IG_CLASS_DETAILS`. This reads only that
// documented data, so a player can at least see their real milestone path and pick a real specialization,
// without the module pretending to know the parts of the schedule the site withholds.
import { IG_CLASS_DETAILS } from './content';

export type IGMilestoneKind = 'specialization' | 'unique-power' | 'greater-specialization' | 'capstone';

export interface IGMilestone {
  level: number;
  kind: IGMilestoneKind;
  label: string;
  detail: string;
  /** For the level-4 specialization: the subclass's catalogued options. Absent where the site does not
   *  enumerate a choice (unique power, greater specialization, capstone) — the moment is named, not faked. */
  options?: string[];
}

/** Find a class or subclass entry by name (case-insensitive). Subclasses carry the `specializations`. */
function igEntry(name: string) {
  const key = (name ?? '').trim().toLowerCase();
  return IG_CLASS_DETAILS.find((c) => c.name.toLowerCase() === key) ?? null;
}

/**
 * The documented IG milestones from level 1 through `toLevel` (clamped 1–20), for the character's subclass.
 * Only the levels the site actually calls out carry an entry (4/6/8/10); the "fixed schedule" of per-level
 * traits/feats/boosts the note references but never lists is deliberately NOT surfaced. The level-4
 * specialization prompt carries the subclass's real catalogued options; the others name the moment only.
 */
export function igLevelMilestones(subclass: string, toLevel: number): IGMilestone[] {
  const specs = igEntry(subclass)?.specializations ?? [];
  const n = Math.max(1, Math.min(20, Math.floor(Number(toLevel) || 1)));
  const all: IGMilestone[] = [
    {
      level: 4,
      kind: 'specialization',
      label: 'Specialization',
      detail: 'Your subclass specialization begins at level 4 — choose one.',
      ...(specs.length ? { options: specs } : {}),
    },
    { level: 6, kind: 'unique-power', label: 'Unique Power', detail: 'A unique power arrives at level 6.' },
    {
      level: 8,
      kind: 'greater-specialization',
      label: 'Greater Specialization',
      detail: 'Your specialization advances to its greater form at level 8.',
    },
    { level: 10, kind: 'capstone', label: 'Capstone & Manifestation', detail: 'A class capstone and a manifestation arrive at level 10.' },
  ];
  return all.filter((m) => m.level <= n);
}
