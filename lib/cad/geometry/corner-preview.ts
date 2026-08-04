// lib/cad/geometry/corner-preview.ts — what a fillet or chamfer WILL do, before it does it.
//
// CAD_AUDIT — the first extraction out of `CanvasViewport.tsx` (15,494 lines).
//
// ── WHY THESE FUNCTIONS EXIST AT ALL, GIVEN operations.ts ALREADY DOES THIS ─────────────────────
//
// `filletTwoLines` and `chamferTwoLines` in `lib/cad/operations.ts` compute the same geometry — and
// then delete two features, add three, and push an undo entry. They cannot be called to draw a
// hover preview, because calling them *performs the edit*. So the preview needs the arithmetic
// without the commit, and that is what these are.
//
// **That makes them a second implementation of a rule, which is this codebase's most expensive
// defect shape.** The danger is specific and worse than it sounds: they do not have to disagree
// about the *answer* to hurt someone — it is enough that they disagree about *whether there is
// one*. A preview that draws an arc the commit then refuses ("radius too large for these lines")
// makes the tool look broken; a preview that refuses to draw a corner the commit would happily cut
// makes a usable operation look impossible, and the surveyor simply stops trying.
//
// The split is kept — merging them means either the preview mutating the document or the operation
// growing a `dryRun` flag, and a flag that half-runs a mutation is worse than two functions —
// **but it is now pinned by a differential test** (`__tests__/cad/corner-preview.test.ts`) that runs
// both against the same lines and requires them to agree on the answer AND on the refusal. Before
// this extraction they could not be compared at all: both previews were private functions inside a
// 15k-line `'use client'` component, unreachable from any test.
//
// Everything here is pure: no Pixi, no React, no store. Screen-space and drawing concerns stay in
// the component.

import type { Point2D } from '@/lib/cad/types';

/** Tolerance shared with `operations.ts`, where the same three guards live. Kept identical on
 *  purpose — a preview that accepts a hair more than the commit does is exactly the disagreement
 *  this module is at risk of. */
const PARALLEL_EPS = 1e-10;
const DEGENERATE_EPS = 1e-9;
/** The leg must be long enough to absorb the trim, with a hair of slack. */
const LENGTH_EPS = 1e-6;

export interface FilletPreview {
  center: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
  anticlockwise: boolean;
  tangent1: Point2D;
  tangent2: Point2D;
}

export interface ChamferPreview {
  tangent1: Point2D;
  tangent2: Point2D;
}

/**
 * Which endpoint of a line the surveyor is keeping: the one their click landed nearer.
 *
 * Exported because the same convention decides the answer in both operations, and a caller that
 * re-derives it slightly differently gets a corner cut off the wrong leg.
 */
export function keepEndOf(a: Point2D, b: Point2D, click: Point2D): Point2D {
  const dStart = Math.hypot(click.x - a.x, click.y - a.y);
  const dEnd = Math.hypot(click.x - b.x, click.y - b.y);
  return dEnd < dStart ? b : a;
}

/** Infinite-line intersection, or null when the lines are parallel. */
function intersect(l1a: Point2D, l1b: Point2D, l2a: Point2D, l2b: Point2D): Point2D | null {
  const denom = (l1a.x - l1b.x) * (l2a.y - l2b.y) - (l1a.y - l1b.y) * (l2a.x - l2b.x);
  if (Math.abs(denom) < PARALLEL_EPS) return null;
  const t = ((l1a.x - l2a.x) * (l2a.y - l2b.y) - (l1a.y - l2a.y) * (l2a.x - l2b.x)) / denom;
  return { x: l1a.x + t * (l1b.x - l1a.x), y: l1a.y + t * (l1b.y - l1a.y) };
}

/** Unit direction from the intersection toward the kept endpoint, or null when the click sits
 *  effectively on the intersection and there is no leg to point at. */
function keepDir(P: Point2D, a: Point2D, b: Point2D, click: Point2D): Point2D | null {
  const keepEnd = keepEndOf(a, b, click);
  const dx = keepEnd.x - P.x;
  const dy = keepEnd.y - P.y;
  const len = Math.hypot(dx, dy);
  if (len < PARALLEL_EPS) return null;
  return { x: dx / len, y: dy / len };
}

/**
 * The arc a FILLET would insert: centre, radius, sweep and the two tangent points, so the canvas
 * can sketch it under the cursor.
 *
 * Returns null for every input the commit would refuse — parallel lines, a wedge with no corner,
 * and a radius the legs are too short to absorb. Null is not "nothing to draw": it is the same
 * verdict `filletTwoLines` reaches, arrived at without touching the document.
 */
