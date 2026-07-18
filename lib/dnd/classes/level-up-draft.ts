// lib/dnd/classes/level-up-draft.ts — leveling up an EXISTING character by one level, the vanilla way OR with
// AI-generated custom content (owner 2026-07-18: "when a custom character levels up … choose from the standard
// available features … or custom build the next level … Please make sure AI can handle leveling up characters
// … with either custom stuff, or the vanilla stuff").
//
// Two paths, one module:
//   • VANILLA — `standardLevelUpOptions` reuses the existing `planLevelUp` engine to list exactly what the
//     class/subclass GRANTS at the new level (features gained) + the choices it OWES (ASI, subclass, …). This
//     is "choose from the standard available features that make sense" — for an official OR a homebrew class
//     (both are plain `ClassDefinition`s), no new logic.
//   • CUSTOM — `parseLevelUpDraft` is the defensive normalizer for an AI-proposed (or hand-entered) single
//     level increment: the new features/feats/buffs, HP gained, ability increases, and an optional subclass.
//     It NEVER throws on partial/garbage input (drops nameless features, clamps HP + ability increases, pins
//     the target to currentLevel+1) so the AI just proposes and the player reviews — mirroring how
//     `parseCustomClassDraft` feeds the homebrew-class engine.
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import type { ClassDefinition, ClassFeature, SubclassDefinition } from './types';
import { planLevelUp, type OutstandingChoice, type RecordedChoice } from './levelup';

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;
};

/** One feature / feat / buff granted by a level-up. */
export interface LevelUpFeature { name: string; body: string }

export interface LevelUpDraft {
  fromLevel: number;
  toLevel: number;
  /** HP gained this level (rolled or the class average), or null when unspecified. */
  hpGained: number | null;
  /** New features/feats/buffs granted this level (custom or transcribed-vanilla). */
  features: LevelUpFeature[];
  /** Ability increases applied this level (an ASI): ability → +N. */
  abilityIncreases: Partial<Record<AbilityKey, number>>;
  /** A subclass chosen this level, if any (its key/name). */
  subclass?: string;
  /** Did this follow the class ladder ('vanilla') or invent content ('custom')? */
  mode: 'vanilla' | 'custom';
  notes?: string;
}

/**
 * Normalize an arbitrary object (an LLM tool call, or hand-entered JSON) into a valid LevelUpDraft for the
 * character's NEXT level. Defensive by construction — the target level is pinned to `currentLevel + 1`
 * (clamped 1..20), HP is clamped to a sane 0..1000, nameless features are dropped, and ability increases keep
 * only real keys clamped to +1..+2. So the AI/UI can propose freely and the player reviews a clean draft.
 */
export function parseLevelUpDraft(raw: unknown, opts: { currentLevel: number }): LevelUpDraft {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const fromLevel = clampInt(opts.currentLevel, 0, 19, 1);
  const toLevel = Math.min(20, fromLevel + 1);

  const features = (Array.isArray(o.features) ? o.features : [])
    .map((f) => (f && typeof f === 'object' ? (f as Record<string, unknown>) : {}))
    .map((f) => ({ name: str(f.name), body: str(f.body) }))
    .filter((f) => f.name.length > 0);

  const abilityIncreases: Partial<Record<AbilityKey, number>> = {};
  const incRaw = o.abilityIncreases && typeof o.abilityIncreases === 'object' ? (o.abilityIncreases as Record<string, unknown>) : {};
  for (const k of ABILITY_KEYS) {
    const n = Number(incRaw[k]);
    if (Number.isFinite(n) && n !== 0) abilityIncreases[k] = Math.max(1, Math.min(2, Math.round(Math.abs(n))));
  }

  const mode = str(o.mode).toLowerCase() === 'vanilla' ? 'vanilla' : 'custom';
  const subclass = str(o.subclass) || undefined;
  const hpRaw = Number(o.hpGained);
  const hpGained = Number.isFinite(hpRaw) ? Math.max(0, Math.min(1000, Math.round(hpRaw))) : null;

  return { fromLevel, toLevel, hpGained, features, abilityIncreases, subclass, mode, notes: str(o.notes) || undefined };
}

/** Total ability points an increase spends. A legal 5e ASI spends exactly 2 (a +2, or two +1s). */
export function abilityIncreaseTotal(inc: Partial<Record<AbilityKey, number>>): number {
  return ABILITY_KEYS.reduce((sum, k) => sum + (inc[k] ?? 0), 0);
}

/** Is an ability-increase block a legal standard ASI (exactly +2 total across one or two abilities)? Custom
 *  level-ups may exceed this deliberately — the UI shows the total and flags an over-spend for the DM. */
export function isLegalAsi(inc: Partial<Record<AbilityKey, number>>): boolean {
  const keys = ABILITY_KEYS.filter((k) => (inc[k] ?? 0) > 0);
  return abilityIncreaseTotal(inc) === 2 && keys.length >= 1 && keys.length <= 2 && keys.every((k) => (inc[k] ?? 0) <= 2);
}

export interface StandardLevelUpOptions {
  /** The features the class/subclass GRANTS at the new level (the "standard available features"). */
  gained: ClassFeature[];
  /** The choices the level OWES (ASI, subclass, expertise, …) — what the player still picks. */
  outstanding: OutstandingChoice[];
  /** True when the class ladder grants nothing new at this level (a custom level-up is the natural path). */
  empty: boolean;
}

/**
 * The VANILLA options for taking a character from `from` to `to` on a given class definition (official or
 * homebrew — both are plain `ClassDefinition`s). Reuses `planLevelUp` so the "standard features that make
 * sense for this class/subclass" come straight from the same engine the level-up wizard uses. When the class
 * grants nothing new (a gap level, or a fully-custom character whose ladder is thin), `empty` is true and the
 * caller offers the custom/AI path instead.
 */
export function standardLevelUpOptions(
  def: ClassDefinition,
  opts: { from: number; to: number; recorded?: RecordedChoice[]; subclasses?: SubclassDefinition[]; proficientSkills?: string[] },
): StandardLevelUpOptions {
  const plan = planLevelUp(def, {
    from: opts.from,
    to: opts.to,
    recorded: opts.recorded ?? [],
    subclasses: opts.subclasses,
    proficientSkills: opts.proficientSkills,
  });
  // `gained` = only the features NEW on this step. `outstanding` = the feature-based choices planLevelUp
  // owes (fighting-style, subclass, expertise, epic-boon) PLUS an ASI whenever the new level is one of the
  // class's `asiLevels` and it hasn't been recorded — ASIs live in `asiLevels`, not as feature choices, so
  // planLevelUp doesn't surface them and the wrapper must.
  const gainedThisStep = plan.gained.filter((f) => f.level > opts.from && f.level <= opts.to);
  const recorded = opts.recorded ?? [];
  const asiHere: OutstandingChoice[] = (def.asiLevels ?? [])
    .filter((lvl) => lvl > opts.from && lvl <= opts.to)
    .filter((lvl) => !recorded.some((r) => r.level === lvl && r.kind === 'asi'))
    .map((lvl) => ({ level: lvl, kind: 'asi' as const, label: `Ability Score Improvement or feat — level ${lvl}`, detail: 'Raise one ability by 2, or two by 1 each (max 20) — or take a feat.' }));
  const outstanding = [...plan.outstanding, ...asiHere].sort((a, b) => a.level - b.level);
  return { gained: gainedThisStep, outstanding, empty: gainedThisStep.length === 0 && outstanding.length === 0 };
}
