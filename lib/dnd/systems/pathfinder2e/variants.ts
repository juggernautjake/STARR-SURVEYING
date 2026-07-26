// lib/dnd/systems/pathfinder2e/variants.ts — Pathfinder 2e OPTIONAL RULES VARIANTS (GM Core).
//
// PF2 ships a set of official variant rules a table may switch on. They are not house rules invented here:
// each one below is a published GM Core variant, and each is OFF by default so a vanilla table's numbers are
// untouched (the platform-wide rule: "the default way needs to be the vanilla rules").
//
// This module is the PURE model + the maths each variant changes. It is deliberately separate from
// `rules.ts` so the vanilla maths stays readable, and so a variant can never take effect unless a caller
// explicitly threads a `PF2RulesVariants` through — the whole resolve layer defaults to vanilla.
//
// Scope note (Ground Rule 3 — never invent a rule): only the variants whose exact published numbers are
// modelled here are offered. Automatic Bonus Progression and Stamina are NOT included; see the
// "deliberately not modelled" note at the bottom for why.
import { PF2_RANK_BONUS, type PF2Rank } from './model';

/** The set of optional PF2 rules a table can switch on. Every field is off/vanilla by default. */
export interface PF2RulesVariants {
  /** GM Core "Proficiency Without Level": your level is not added to proficiency-based numbers, and the
   *  rank bonuses change (untrained becomes a −2 PENALTY rather than 0). Flattens the level treadmill so
   *  low-level threats stay relevant. */
  proficiencyWithoutLevel: boolean;
  /** GM Core "Free Archetype": an EXTRA class feat at every even level, usable only for archetype feats.
   *  It does not replace the normal class feat — it is granted alongside it. */
  freeArchetype: boolean;
  /** How many Hero Points a character starts a session with. PF2 RAW is 1; some tables start at 0 or
   *  hand out more. Range 0–3 (3 is the cap at which a Hero Point can cheat death). */
  startingHeroPoints: number;
}

/** Vanilla PF2: no variants on, RAW 1 starting Hero Point. */
export const PF2_VANILLA_VARIANTS: PF2RulesVariants = {
  proficiencyWithoutLevel: false,
  freeArchetype: false,
  startingHeroPoints: 1,
};

/** PF2 caps Hero Points at 3 (spending all three is what lets you avoid death). */
export const PF2_HERO_POINT_MAX = 3;

/** Rank bonuses under Proficiency Without Level. Trained through legendary keep their normal bonus; the
 *  change is that LEVEL is not added and untrained carries a −2 penalty instead of a flat 0. */
export const PF2_RANK_BONUS_NO_LEVEL: Record<PF2Rank, number> = {
  untrained: -2, trained: 2, expert: 4, master: 6, legendary: 8,
};

/** Read a possibly-absent/partial variant set into a complete one, clamping the hero-point count. Anything
 *  invalid falls back to vanilla — a corrupt preference row can never change a character's numbers. */
export function normalizePf2Variants(raw: unknown): PF2RulesVariants {
  const r = (raw ?? {}) as Partial<Record<keyof PF2RulesVariants, unknown>>;
  const hp = Number(r.startingHeroPoints);
  return {
    proficiencyWithoutLevel: r.proficiencyWithoutLevel === true,
    freeArchetype: r.freeArchetype === true,
    startingHeroPoints: Number.isFinite(hp) ? Math.max(0, Math.min(PF2_HERO_POINT_MAX, Math.round(hp))) : 1,
  };
}

/** True when the variant set leaves every number exactly where vanilla puts it. Lets a caller skip the
 *  "variant rules in force" affordances entirely rather than showing an empty banner. */
export function isVanillaPf2Variants(v: PF2RulesVariants | undefined): boolean {
  if (!v) return true;
  return !v.proficiencyWithoutLevel && !v.freeArchetype && v.startingHeroPoints === PF2_VANILLA_VARIANTS.startingHeroPoints;
}

/**
 * The proficiency term for a rank at a level, under the given variants.
 *
 * Vanilla: 0 when untrained, else rank bonus + level (the PF2 hallmark).
 * Proficiency Without Level: the no-level rank bonus, with no level term at all — so an untrained check
 * is −2 rather than 0, and a legendary 20th-level character is +8 rather than +28.
 *
 * This is the single choke point every check, save, AC, DC and Strike goes through, which is exactly why
 * the variant is implemented here rather than at each call site.
 */
export function pf2ProficiencyTerm(rank: PF2Rank, level: number, variants?: PF2RulesVariants): number {
  if (variants?.proficiencyWithoutLevel) return PF2_RANK_BONUS_NO_LEVEL[rank];
  if (rank === 'untrained') return 0;
  return PF2_RANK_BONUS[rank] + Math.max(1, Math.min(20, Math.round(Number(level) || 1)));
}

