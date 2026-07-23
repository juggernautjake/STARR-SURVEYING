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
import type { PF2AttributeKey } from './model';

/** The feat tracks that follow a fixed level schedule (archetype feats ride the class schedule). */
const FEAT_TRACKS: PF2FeatTrack[] = ['ancestry', 'class', 'skill', 'general'];

/** Every PF2 character gains 4 free ability boosts (partial past +4) at these levels — universal, not
 *  class-specific, so it's safe to surface for every class. (Skill increases vary by class — Rogue/
 *  Investigator get more — so those are deliberately NOT modelled here to avoid showing a wrong schedule.) */
const ABILITY_BOOST_LEVELS = new Set([5, 10, 15, 20]);

export interface PF2LevelStep {
  level: number;
  /** Class features gained at this level (name + effect), from the class's progression. */
  features: { name: string; effect: string }[];
  /** Feat tracks that grant a feat SLOT at this level (ancestry / class / skill / general). */
  featTracks: PF2FeatTrack[];
  /** True at 5/10/15/20 — the character takes 4 free ability boosts. */
  abilityBoosts: boolean;
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
    steps.push({ level, features, featTracks, abilityBoosts: ABILITY_BOOST_LEVELS.has(level) });
  }
  return steps;
}

// ── Interactive planner (B8/B9) ─────────────────────────────────────────────────────────────────────
// `pf2PlanLevelUp` is the PF2 mirror of 5e's `planLevelUp`: given the class, a target level, and the
// choices already recorded, it returns what is still OWED before the character can BE that level — the
// per-level FEAT slots (one prompt per track that grants a feat that level), the class's defining
// subclass choice (Instinct/Bloodline/Doctrine…), and the universal 4-attribute boosts at 5/10/15/20.
// It reads only verified data: the tested feat schedule (`pf2FeatLevelsFor`), the class's own
// `subclassName`/`subclassLevels`, and the universal boost levels. DELIBERATELY NOT surfaced — matching
// this module's existing caveats and `PF2_CLASS_PROGRESSION_GAPS` — are per-class SKILL-INCREASE
// schedules (vary by class; showing a fixed one would be wrong) and the concrete subclass OPTIONS (not
// reliably modelled): the subclass prompt names the moment, the picker supplies the legal list.

export type PF2ChoiceKind = 'subclass' | 'feat' | 'boosts';

/** A choice the player has already made, persisted on `data.pf2e.build.choices`. */
export interface PF2RecordedChoice {
  level: number;
  kind: PF2ChoiceKind;
  /** feat → which track the slot belongs to (a level can grant more than one). */
  track?: PF2FeatTrack;
  /** subclass → the chosen subclass name/key · feat → the chosen feat name. */
  value?: string;
  /** boosts → the (up to 4) attributes raised this boost level. */
  attributes?: PF2AttributeKey[];
}

/** A choice still owed at a level, with what the UI needs to prompt for it. */
export interface PF2OutstandingChoice {
  level: number;
  kind: PF2ChoiceKind;
  track?: PF2FeatTrack;
  label: string;
  detail: string;
  /** boosts → how many distinct attributes to raise (4). */
  pick?: number;
}

export interface PF2LevelUpPlan {
  from: number;
  to: number;
  /** Every choice owed at levels 1..to, in level order. Empty ⇒ nothing blocks the level-up. */
  outstanding: PF2OutstandingChoice[];
  ready: boolean;
}

const TRACK_LABEL: Record<PF2FeatTrack, string> = {
  ancestry: 'Ancestry feat',
  class: 'Class feat',
  skill: 'Skill feat',
  general: 'General feat',
  archetype: 'Archetype feat',
};

/** Is a recorded choice actually resolved (not just a placeholder)? */
function pf2Satisfied(rec: PF2RecordedChoice | undefined, kind: PF2ChoiceKind): boolean {
  if (!rec) return false;
  if (kind === 'boosts') return (rec.attributes?.length ?? 0) >= 4;
  return !!rec.value && rec.value.trim() !== '';
}

/**
 * What the character still owes before it can be `to` (clamped 1–20), given `recorded` choices.
 * Surfaces, per level: one FEAT prompt per track that grants a feat that level, the class's SUBCLASS
 * choice at its subclass level(s), and the 4-attribute BOOSTS at 5/10/15/20. Reads only verified data.
 */
