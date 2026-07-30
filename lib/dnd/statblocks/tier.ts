// lib/dnd/statblocks/tier.ts — CR ↔ level, and the reason it is not simply a cast (N1-4).
//
// A creature's tier is the one number that decides every derived number after it. Getting it wrong by one
// step is not a rounding error: at the low end of both systems a single step roughly DOUBLES hit points, so
// a CR ½ read as level 1 is a creature with twice the HP it should have, and the derived block would be
// wrong in a way that only shows up when a party dies to a wolf.
//
// ── THE BASIS, WRITTEN DOWN (N2) ────────────────────────────────────────────────────────────────────
//
// Both systems intend the same reading — *a creature of tier X is a fair single-creature fight for a party
// of level X* — so across the shared range the map is identity, and pretending otherwise would be inventing
// a conversion neither system asks for.
//
// The two ends are where they genuinely differ:
//
//   · **Below 1.** 5e prints fractions (⅛, ¼, ½) because CR 0 and CR 1 are its floor and ceiling for
//     "trivial". Pathfinder 2e prints INTEGERS BELOW ZERO (−1, 0) for the same span. There is no fraction
//     in PF2 to map ¼ onto, so the fractions map onto that integer run — ⅛ and ¼ to −1, ½ to 0 — and back
//     the other way −1 → ¼ and 0 → ½. Not a round trip, and it cannot be: three values do not fit in two.
//     `crToLevel(0.125) === crToLevel(0.25)` is a fact about the systems, not a bug in this file.
//
//   · **Above 20.** 5e's table runs to CR 30; PF2's creature levels run to 24 (a level-20 party's
//     "extreme" encounter is level 24). Beyond that both are extrapolation, so the map CLAMPS rather than
//     continuing a line neither system draws. A clamped tier is visible in the derived block's note.
//
// This file states the mapping and nothing else — no numbers come from it. The numbers come from
// `tiers.ts`, which is measured from the corpus.
import { DND5E_TIERS, PF2_TIERS, type TierRow } from './tiers';
import type { BestiarySystem } from '@/lib/dnd/bestiary/transpose';

/** 5e's sub-1 challenge ratings, in the order they appear on a stat block. */
export const FRACTIONAL_CRS = [0.125, 0.25, 0.5] as const;

/** The lowest and highest tier each scale actually prints. Outside these, a derived block is extrapolating. */
export const TIER_RANGE: Record<'dnd' | 'pf2', { min: number; max: number }> = {
  // 5e: CR 0 through CR 30.
  dnd: { min: 0, max: 30 },
  // PF2: creature level −1 through 24.
  pf2: { min: -1, max: 24 },
};

/** Which table a system reads. IG has no published creature-building table — see `nativeScaleFor`. */
export type TierScale = 'dnd' | 'pf2';

/**
 * The scale a system's numbers live on, or `null` where the system publishes no creature-building table.
 *
 * `intuitive-games` returns null DELIBERATELY (N1-3): IG publishes no such table, and inventing one is
 * exactly what this phase forbids. A caller that gets null must fall back to transposition and say so,
 * rather than quietly borrowing 5e's numbers and presenting them as IG's.
 */
export function nativeScaleFor(system: BestiarySystem | string): TierScale | null {
  if (system === 'pathfinder2e') return 'pf2';
  if (system === 'dnd5e-2014' || system === 'dnd5e-2024') return 'dnd';
  return null;
}

