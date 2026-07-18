// lib/dnd/mechanics/exhaustion.ts — Phase 2, Area M1 (configurable mechanics). Exhaustion, as pure
// functions the sheet store consumes. OWNER DECISION (2026-07-17): the 2014 tiered table is the MAIN model
// for the 2014 edition (implemented programmatically here), while a flat −2/level is a selectable option
// that is also fully hooked up.
//
//  · `vanilla`         → the edition's rules-as-written:
//        2014 = the 6-tier table (disadvantage-based, cumulative);
//        2024 = −2 to every d20 test per level of exhaustion.
//  · `flat-2-per-level`→ always −2 to every d20 test per level, regardless of edition (the popular option).
import type { ExhaustionModel } from '../preferences';

/** Which kind of d20 test is being made — exhaustion hits them differently under the 2014 tiered table. */
export type ExhaustionKind = 'check' | 'attack' | 'save';
export type Edition = '2014' | '2024';

/** The effect of exhaustion on a single d20 test: a flat penalty to add and/or disadvantage to impose. */
export interface ExhaustionD20 {
  /** Added to the d20 total (≤ 0). The flat model / 2024 use this; the 2014 tiered table does not. */
  penalty: number;
  /** Whether this test is made at disadvantage (the 2014 tiered table's mechanism). */
  disadvantage: boolean;
}

const clampLevel = (level: number): number => Math.max(0, Math.min(6, Math.floor(level || 0)));

/**
 * How exhaustion affects one d20 test. Level is clamped to 0–6.
 *
 * Flat model (or 2024 vanilla): −2 × level on every kind of test, no disadvantage.
 * 2014 vanilla (the tiered table): NO flat penalty; instead disadvantage —
 *   · ability checks at level ≥ 1 (tier 1),
 *   · attack rolls and saving throws at level ≥ 3 (tier 3).
 */
export function exhaustionD20Effect(kind: ExhaustionKind, level: number, edition: Edition, model: ExhaustionModel): ExhaustionD20 {
  const lv = clampLevel(level);
  if (lv === 0) return { penalty: 0, disadvantage: false };
  if (model === 'flat-2-per-level' || edition === '2024') {
    return { penalty: -2 * lv, disadvantage: false };
  }
  // 2014 vanilla → tiered disadvantage.
  const disadvantage = kind === 'check' ? lv >= 1 : lv >= 3; // attack/save at tier 3
  return { penalty: 0, disadvantage };
}

/**
 * Speed penalty from exhaustion (feet). 2024/flat: −5 ft per level. 2014 tiered: speed halved at tier 2,
 * reduced to 0 at tier 5 — returned as a MULTIPLIER-free flat number is ambiguous, so speed is modeled
 * separately: see `exhaustionSpeedFactor`. This helper is the 2024/flat linear penalty only.
 */
export function exhaustionSpeedPenalty(level: number, edition: Edition, model: ExhaustionModel): number {
  const lv = clampLevel(level);
  if (lv === 0) return 0;
  if (model === 'flat-2-per-level' || edition === '2024') return -5 * lv;
  return 0; // 2014 uses a factor, not a flat penalty (see exhaustionSpeedFactor)
}

/**
 * The 2014 tiered speed factor: ×1 below tier 2, ×0.5 at tiers 2–4, ×0 at tier 5+. For the 2024/flat model
 * this returns 1 (that model uses the flat `exhaustionSpeedPenalty` instead).
 */
export function exhaustionSpeedFactor(level: number, edition: Edition, model: ExhaustionModel): number {
  const lv = clampLevel(level);
  if (model === 'flat-2-per-level' || edition === '2024') return 1;
  if (lv >= 5) return 0;
  if (lv >= 2) return 0.5;
  return 1;
}

/**
 * The HP-maximum multiplier from exhaustion. 2014 tiered halves HP max at tier 4+ (×0.5). 2024/flat leaves
 * HP max alone (×1).
 */
export function exhaustionHpMaxFactor(level: number, edition: Edition, model: ExhaustionModel): number {
  const lv = clampLevel(level);
  if (model === 'flat-2-per-level' || edition === '2024') return 1;
  return lv >= 4 ? 0.5 : 1;
}

/** Whether this exhaustion level is lethal. Both editions: exhaustion 6 = death. */
export function exhaustionIsDead(level: number): boolean {
  return clampLevel(level) >= 6;
}