export function pf2PlanLevelUp(args: {
  className: string;
  to: number;
  recorded?: PF2RecordedChoice[];
  from?: number;
}): PF2LevelUpPlan {
  const prog = PF2_CLASS_PROGRESSIONS.find((p) => p.className === args.className);
  const to = Math.max(1, Math.min(20, Math.floor(Number(args.to) || 1)));
  const from = Math.max(0, Math.min(to, Math.floor(Number(args.from) || 0)));
  const recorded = args.recorded ?? [];
  const has = (level: number, kind: PF2ChoiceKind, track?: PF2FeatTrack) =>
    recorded.find((r) => r.level === level && r.kind === kind && (track ? r.track === track : true));

  const subclassLevels = new Set(prog?.subclassLevels ?? (prog?.subclassName ? [1] : []));
  const outstanding: PF2OutstandingChoice[] = [];

  for (let level = 1; level <= to; level++) {
    // The class's defining choice (Instinct/Bloodline/Doctrine/…) — only when the class HAS one.
    if (prog?.subclassName && subclassLevels.has(level) && !pf2Satisfied(has(level, 'subclass'), 'subclass')) {
      outstanding.push({
        level,
        kind: 'subclass',
        label: prog.subclassName,
        detail: `Your ${prog.className}'s defining choice — it shapes features you gain now and later.`,
      });
    }
    // One feat prompt per track that grants a slot this level (the tested schedule).
    for (const track of FEAT_TRACKS) {
      if (!pf2FeatLevelsFor(track, level, prog?.classFeatLevels).includes(level)) continue;
      if (pf2Satisfied(has(level, 'feat', track), 'feat')) continue;
      outstanding.push({ level, kind: 'feat', track, label: TRACK_LABEL[track], detail: `Pick a ${track} feat you qualify for.` });
    }
    // Universal 4-attribute boosts.
    if (ABILITY_BOOST_LEVELS.has(level) && !pf2Satisfied(has(level, 'boosts'), 'boosts')) {
      outstanding.push({ level, kind: 'boosts', label: 'Attribute boosts', detail: 'Raise four different attributes by 1 (partial past +4).', pick: 4 });
    }
  }

  outstanding.sort((a, b) => a.level - b.level);
  return { from, to, outstanding, ready: outstanding.length === 0 };
}

/** Add or REPLACE a recorded choice (same level + kind + track), returning a new array. */
export function pf2RecordChoice(recorded: PF2RecordedChoice[], choice: PF2RecordedChoice): PF2RecordedChoice[] {
  const rest = recorded.filter(
    (r) => !(r.level === choice.level && r.kind === choice.kind && (r.track ?? null) === (choice.track ?? null)),
  );
  return [...rest, choice];
}

// ── Projection into the pf2e sidecar (B10 follow-up) ─────────────────────────────────────────────────
// Recording a choice is only half the job: a committed feat must actually appear on the sheet. This
// projects the recorded FEAT choices (at or below the character's level) into the pf2e sidecar's feat
// list. It is IDEMPOTENT — each projected feat carries a stable id (`lvl-<level>-<track>`), so
// re-projecting replaces rather than duplicates, and feats from the base build (any id NOT starting
// `lvl-`) are left untouched. ATTRIBUTE-BOOST projection is deliberately NOT here: PF2's partial-boost
// rule (a boost to a +4-or-higher attribute needs two boosts to raise it) needs half-step state the flat
// `PF2Attributes` modifier map doesn't carry, and a naive +1 would over-boost — so boosts stay recorded
// (visible in the plan) until the model can track them correctly.

/** The catalog data a feat name resolves to — the level route passes a lookup over `PF2_ALL_FEATS`. */
export interface PF2FeatResolution {
  level: number;
  traits: string[];
  body: string;
}

/** A minimal shape of the sidecar feats this projects, kept structural so callers pass `PF2Feat[]`. */
export interface PF2ProjectableFeat {
  id: string;
  name: string;
  level: number;
  track: 'ancestry' | 'class' | 'skill' | 'general' | 'archetype' | 'feature';
  traits: string[];
  body: string;
  customized?: boolean;
}

const LEVELUP_FEAT_PREFIX = 'lvl-';

export function pf2ProjectLevelUpFeats<T extends PF2ProjectableFeat>(
  existing: T[],
  choices: PF2RecordedChoice[],
  throughLevel: number,
  resolve: (name: string, track: PF2FeatTrack) => PF2FeatResolution | null,
): T[] {
  // Keep every feat that ISN'T a level-up projection (base build, DM grants, custom picks).
  const kept = existing.filter((f) => !f.id.startsWith(LEVELUP_FEAT_PREFIX));
  const projected: T[] = [];
  for (const c of choices) {
    if (c.kind !== 'feat' || !c.track || !c.value || c.value.trim() === '') continue;
    if (c.level > throughLevel) continue; // not earned yet
    const hit = resolve(c.value, c.track);
    projected.push({
      id: `${LEVELUP_FEAT_PREFIX}${c.level}-${c.track}`,
      name: c.value,
      level: c.level,
      track: c.track === 'archetype' ? 'archetype' : c.track,
      traits: hit?.traits ?? [],
      body: hit?.body ?? '',
      // A pick not found in the catalog is custom content — flag it so the DM review + ✎ marker show it.
      ...(hit ? {} : { customized: true }),
    } as T);
  }
  projected.sort((a, b) => a.level - b.level);
  return [...kept, ...projected];
}
