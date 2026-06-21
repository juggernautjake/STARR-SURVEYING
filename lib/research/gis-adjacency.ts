// lib/research/gis-adjacency.ts
//
// §10.2 (GIS-adjacency half) of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Pure polygon-touching geometry. Given the subject parcel's polygon
// and a set of candidate parcels (e.g. everything returned by a
// "show me every parcel within 200 m of the subject" CAD query),
// return the subset whose boundaries touch the subject's — those
// are the authoritative GIS adjoiners that feed the §10.3 relevance
// classifier alongside the deed-call adjoiners shipped in slice 4.
//
// Why "touching" is fuzzy, not exact:
//   Real-world parcel polygons from county CADs frequently have
//   small overlaps or gaps (centimetres to a few feet) at shared
//   boundaries because they were drawn by different surveyors at
//   different times. A strict ε=0 boundary-shares-a-point test
//   misses most real adjoiners. The practical test is "do the
//   boundaries come within ε of each other?" — default ε is
//   `DEFAULT_TOLERANCE_METERS` below.
//
// Local-tangent-plane projection: at parcel scale (<5 km) the
// surface is essentially flat. We project every vertex into local
// metres using an equirectangular projection anchored at the
// subject polygon's first vertex, then run planar segment-segment
// distance. The projection error at this scale is well below the
// tolerance we're checking against (<1 cm vs ~3 m tolerance), so
// the simpler math is correct enough.

import type { CanonicalProperty } from './canonical-schema';
import { unwrap } from './canonical-schema';

/** GeoJSON Polygon-ish (mirrors the canonical schema's
 *  `parcel_geometry.geojson` field). */
export type GeoJsonPolygonish =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

export interface AdjacencyOptions {
  /** Distance in metres below which two boundaries are considered
   *  to "touch". Defaults to `DEFAULT_TOLERANCE_METERS` (≈3 m) so
   *  small survey gaps don't break adjacency. */
  toleranceMeters?: number;
}

export interface AdjacencyResult {
  adjacent: boolean;
  /** Minimum distance (m) between the two polygons' boundaries. 0
   *  when they touch or overlap. */
  minBoundaryDistanceMeters: number;
  /** Total length (m) of shared boundary, summed across every
   *  segment-pair whose distance is below tolerance. Useful for
   *  ranking ("this adjoiner shares 30 m of boundary" vs "shares a
   *  corner only"). */
  sharedBoundaryLengthMeters: number;
}

/** Reasonable default tolerance for real-world Texas parcel CADs.
 *  3 m absorbs the typical surveyor gap/overlap without pulling in
 *  parcels that are clearly across the street. */
export const DEFAULT_TOLERANCE_METERS = 3;

// ── Public API ──────────────────────────────────────────────────

/** Pure. Returns whether two parcel polygons share enough boundary
 *  to count as adjacent, plus the metrics the caller can use to
 *  rank or filter. */
export function arePolygonsAdjacent(
  a: GeoJsonPolygonish,
  b: GeoJsonPolygonish,
  opts: AdjacencyOptions = {},
): AdjacencyResult {
  const tol = opts.toleranceMeters ?? DEFAULT_TOLERANCE_METERS;

  // Anchor the local projection at the first vertex of `a`. Every
  // vertex below is converted to local metres against that origin.
  const anchor = firstVertex(a);
  if (!anchor) {
    return { adjacent: false, minBoundaryDistanceMeters: Infinity, sharedBoundaryLengthMeters: 0 };
  }
  const project = projector(anchor);

  const segsA = projectedSegments(a, project);
  const segsB = projectedSegments(b, project);
  if (segsA.length === 0 || segsB.length === 0) {
    return { adjacent: false, minBoundaryDistanceMeters: Infinity, sharedBoundaryLengthMeters: 0 };
  }

  let minD = Infinity;
  let sharedLen = 0;
  for (const sa of segsA) {
    for (const sb of segsB) {
      const d = segmentToSegmentDistance(sa, sb);
      if (d < minD) minD = d;
      if (d <= tol) {
        // Approximate shared length as the smaller of the two
        // segments' lengths (both ends of one segment are within
        // tolerance of the other). For partial overlaps this
        // slightly under-counts; that's fine for ranking.
        sharedLen += Math.min(segmentLength(sa), segmentLength(sb));
      }
    }
  }

  return {
    adjacent: minD <= tol,
    minBoundaryDistanceMeters: minD === Infinity ? Infinity : minD,
    sharedBoundaryLengthMeters: sharedLen,
  };
}

/** Pure. Filter a list of candidate parcels to the ones whose
 *  geometry is adjacent to the subject. Sorted by shared boundary
 *  length descending so the strongest adjoiners come first. */
