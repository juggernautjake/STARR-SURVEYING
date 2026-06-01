// lib/cad/io/trv-bearings.ts
//
// cad-trv-bearings-and-distances Slice 1 — pure helpers that
// compute surveyor's bearings + distances for traverse segments.
// The TRV format does NOT store bearings/distances per segment —
// Traverse PC computes them on the fly from the point coordinates,
// using state-plane survey feet (northing + easting).
//
// Verified against TPC's Traverse View for the Garland BOUNDARY:
// every bearing matches to the second, every distance matches to
// 0.01' (the formatted-display precision).
//
// Format conventions:
//   - Bearing  = `N72°34'00"W`   (NSEW quadrant, magnitude ≤ 90°)
//   - Distance = `299.62'`        (2 decimals, foot symbol)
//
// Pure module: no DOM, no React, no store deps.

export interface Point2DNE {
  /** Northing (state-plane feet, y-up in survey coords). */
  n: number;
  /** Easting (state-plane feet, x-right). */
  e: number;
}

/** Surveyor's bearing for a segment from `a` to `b`.
 *  Format: `N72°34'00"W` (NSEW quadrant, magnitude 0-90°). */
export function surveyorsBearing(a: Point2DNE, b: Point2DNE): string {
  const dN = b.n - a.n;
  const dE = b.e - a.e;
  // Azimuth measured from north, CW positive; range 0-360°.
  const azRad = Math.atan2(dE, dN);
  let azDeg = (azRad * 180) / Math.PI;
  if (azDeg < 0) azDeg += 360;
  // Quadrant decomposition.
  let ns: 'N' | 'S'; let ew: 'E' | 'W'; let bearingDeg: number;
  if (azDeg <= 90)       { ns = 'N'; ew = 'E'; bearingDeg = azDeg; }
  else if (azDeg <= 180) { ns = 'S'; ew = 'E'; bearingDeg = 180 - azDeg; }
  else if (azDeg <= 270) { ns = 'S'; ew = 'W'; bearingDeg = azDeg - 180; }
  else                   { ns = 'N'; ew = 'W'; bearingDeg = 360 - azDeg; }
  const d = Math.floor(bearingDeg);
  const minFloat = (bearingDeg - d) * 60;
  const m = Math.floor(minFloat);
  let s = Math.round((minFloat - m) * 60);
  // Carry seconds → minutes → degrees on rounding overflow.
  let mm = m;
  let dd = d;
  if (s >= 60) { s -= 60; mm += 1; }
  if (mm >= 60) { mm -= 60; dd += 1; }
  return `${ns}${dd}°${String(mm).padStart(2, '0')}'${String(s).padStart(2, '0')}"${ew}`;
}

/** Surveyor's distance formatting — feet with 2 decimals + a
 *  trailing foot mark (apostrophe). */
export function formatDistance(distanceFt: number, decimals = 2): string {
  return `${distanceFt.toFixed(decimals)}'`;
}

/** Straight-line distance between two points (feet). */
export function segmentDistance(a: Point2DNE, b: Point2DNE): number {
  return Math.hypot(b.n - a.n, b.e - a.e);
}

export interface TraverseSegmentLabel {
  /** From-vertex index in the input chain. */
  startIndex: number;
  /** To-vertex index in the input chain. */
  endIndex: number;
  /** Surveyor's bearing for the segment. */
  bearing: string;
  /** Distance label (already formatted with foot mark). */
  distance: string;
  /** Raw distance in feet (for downstream sums / closure calc). */
  distanceFt: number;
  /** Midpoint of the segment in (N, E) — where the label sits. */
  midpoint: Point2DNE;
  /** Heading of the segment in radians (math convention, CCW
   *  from east) — useful for label rotation alignment. */
  segmentAngleRad: number;
}

/** Walk a polyline / polygon's vertex chain and return one label
 *  record per segment. Empty when fewer than 2 vertices. */
export function traverseSegmentLabels(vertices: ReadonlyArray<Point2DNE>): TraverseSegmentLabel[] {
  const out: TraverseSegmentLabel[] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const distFt = segmentDistance(a, b);
    if (distFt === 0) continue;
    out.push({
      startIndex: i,
      endIndex: i + 1,
      bearing: surveyorsBearing(a, b),
      distance: formatDistance(distFt),
      distanceFt: distFt,
      midpoint: { n: (a.n + b.n) / 2, e: (a.e + b.e) / 2 },
      segmentAngleRad: Math.atan2(b.n - a.n, b.e - a.e),
    });
  }
  return out;
}