export function computeFilletPreview(
  l1a: Point2D,
  l1b: Point2D,
  click1: Point2D,
  l2a: Point2D,
  l2b: Point2D,
  click2: Point2D,
  radius: number,
): FilletPreview | null {
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const P = intersect(l1a, l1b, l2a, l2b);
  if (!P) return null;

  const u1 = keepDir(P, l1a, l1b, click1);
  const u2 = keepDir(P, l2a, l2b, click2);
  if (!u1 || !u2) return null;

  // Half-angle θ of the wedge the surveyor kept, via half-angle identities rather than atan — same
  // derivation as the commit, so the two agree at the degenerate boundaries as well as in the middle.
  let cos2t = u1.x * u2.x + u1.y * u2.y;
  cos2t = Math.max(-1, Math.min(1, cos2t));
  // Same direction (no corner) or anti-parallel (the legs run through each other).
  if (cos2t > 1 - DEGENERATE_EPS || cos2t < -1 + DEGENERATE_EPS) return null;
  const sinT = Math.sqrt((1 - cos2t) / 2);
  const cosT = Math.sqrt((1 + cos2t) / 2);
  if (sinT < DEGENERATE_EPS || cosT < DEGENERATE_EPS) return null;
  const t = radius / (sinT / cosT);

  const tangent1 = { x: P.x + t * u1.x, y: P.y + t * u1.y };
  const tangent2 = { x: P.x + t * u2.x, y: P.y + t * u2.y };

  // The tangent point must land between the corner and the kept endpoint. A radius bigger than the
  // legs can absorb would otherwise preview an arc floating past the end of the line.
  const k1 = keepEndOf(l1a, l1b, click1);
  const k2 = keepEndOf(l2a, l2b, click2);
  const len1 = Math.hypot(k1.x - P.x, k1.y - P.y);
  const len2 = Math.hypot(k2.x - P.x, k2.y - P.y);
  if (t > len1 - LENGTH_EPS || t > len2 - LENGTH_EPS) return null;

  // The bisector: the sum of two unit vectors lies along it.
  const bx = u1.x + u2.x;
  const by = u1.y + u2.y;
  const blen = Math.hypot(bx, by);
  if (blen < PARALLEL_EPS) return null;
  const centerDist = radius / sinT;
  const center = { x: P.x + centerDist * (bx / blen), y: P.y + centerDist * (by / blen) };

  const startAngle = Math.atan2(tangent1.y - center.y, tangent1.x - center.x);
  const endAngle = Math.atan2(tangent2.y - center.y, tangent2.x - center.x);

  // Sweep direction is chosen so the arc bulges back toward the corner — the minor arc. Taking the
  // other one would draw a preview looping the long way round the circle, which is a legal arc and
  // not the corner anyone asked for.
  const arcMid = (cw: boolean) => {
    let s = startAngle;
    let e = endAngle;
    if (!cw) {
      if (e <= s) e += 2 * Math.PI;
    } else {
      if (s <= e) s += 2 * Math.PI;
      [s, e] = [e, s];
    }
    const m = (s + e) / 2;
    return { x: center.x + radius * Math.cos(m), y: center.y + radius * Math.sin(m) };
  };
  const midCcw = arcMid(false);
  const midCw = arcMid(true);
  const dCcw = Math.hypot(midCcw.x - P.x, midCcw.y - P.y);
  const dCw = Math.hypot(midCw.x - P.x, midCw.y - P.y);

  return {
    center,
    radius,
    startAngle,
    endAngle,
    anticlockwise: dCcw < dCw,
    tangent1,
    tangent2,
  };
}

/**
 * The bevel a CHAMFER would insert: the two trim points, which are also the ends of the new line.
 *
 * Far simpler than fillet — no arc — but it refuses on the same grounds, and for the same reason:
 * a preview that draws a bevel the commit rejects is a tool that looks broken.
 */
export function computeChamferPreview(
  l1a: Point2D,
  l1b: Point2D,
  click1: Point2D,
  l2a: Point2D,
  l2b: Point2D,
  click2: Point2D,
  dist1: number,
  dist2: number,
): ChamferPreview | null {
  if (!Number.isFinite(dist1) || dist1 <= 0 || !Number.isFinite(dist2) || dist2 <= 0) return null;
  const P = intersect(l1a, l1b, l2a, l2b);
  if (!P) return null;

  const u1 = keepDir(P, l1a, l1b, click1);
  const u2 = keepDir(P, l2a, l2b, click2);
  if (!u1 || !u2) return null;

  const k1 = keepEndOf(l1a, l1b, click1);
  const k2 = keepEndOf(l2a, l2b, click2);
  const len1 = Math.hypot(k1.x - P.x, k1.y - P.y);
  const len2 = Math.hypot(k2.x - P.x, k2.y - P.y);
  if (dist1 > len1 - LENGTH_EPS || dist2 > len2 - LENGTH_EPS) return null;

  return {
    tangent1: { x: P.x + dist1 * u1.x, y: P.y + dist1 * u1.y },
    tangent2: { x: P.x + dist2 * u2.x, y: P.y + dist2 * u2.y },
  };
}
