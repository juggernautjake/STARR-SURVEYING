// lib/cad/sheet/title-block-hit-test.ts — which piece of sheet furniture is under the cursor.
//
// CAD_AUDIT S19b — the second extraction out of `CanvasViewport.tsx`.
//
// ── WHY THIS ONE, AND WHAT IT COST WHERE IT WAS ─────────────────────────────────────────────────
//
// This is twenty lines of rectangle arithmetic, and it was already `export`ed from a **15,000-line
// `'use client'` component** — which meant its test imported that component to reach it, dragging
// Pixi, the drawing store, the tooltip context and every other import in the file into the module
// graph to answer "is this point inside that box".
//
// That is the second cost of a file this size, after the one S19a named. The first is that code
// inside it cannot be tested at all; this is the mirror image — code that CAN be tested, at the
// price of loading a renderer to do it.
//
// ── THE ORDER OF THE CHECKS IS THE BEHAVIOUR ────────────────────────────────────────────────────
//
// Sheet furniture overlaps. The seal label sits inside the signature block; the certification and
// notes blocks are large and sit under everything. So the sequence below is not stylistic — it
// decides what a surveyor grabs when two things are under the pointer, and reordering it silently
// makes the small, specific targets unreachable. It is asserted as a sequence in the tests rather
// than only case by case.

/** A screen-space box, or null when that element is not on the sheet. */
export interface TBRect {
  screenX: number;
  screenY: number;
  w: number;
  h: number;
}

export type TBElementBounds = {
  northArrow: TBRect | null;
  titleBlock: TBRect | null;
  scaleBar: TBRect | null;
  signatureBlock: TBRect | null;
  officialSealLabel: TBRect | null;
  certification: TBRect | null;
  notes: TBRect | null;
};

export type TBHitTarget =
  | 'northArrow'
  | 'titleBlock'
  | 'scaleBar'
  | 'signatureBlock'
  | 'officialSealLabel'
  | 'certification'
  | 'notes';

/** Inclusive on all four edges — a click exactly on the border belongs to the element. */
function inside(sx: number, sy: number, r: TBRect | null): boolean {
  if (!r) return false;
  return sx >= r.screenX && sx <= r.screenX + r.w
      && sy >= r.screenY && sy <= r.screenY + r.h;
}

/**
 * The sheet element under a screen point, or null.
 *
 * Pure: screen coordinates in, a name out. No store, no Pixi, no React.
 */
export function hitTestTBElementPure(
  sx: number,
  sy: number,
  b: TBElementBounds,
): TBHitTarget | null {
  if (inside(sx, sy, b.northArrow)) return 'northArrow';
  if (inside(sx, sy, b.titleBlock)) return 'titleBlock';
  if (inside(sx, sy, b.scaleBar))   return 'scaleBar';
  // Sub-elements above their containing signature block so they take priority on the way in.
  if (inside(sx, sy, b.officialSealLabel)) return 'officialSealLabel';
  if (inside(sx, sy, b.signatureBlock))    return 'signatureBlock';
  // Slice 226 — paper-furniture blocks tested last so they do not shadow the more-specific TB
  // elements on overlap.
  if (inside(sx, sy, b.certification)) return 'certification';
  if (inside(sx, sy, b.notes))         return 'notes';
  return null;
}

/** The order the elements are tested in, exported so a test can assert the SEQUENCE rather than
 *  re-deriving it — a priority rule checked only case by case can be reordered without any case
 *  failing, which is how a small target ends up permanently unclickable. */
export const TB_HIT_PRIORITY: readonly TBHitTarget[] = [
  'northArrow',
  'titleBlock',
  'scaleBar',
  'officialSealLabel',
  'signatureBlock',
  'certification',
  'notes',
];