/** Parse a stat block's `cr` string — "1/4", "13", "-1", "—" — to a number, or null if it says nothing. */
export function parseTier(cr: string | number | null | undefined): number | null {
  if (typeof cr === 'number') return Number.isFinite(cr) ? cr : null;
  if (typeof cr !== 'string') return null;
  const s = cr.trim();
  if (!s) return null;

  // "1/4", "1/8", "1/2" — 5e's fractions, and the only place a slash appears in a tier.
  const frac = /^(-?\d+)\s*\/\s*(\d+)$/.exec(s);
  if (frac) {
    const d = Number(frac[2]);
    return d === 0 ? null : Number(frac[1]) / d;
  }

  // Strip a leading "CR " / "Level " and any trailing XP the source appended ("5 (1,800 XP)").
  const m = /^(?:cr|level|lvl)?\s*(-?\d+(?:\.\d+)?)/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  // `Number('')` is 0 and `isFinite(0)` is true — the bug that shipped a table of zeroes in N1-1. The regex
  // above cannot match empty, but the guard stays because this function is the one every caller trusts.
  return Number.isFinite(n) ? n : null;
}

/**
 * The mapping itself, WITHOUT clamping — separated so `mapTier` can tell "CR 30 maps to level 30" from
 * "…and level 30 does not exist". Folding the clamp in here made the two indistinguishable, and a clamp
 * nobody can detect is a silent one.
 */
function convert(tier: number, from: TierScale, to: TierScale): number {
  if (from === to) return tier;
  if (from === 'dnd') {
    // The fractional run collapses onto PF2's two sub-1 integers. ⅛ and ¼ are both "barely a threat";
    // ½ is "one PC could lose to this", which is what PF2 level 0 means. 0.375 is the midpoint of ¼ and ½.
    if (tier < 0.375) return -1;
    if (tier < 1) return 0;
    return Math.round(tier);
  }
  if (tier <= -1) return 0.25;
  if (tier === 0) return 0.5;
  return Math.round(tier);
}

/** 5e challenge rating → Pathfinder 2e creature level, held inside the range PF2 prints. */
export function crToLevel(cr: number): number {
  return clampTier(convert(cr, 'dnd', 'pf2'), 'pf2');
}

/** Pathfinder 2e creature level → 5e challenge rating, held inside the range 5e prints. */
export function levelToCr(level: number): number {
  return clampTier(convert(level, 'pf2', 'dnd'), 'dnd');
}

/** Hold a tier inside the range its own system actually prints. */
export function clampTier(tier: number, scale: TierScale): number {
  const { min, max } = TIER_RANGE[scale];
  return Math.min(max, Math.max(min, tier));
}

/**
 * A source creature's tier, expressed on the target system's scale.
 *
 * Returns the tier AND whether it had to be clamped, because "CR 30 became level 24" is something the
 * derived block has to be able to say. A silent clamp is how a stat block claims a fidelity it does not
 * have.
 */
export function mapTier(
  tier: number,
  from: TierScale,
  to: TierScale,
): { tier: number; clamped: boolean } {
  const raw = convert(tier, from, to);
  const held = clampTier(raw, to);
  return { tier: held, clamped: held !== raw };
}

/**
 * The measured row for a tier, or the nearest one that exists.
 *
 * `tiers.ts` omits tiers measured from fewer than three creatures, so a lookup can legitimately miss. The
 * nearest row is a better answer than nothing — but the caller is told the distance, so a block derived
 * from a row two tiers away can say so rather than implying a measurement that was never taken.
 */
export function rowFor(tier: number, scale: TierScale): { row: TierRow; exact: boolean } | null {
  const table = scale === 'pf2' ? PF2_TIERS : DND5E_TIERS;
  if (!table.length) return null;

  let best = table[0];
  let bestGap = Math.abs(best.tier - tier);
  for (const r of table) {
    const gap = Math.abs(r.tier - tier);
    // `<` not `<=`, so the FIRST (lowest) of two equidistant rows wins and the result is deterministic
    // rather than dependent on table order.
    if (gap < bestGap) { best = r; bestGap = gap; }
  }
  return { row: best, exact: bestGap === 0 };
}

/** How a tier is written on a stat block for its system: 5e prints fractions, PF2 prints integers. */
export function formatTier(tier: number, scale: TierScale): string {
  if (scale === 'pf2') return String(Math.round(tier));
  if (tier === 0.125) return '1/8';
  if (tier === 0.25) return '1/4';
  if (tier === 0.5) return '1/2';
  return String(tier);
}
