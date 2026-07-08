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
/** The DC floor — a lonely chat is trivial to ignore, but never free. */
export const MIN_DC = 2;

// ── Resist-DC resolution: auto (organic) vs manual (Phase K) ──────────────────────
// The DM picks how the "resist the chat" DC is set: AUTO blends the audience with the
// room's energy (viewers set the baseline tier, engagement nudges it a few points either
// way); MANUAL pins an exact DC the DM types. Pure so it's unit-tested + shared by the
// meter UI and the resist roll.

/** Max points the engagement dial can shift the viewer-based DC in auto mode.
 *  Engagement 50 is neutral (no shift); 100 → +MAX, 0 → −MAX. */
export const DC_ENGAGEMENT_NUDGE = 4;

/** Auto (organic) resist DC: the viewer-count tier sets the baseline and the engagement
 *  dial nudges it ±DC_ENGAGEMENT_NUDGE (50 = neutral). Clamped to [MIN_DC, MAX_DC]. */
export function organicDC(viewers: number, engagement: number): number {
  const base = viewerDC(viewers);
  const e = Math.max(0, Math.min(100, engagement || 0));
  const nudge = Math.round(((e - 50) / 50) * DC_ENGAGEMENT_NUDGE);
  return Math.max(MIN_DC, Math.min(MAX_DC, base + nudge));
}

/** The effective resist DC for the current stream state. In manual mode the DM's exact
 *  value wins (clamped 2–25); otherwise it's the organic viewers+engagement blend. */
export function resolveDC(opts: {
  mode?: 'auto' | 'manual' | null;
  manual?: number | null;
  viewers: number;
  engagement: number;
}): number {
  if (opts.mode === 'manual' && opts.manual != null && Number.isFinite(Number(opts.manual))) {
    return Math.max(MIN_DC, Math.min(MAX_DC, Math.round(Number(opts.manual))));
  }
  return organicDC(opts.viewers, opts.engagement);
}

// Average ambient chat throughput (messages/second) at each resist DC — and since the DC
// is itself set by the viewer count, this makes the chat's PACE scale with the audience.
// Anchored to the DM's spec: DC 15 ≈ 1 msg/sec, DC 20 ≈ 2 msg/sec. A lonely DC-2 chat
// barely trickles (~1 every 30s); a maxed DC-25 chat is a steady flood. The caller adds
// burstiness + jitter on top so the pacing never feels metronomic.
const RATE_BY_DC: Readonly<Record<number, number>> = {
  2: 0.03, 3: 0.06, 4: 0.1, 5: 0.15, 6: 0.22, 7: 0.3, 8: 0.4, 9: 0.5, 10: 0.6, 11: 0.7,
  12: 0.8, 13: 0.88, 14: 0.94, 15: 1, 16: 1.2, 17: 1.4, 18: 1.6, 19: 1.8, 20: 2,
  21: 2.3, 22: 2.6, 23: 2.9, 24: 3.2, 25: 3.5,
};

/** Average ambient messages/second for a given resist DC (2–25). */
export function chatRatePerSec(dc: number): number {
  const d = Math.max(2, Math.min(MAX_DC, Math.round(dc)));
  return RATE_BY_DC[d] ?? 0;
}

/** Average ambient messages/second for a given live viewer count (0 viewers → 0). */
export function viewerChatRatePerSec(viewers: number): number {
  if ((viewers || 0) <= 0) return 0;
  return chatRatePerSec(viewerDC(viewers));
}

/** [min, max] viewer bounds of the DC tier containing `viewers`. Used to keep the shown
 *  (organically fluctuating) viewer count inside its tier, so the DC/pace never flicker.
 *  The top tier (1,000,000,001+) returns MAX_SAFE_INTEGER as its max. */
export function viewerTierBounds(viewers: number): [number, number] {
  const v = Math.max(0, Math.floor(viewers || 0));
  let prevMax = 0;
  for (const [maxV] of DC_TIERS) {
    if (v <= maxV) return [prevMax + 1, maxV];
    prevMax = maxV;
  }
  return [prevMax + 1, Number.MAX_SAFE_INTEGER];
}

/** The organically-fluctuating "revealed" viewer count the audience sees. It hovers
 *  around the DM's set value (viewers come + go) but is CLAMPED to the current tier so it
 *  never changes the DC/pace. 0 stays 0 and 1–15 stay exact (we track those handles by
 *  name); only 16+ drifts, by up to ~8% (a floor of ±2 for small counts). `rnd` is the
 *  caller's random in [0,1) so this stays pure/testable. */
export function fluctuateViewers(base: number, rnd: number): number {
  const v = Math.max(0, Math.floor(base || 0));
  if (v <= 15) return v;
  const [tmin, tmax] = viewerTierBounds(v);
  const spread = Math.max(2, Math.round(v * 0.08));
  const delta = Math.round((rnd * 2 - 1) * spread);
  return Math.min(tmax, Math.max(tmin, v + delta));
}

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
