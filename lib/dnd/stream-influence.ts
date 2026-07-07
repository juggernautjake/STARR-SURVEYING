// Patron-influence meter (Phase J11). The streamer's live chat IS her patron deity:
// the more engaged the audience, the harder it is for her to resist their demands.
// `influence` (0..1) blends the viewer count (log-scaled all the way to quadrillions)
// with the DM's engagement dial (0..100), and maps to a "resist the chat" DC. The DM
// controls both inputs, so he controls the whole meter. Pure so it's unit-tested and
// shared by the meter UI + any future save-roll integration.

/** 1 viewer → 0 … 1e15 (a quadrillion) → 1. */
export function viewerFactor(viewers: number): number {
  return Math.max(0, Math.min(1, Math.log10(Math.max(1, viewers)) / 15));
}

/** Blend viewers + engagement into 0..1 influence (engagement weighted a little higher
 *  since it's the DM's direct "how hyped is chat" dial). */
export function computeInfluence(viewers: number, engagement: number): number {
  const v = viewerFactor(viewers);
  const e = Math.max(0, Math.min(100, engagement)) / 100;
  return Math.max(0, Math.min(1, 0.45 * v + 0.55 * e));
}

/** Resist DC (2–25): an empty, dead chat is trivial to ignore (DC 2); a maxed, roaring
 *  chat of quadrillions is nearly impossible to resist (DC 25). Scales continuously with
 *  both the viewer count and the engagement dial via `influence`. */
export function resistDC(influence: number): number {
  return Math.round(2 + Math.max(0, Math.min(1, influence)) * 23);
}

/** At/above this the meter is "maxed" — neon pink + violent shake, DC at its 25 ceiling. */
export const MAX_INFLUENCE = 0.97;
export function isMaxed(influence: number): boolean {
  return influence >= MAX_INFLUENCE;
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