export function findGisAdjoiners(
  subject: GeoJsonPolygonish,
  candidates: GeoJsonPolygonish[],
  opts: AdjacencyOptions = {},
): Array<{ index: number; result: AdjacencyResult }> {
  const hits: Array<{ index: number; result: AdjacencyResult }> = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const result = arePolygonsAdjacent(subject, candidates[i]!, opts);
    if (result.adjacent) hits.push({ index: i, result });
  }
  hits.sort(
    (x, y) => y.result.sharedBoundaryLengthMeters - x.result.sharedBoundaryLengthMeters,
  );
  return hits;
}

/** Convenience: filter a list of `CanonicalProperty` records by
 *  GIS adjacency to a subject CanonicalProperty. Skips candidates
 *  without geometry (returns them as non-adjacent). */
export function findGisAdjoinersFromRecords(
  subject: CanonicalProperty,
  candidates: CanonicalProperty[],
  opts: AdjacencyOptions = {},
): Array<{ candidate: CanonicalProperty; result: AdjacencyResult }> {
  const subjectGeom = unwrap(subject.geometry);
  if (!subjectGeom) return [];

  const hits: Array<{ candidate: CanonicalProperty; result: AdjacencyResult }> = [];
  for (const c of candidates) {
    const cGeom = unwrap(c.geometry);
    if (!cGeom) continue;
    const result = arePolygonsAdjacent(subjectGeom.geojson as GeoJsonPolygonish, cGeom.geojson as GeoJsonPolygonish, opts);
    if (result.adjacent) hits.push({ candidate: c, result });
  }
  hits.sort(
    (x, y) => y.result.sharedBoundaryLengthMeters - x.result.sharedBoundaryLengthMeters,
  );
  return hits;
}

// ── Internals ───────────────────────────────────────────────────

type Pt = { x: number; y: number };
type Segment = { a: Pt; b: Pt };

function firstVertex(g: GeoJsonPolygonish): [number, number] | undefined {
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0]?.[0];
  if (!ring || ring.length === 0) return undefined;
  return ring[0] as [number, number];
}

/** Local-tangent-plane projector anchored at `(lon0, lat0)`. Returns
 *  a function that maps a `[lon, lat]` pair to local meters
 *  `{x, y}` (eastings, northings). */
function projector(anchor: [number, number]): (p: number[]) => Pt {
  const R = 6371008.8;
  const [lon0, lat0] = anchor;
  const lat0Rad = (lat0 * Math.PI) / 180;
  const mPerDegLat = (Math.PI * R) / 180;
  const mPerDegLon = mPerDegLat * Math.cos(lat0Rad);
  return ([lon, lat]) => ({
    x: (lon - lon0) * mPerDegLon,
    y: (lat - lat0) * mPerDegLat,
  });
}

function projectedSegments(g: GeoJsonPolygonish, project: (p: number[]) => Pt): Segment[] {
  const segs: Segment[] = [];
  const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  for (const ring of rings) {
    if (!ring || ring.length < 2) continue;
    const pts = ring.map(project);
    for (let i = 0; i < pts.length - 1; i += 1) {
      segs.push({ a: pts[i]!, b: pts[i + 1]! });
    }
    // Close the ring if the source didn't.
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    if (first.x !== last.x || first.y !== last.y) {
      segs.push({ a: last, b: first });
    }
  }
  return segs;
}

function segmentLength(s: Segment): number {
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

/** Planar segment-to-segment minimum distance. Handles every case:
 *  - if the segments intersect, distance = 0
 *  - otherwise the minimum is at one of the 4 endpoint-to-other-
 *    segment distances. */
function segmentToSegmentDistance(s1: Segment, s2: Segment): number {
  if (segmentsIntersect(s1, s2)) return 0;
  return Math.min(
    pointToSegmentDistance(s1.a, s2),
    pointToSegmentDistance(s1.b, s2),
    pointToSegmentDistance(s2.a, s1),
    pointToSegmentDistance(s2.b, s1),
  );
}

function segmentsIntersect(s1: Segment, s2: Segment): boolean {
  const d1 = cross(s2.b.x - s2.a.x, s2.b.y - s2.a.y, s1.a.x - s2.a.x, s1.a.y - s2.a.y);
  const d2 = cross(s2.b.x - s2.a.x, s2.b.y - s2.a.y, s1.b.x - s2.a.x, s1.b.y - s2.a.y);
  const d3 = cross(s1.b.x - s1.a.x, s1.b.y - s1.a.y, s2.a.x - s1.a.x, s2.a.y - s1.a.y);
  const d4 = cross(s1.b.x - s1.a.x, s1.b.y - s1.a.y, s2.b.x - s1.a.x, s2.b.y - s1.a.y);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  // Collinear-overlap cases — rare in practice; conservative false.
  return false;
}

function cross(x1: number, y1: number, x2: number, y2: number): number {
  return x1 * y2 - y1 * x2;
}

function pointToSegmentDistance(p: Pt, s: Segment): number {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - s.a.x, p.y - s.a.y);
  let t = ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = s.a.x + t * dx;
  const cy = s.a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}
