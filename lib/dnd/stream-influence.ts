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

/** Resist DC: an empty, dead chat is trivial to ignore (DC 5); a maxed, roaring chat is
 *  nearly impossible to resist (DC 30). */
export function resistDC(influence: number): number {
  return Math.round(5 + Math.max(0, Math.min(1, influence)) * 25);
}

/** At/above this the meter is "maxed" — neon pink + violent shake, DC pinned at 30. */
export const MAX_INFLUENCE = 0.97;
export function isMaxed(influence: number): boolean {
  return influence >= MAX_INFLUENCE;
}