/**
 * Adjust a level-based DC for the variants. Under Proficiency Without Level the published guidance is to
 * subtract the subject's level from a level-based DC, so that the DC scale flattens in step with the
 * character numbers that lost their level term. Vanilla returns the DC unchanged.
 */
export function pf2AdjustLevelDc(dc: number, level: number, variants?: PF2RulesVariants): number {
  if (!variants?.proficiencyWithoutLevel) return dc;
  return dc - Math.max(0, Math.min(20, Math.round(Number(level) || 0)));
}

/**
 * The levels at which Free Archetype grants its EXTRA (archetype-only) class feat: every even level, 2
 * through 20. Empty when the variant is off.
 */
export function pf2FreeArchetypeLevels(variants?: PF2RulesVariants): number[] {
  if (!variants?.freeArchetype) return [];
  const out: number[] = [];
  for (let l = 2; l <= 20; l += 2) out.push(l);
  return out;
}

/** How many extra archetype feats a character of this level has accrued under Free Archetype. */
export function pf2FreeArchetypeFeatCount(level: number, variants?: PF2RulesVariants): number {
  if (!variants?.freeArchetype) return 0;
  const L = Math.max(1, Math.min(20, Math.round(Number(level) || 1)));
  return Math.floor(L / 2);
}

/**
 * Bridge the platform-wide preference layer to this system's variant set. THIS is where the three
 * PF2-tagged preferences stop being settings and start being rules — every number on a PF2 sheet is
 * computed from what this returns.
 *
 * The fields are read out one by one, by name, rather than through a dynamic key lookup. That is
 * deliberate: `preferences-consumed.test.ts` greps for a literal `preferences.<key>.value` to prove a
 * setting is not defined-but-unread, and a dynamic read would defeat a guard that exists precisely to
 * catch a control that silently does nothing. Anything missing or malformed falls back to vanilla.
 */
export function pf2VariantsFromPreferences(preferences: Partial<PF2PreferenceView> | undefined | null): PF2RulesVariants {
  // Filled out against an all-absent baseline first, so each read below can be a plain, greppable
  // `prefs.<field>.value` rather than an optional chain — the guard regex looks for exactly that, and a
  // partial or absent preference set must not throw here.
  const prefs: PF2PreferenceView = { ...ABSENT_PREFERENCES, ...(preferences ?? {}) };
  return normalizePf2Variants({
    proficiencyWithoutLevel: prefs.proficiencyWithoutLevel.value === 'on',
    freeArchetype: prefs.freeArchetype.value === 'on',
    startingHeroPoints: Number(prefs.startingHeroPoints.value ?? 1),
  });
}

/** Every field unset — the baseline a partial preference set is layered over. */
const ABSENT_PREFERENCES: PF2PreferenceView = {
  proficiencyWithoutLevel: { value: undefined },
  freeArchetype: { value: undefined },
  startingHeroPoints: { value: undefined },
};

/** The narrow slice of `EffectivePreferences` this engine reads. Declared structurally rather than by
 *  importing the platform type, so the PF2 subsystem still owes nothing to the campaign/player layer. */
export interface PF2PreferenceView {
  proficiencyWithoutLevel: { value: unknown };
  freeArchetype: { value: unknown };
  startingHeroPoints: { value: unknown };
}

/** A short, human list of the variants in force — for the sheet's "variant rules" note. */
export function describePf2Variants(v: PF2RulesVariants | undefined): string[] {
  if (!v) return [];
  const out: string[] = [];
  if (v.proficiencyWithoutLevel) out.push('Proficiency without level — your level is not added to checks, saves, AC or DCs');
  if (v.freeArchetype) out.push('Free archetype — an extra archetype-only class feat at every even level');
  if (v.startingHeroPoints !== PF2_VANILLA_VARIANTS.startingHeroPoints) {
    out.push(`Starting Hero Points: ${v.startingHeroPoints} (RAW is ${PF2_VANILLA_VARIANTS.startingHeroPoints})`);
  }
  return out;
}

// ── Deliberately not modelled ─────────────────────────────────────────────────────────────────────
//
// **Automatic Bonus Progression** and **Stamina** are the two other GM Core variants the settings plan
// listed. They are NOT implemented here, on purpose:
//
//  - ABP replaces item bonuses with a per-level table of inherent bonuses (attack/defence/save/skill
//    potency, devastating attacks). Getting a single row of that table wrong silently misprices every
//    number on the sheet, and the table has to be transcribed from GM Core — exactly the situation
//    Ground Rule 3 ("never invent a rule") exists for.
//  - Stamina restructures HP itself (half class HP to HP, the rest to a Stamina pool, plus Resolve
//    Points), so it changes `pf2MaxHp` and the whole damage path rather than adding a modifier.
//
// Both are real and worth building; both need the published tables in hand first. Offering a toggle that
// computes approximately-right numbers would be worse than not offering it, because a player would trust it.
