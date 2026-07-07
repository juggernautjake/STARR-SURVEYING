// Patron-influence meter (Phase J11). The streamer's live chat IS her patron deity:
// the bigger the audience, the harder it is for her to resist their demands. The "resist
// the chat" DC is set purely by the live VIEWER COUNT via a fixed tier table (DC 2–25);
// `computeInfluence` (viewers + the DM's engagement dial) survives only to drive the
// meter's visual energy (how hard the bar bobs), not the DC. Pure so it's unit-tested and
// shared by the meter UI + the resist roll.

/** 1 viewer → 0 … 1e15 (a quadrillion) → 1. */
export function viewerFactor(viewers: number): number {
  return Math.max(0, Math.min(1, Math.log10(Math.max(1, viewers)) / 15));
}

/** Blend viewers + engagement into 0..1 influence — used ONLY for the meter's visual
 *  energy (bob amplitude / glow), not the resist DC (that's `viewerDC`). Engagement is
 *  weighted a little higher since it's the DM's direct "how hyped is chat" dial. */
export function computeInfluence(viewers: number, engagement: number): number {
  const v = viewerFactor(viewers);
  const e = Math.max(0, Math.min(100, engagement)) / 100;
  return Math.max(0, Math.min(1, 0.45 * v + 0.55 * e));
}

// Resist DC tiers — [inclusive max viewers, DC]. The chat's resist DC is set purely by
// how many people are watching: a handful of viewers is trivial to ignore (DC 2); a
// billion-plus roaring audience is all but irresistible (DC 25). Anything above the last
// tier's max is the DC 25 ceiling. Authored to the DM's exact table so the numbers match
// what he expects at every viewer milestone.
const DC_TIERS: readonly [number, number][] = [
  [100, 2], [500, 3], [1_000, 4], [5_000, 5], [10_000, 6], [25_000, 7], [50_000, 8],
  [75_000, 9], [125_000, 10], [250_000, 11], [500_000, 12], [750_000, 13], [1_000_000, 14],
  [2_000_000, 15], [5_000_000, 16], [7_500_000, 17], [10_000_000, 18], [20_000_000, 19],
  [50_000_000, 20], [100_000_000, 21], [200_000_000, 22], [500_000_000, 23], [1_000_000_000, 24],
];

/** Resist DC (2–25) set purely by the live viewer count, per the tier table above.
 *  1–100 → 2, 101–500 → 3, …, 500,000,001–1,000,000,000 → 24, and 1,000,000,001+ → 25. */
export function viewerDC(viewers: number): number {
  const v = Math.max(0, Math.floor(viewers || 0));
  for (const [maxV, dc] of DC_TIERS) if (v <= maxV) return dc;
  return 25;
}

/** The DC ceiling — at/above this the meter goes neon-pink + shakes ("irresistible"). */
export const MAX_DC = 25;

// ── Live-activity engagement boost ──────────────────────────────────────────────
// The DM's engagement dial is the *floor*; live activity (reactions, subs/donations/
// raids, and chat volume) transiently pushes engagement — and thus the resist DC —
// higher, then decays back down. This is what makes the meter bob organically off real
// audience energy, not just the slider.
export type EngagementEvent = 'reaction' | 'sub' | 'resub' | 'donation' | 'raid' | 'chat';

export function engagementBoostFor(kind: EngagementEvent): number {
  switch (kind) {
    case 'raid': return 20;
    case 'donation': return 15;
    case 'resub': return 10;
    case 'sub': return 8;
    case 'reaction': return 2.5;
    case 'chat': return 0.4;
  }
}

/** Max transient boost stacked on top of the DM's engagement floor. */
export const ENGAGEMENT_BOOST_CAP = 60;
/** Per-tick (~400 ms) multiplicative decay of the boost back toward 0. */
export const ENGAGEMENT_DECAY = 0.9;
