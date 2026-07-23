// lib/dnd/systems/pathfinder2e/levelup.ts — a per-level PROGRESSION breakdown for a PF2 class (B8, first
// slice). Given a class name and a target level, returns what the character gains at EACH level 1..N: the
// class features (from the tested `PF2_CLASS_PROGRESSIONS` — see data/classes.ts) and which feat tracks
// grant a feat slot that level (from the tested feat schedule in eligibility.ts). It reads only existing,
// verified data — no rules are invented here — so it's the safe foundation the guided builder's PF2
// "level-by-level" preview and (later) the interactive `pf2PlanLevelUp` walk read from.
//
// DELIBERATELY OMITTED for now: the universal chassis every class shares is surfaced via the feat tracks
// (ancestry/skill/general feats), but ability boosts (levels 5/10/15/20) and skill increases (odd levels
// from 3) are character rules, not class rules, and the proficiency-increase caveats
// (`PF2_CLASS_PROGRESSION_GAPS`: Monk player-chosen saves, Cleric doctrines) mean per-track rank steps are
// left to a later slice rather than shown partially.
import { PF2_CLASS_PROGRESSIONS } from './data/classes';
import { pf2FeatLevelsFor } from './eligibility';
import type { PF2FeatTrack } from './defs';

/** The feat tracks that follow a fixed level schedule (archetype feats ride the class schedule). */
const FEAT_TRACKS: PF2FeatTrack[] = ['ancestry', 'class', 'skill', 'general'];

export interface PF2LevelStep {
  level: number;
  /** Class features gained at this level (name + effect), from the class's progression. */
  features: { name: string; effect: string }[];
  /** Feat tracks that grant a feat SLOT at this level (ancestry / class / skill / general). */
  featTracks: PF2FeatTrack[];
}

/**
 * The level-by-level breakdown for `className` from level 1 through `toLevel` (clamped to 1–20).
 * Every entry is present (even a level with no features), so a caller can render a complete table.
 * An unknown class yields the universal feat schedule with no class features.
 */
export function pf2LevelBreakdown(className: string, toLevel: number): PF2LevelStep[] {
  const prog = PF2_CLASS_PROGRESSIONS.find((p) => p.className === className);
  const n = Math.max(1, Math.min(20, Math.floor(Number(toLevel) || 1)));
  const steps: PF2LevelStep[] = [];
  for (let level = 1; level <= n; level++) {
    const features = (prog?.features ?? [])
      .filter((f) => f.level === level)
      .map((f) => ({ name: f.name, effect: f.effect }));
    const featTracks = FEAT_TRACKS.filter((t) => pf2FeatLevelsFor(t, level, prog?.classFeatLevels).includes(level));
    steps.push({ level, features, featTracks });
  }
  return steps;
}
