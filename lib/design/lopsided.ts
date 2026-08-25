// lib/design/lopsided.ts — one rule for "this record is half a page", shared by the tool and the UI.
//
// ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────────────────────────
//
// The design studio's page list reports five gaps, and **every one of them is about ABSENCE**:
// no default, no dossier, no design, no active, stale default. There was nothing for "a record
// exists and is wrong", so five records that held a fraction of their page — one of them 21
// elements against 598 — showed in the studio as complete. The only thing that found them was an
// ad-hoc SQL query somebody happened to write.
//
// The threshold lived inline in `scripts/trace-defaults.mjs`. Putting a second copy in the page
// list is exactly the shape this plan has spent a day removing: two definitions of one rule that
// agree until somebody changes one. The tracer already imports `staleness.ts` across the same
// boundary, so both can read this.
//
// ── WHY 3x, AND WHY A FLOOR ─────────────────────────────────────────────────────────────────────
//
// A page genuinely differs between 1440 and 390 — a table becomes cards, a rail collapses — so the
// threshold is deliberately generous. **A difference is layout; a MULTIPLE is a page half-drawn.**
// The floor matters just as much: without it a 2-against-7-element page reads as a catastrophe,
// and a route whose whole content is a heading and a button would sit in the queue forever.
//
// Observed on the five real ones: 28.5x, 13.2x, 10.1x, 4.8x, 3.1x — and every one of them was the
// same fault, a viewport captured before its rows arrived.

/** One viewport holding this many times the other is not a layout difference. */
export const LOPSIDED_RATIO = 3;

/** Below this, the ratio is noise: a heading and a button against a heading is not a defect. */
export const LOPSIDED_FLOOR = 10;

/**
 * Is this pair of viewport element counts evidence that one of them was captured too early?
 *
 * Deliberately answers false when either side is zero. "Nothing captured at all" is a different
 * fault with a different fix, and reporting it here would put one record in two queues — the same
 * reason `no-default` and `stale-default` are never both raised.
 */
export function isLopsided(desktop: number, mobile: number): boolean {
  const hi = Math.max(desktop, mobile);
  const lo = Math.min(desktop, mobile);
  if (lo <= 0 || hi < LOPSIDED_FLOOR) return false;
  return hi / lo >= LOPSIDED_RATIO;
}

/** How far apart they are, for a message a person can act on. `0` when they are not lopsided. */
export function lopsidedRatio(desktop: number, mobile: number): number {
  if (!isLopsided(desktop, mobile)) return 0;
  return Math.max(desktop, mobile) / Math.min(desktop, mobile);
}
