// lib/cad/io/trv-geometry.ts
//
// trv-full-support — the plane geometry shared by the TRV model, the
// Forge importer and the file-viewer preview. World frame throughout:
// x = Easting, y = Northing (Y-up), angles in radians from +x,
// counter-clockwise positive — the same convention as `ArcGeometry` in
// lib/cad/types.ts.
//
// Pure: no DOM, no React, no store.

export interface XY { x: number; y: number }

/** A circular arc between two points, fully resolved. */
export interface TrvArc {
  /** Start point (PC) and end point (PT). */
  start: XY;
  end: XY;
  center: XY;
  radius: number;
  /** Radians, from +x, CCW positive. */
  startAngle: number;
  endAngle: number;
  /** True when the arc runs counter-clockwise from start to end. */
  anticlockwise: boolean;
  /** Central angle Δ in radians (always positive). */
  delta: number;
  /** Arc length. */
  length: number;
  /** Chord length. */
  chord: number;
  /** Point halfway along the arc (where TPC centres a curve label). */
  mid: XY;
}

/** Build the arc from `start` to `end` with Traverse PC's signed radius:
 *  NEGATIVE → centre on the LEFT of start→end (counter-clockwise),
 *  POSITIVE → centre on the RIGHT (clockwise). The minor arc is used
 *  unless `major` is set. Returns null when the radius is too small for
 *  the chord (beyond a small tolerance), zero, or the points coincide. */
export function arcFromChordAndRadius(start: XY, end: XY, signedRadius: number, major = false): TrvArc | null {
  const R = Math.abs(signedRadius);
  if (!Number.isFinite(R) || R <= 0) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const c = Math.hypot(dx, dy);
  if (c < 1e-9) return null;
  // Allow a hair of rounding (a semicircle stored as R ≈ c/2).
  if (c > 2 * R * (1 + 1e-6)) return null;
  const half = Math.min(c / 2, R);
  const h = Math.sqrt(Math.max(0, R * R - half * half));
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  // Unit normal pointing LEFT of the travel direction.
  const lx = -dy / c;
  const ly = dx / c;
  const ccw = signedRadius < 0;
  // Minor arc: centre on the turning side. Major arc: opposite side.
  const side = (ccw ? 1 : -1) * (major ? -1 : 1);
  const center = { x: mx + lx * h * side, y: my + ly * h * side };
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const delta = sweep(startAngle, endAngle, ccw);
  const midAngle = startAngle + (ccw ? delta / 2 : -delta / 2);
  return {
    start: { ...start },
    end: { ...end },
    center,
    radius: R,
    startAngle,
    endAngle,
    anticlockwise: ccw,
    delta,
    length: R * delta,
    chord: c,
    mid: { x: center.x + R * Math.cos(midAngle), y: center.y + R * Math.sin(midAngle) },
  };
}

/** Positive sweep from a0 to a1 travelling CCW (or CW), in (0, 2π]. */
export function sweep(a0: number, a1: number, anticlockwise: boolean): number {
  const TAU = Math.PI * 2;
  let d = anticlockwise ? a1 - a0 : a0 - a1;
  d = ((d % TAU) + TAU) % TAU;
  return d === 0 ? TAU : d;
}

/** Sample an arc into `n`+1 points (for consumers without true arcs). */
export function sampleArc(arc: TrvArc, maxStepRad = Math.PI / 36): XY[] {
  const n = Math.max(2, Math.ceil(arc.delta / maxStepRad));
  const out: XY[] = [];
  for (let i = 0; i <= n; i++) {
    const t = arc.startAngle + (arc.anticlockwise ? 1 : -1) * (arc.delta * i) / n;
    out.push({ x: arc.center.x + arc.radius * Math.cos(t), y: arc.center.y + arc.radius * Math.sin(t) });
  }
  return out;
}

/** Signed shoelace area of a closed vertex ring (CCW positive). */
export function signedPolygonArea(vs: ReadonlyArray<XY>): number {
  let a = 0;
  for (let i = 0; i < vs.length; i++) {
    const p = vs[i];
    const q = vs[(i + 1) % vs.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Signed area of the circular segment between an arc and its chord,
 *  with the same sign convention as `signedPolygonArea` (it is the
 *  amount the arc ADDS to a ring that runs start→end along the chord). */
export function arcSegmentSignedArea(arc: TrvArc): number {
  const seg = (arc.radius * arc.radius / 2) * (arc.delta - Math.sin(arc.delta));
  return arc.anticlockwise ? seg : -seg;
}

/** Azimuth in degrees (0 = north, clockwise) from a to b. */
export function azimuthDeg(a: XY, b: XY): number {
  const az = (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
  return (az + 360) % 360;
}

/** Axis-aligned bounds accumulator. */
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function extendBounds(b: Bounds, p: XY): void {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
  if (p.x < b.minX) b.minX = p.x;
  if (p.y < b.minY) b.minY = p.y;
  if (p.x > b.maxX) b.maxX = p.x;
  if (p.y > b.maxY) b.maxY = p.y;
}

export function boundsValid(b: Bounds): boolean {
  return Number.isFinite(b.minX) && Number.isFinite(b.maxX) && b.maxX >= b.minX && b.maxY >= b.minY;
}

/** Extend bounds by an arc's true extent (its endpoints plus any
 *  axis-crossing extreme it sweeps through). */
export function extendBoundsArc(b: Bounds, arc: TrvArc): void {
  extendBounds(b, arc.start);
  extendBounds(b, arc.end);
  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2;
    const fromStart = arc.anticlockwise ? sweep(arc.startAngle, ang, true) : sweep(arc.startAngle, ang, false);
    if (fromStart < arc.delta) {
      extendBounds(b, { x: arc.center.x + arc.radius * Math.cos(ang), y: arc.center.y + arc.radius * Math.sin(ang) });
    }
  }
}
