// app/admin/research/[projectId]/_sections/traverse-geometry.ts — Phase B1a.
//
// ── THIS FILE USED TO CONTAIN THE GEOMETRY. THAT WAS A MISTAKE. ─────────────────────────────────
//
// The previous slice extracted the traverse maths out of `page.tsx` and tested it — and wrote a
// SECOND implementation of coordinate geometry this repository already had. `lib/cad/geometry/
// bearing.ts` has carried `forwardPoint`, `inverseBearingDistance`, `azimuthToQuadrant` and
// `formatBearing` all along, with its own tests, used by five CAD components.
//
// So the extraction fixed "untested" and introduced "duplicated", which is the worse of the two: a
// second copy of a coordinate convention drifts, and the page's copy is the one that would run.
// Exactly what the commit message for that slice warned about, committed in the same slice.
//
// Found by grepping for `Math.sin(rad)` across the repo while chasing a THIRD copy in
// `handleUpdateVertex` — the search that should have run before writing any of it.
//
// What is left here is the part that is genuinely research-specific and has no equivalent in the
// CAD library: when a traverse should be closed at all.

import { inverseBearingDistance } from '@/lib/cad/geometry/bearing';

export interface TraversePoint {
  x: number;
  y: number;
}

/** Tolerance below which a traverse is already closed, in drawing units. */
export const CLOSED_TOLERANCE = 0.01;

/**
 * Should a closing leg be added at all?
 *
 * Two guards, and both matter:
 *
 *   · **At least three vertices.** Two points are a line, and "closing" them retraces the same leg
 *     backwards — a second leg on top of the first, in the report and in the drawing.
 *   · **Not already closed.** Adding a zero-length leg puts a duplicate vertex on the first corner,
 *     which shows in the deliverable as a leg of 0.00 feet.
 *
 * Neither is in `lib/cad/geometry` because neither is geometry — they are decisions about when this
 * panel should act, which is why this function stayed here when the maths went back.
 */
export function needsClosing(vertices: readonly TraversePoint[]): boolean {
  if (vertices.length < 3) return false;
  const { distance } = inverseBearingDistance(vertices[0], vertices[vertices.length - 1]);
  return distance >= CLOSED_TOLERANCE;
}
