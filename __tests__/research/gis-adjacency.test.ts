// __tests__/research/gis-adjacency.test.ts
//
// §10.2 (GIS-adjacency half) of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Pure geometry tests. Coordinates are real-world WGS84 longitudes /
// latitudes around central Texas (~30.5°N, -97.5°E), so the
// projection error is in the regime where the local-tangent-plane
// approximation is essentially exact.

import { describe, it, expect } from 'vitest';
import {
  arePolygonsAdjacent,
  findGisAdjoiners,
  findGisAdjoinersFromRecords,
  type GeoJsonPolygonish,
  DEFAULT_TOLERANCE_METERS,
} from '@/lib/research/gis-adjacency';
import type { CanonicalProperty } from '@/lib/research/canonical-schema';

const ATTR = { source: 'bell_cad_arcgis' as const };

/** Build a rectangular polygon from an origin (lon, lat) plus a width
 *  and height in degrees. At ~30.5° latitude one degree of longitude
 *  is ~96 km and one degree of latitude is ~111 km, so a width of
 *  0.0001 deg ≈ 9.6 m and a height of 0.0001 deg ≈ 11.1 m — a
 *  parcel-shaped box. */
function rect(lon: number, lat: number, dLon: number, dLat: number): GeoJsonPolygonish {
  return {
    type: 'Polygon',
    coordinates: [[
      [lon, lat],
      [lon + dLon, lat],
      [lon + dLon, lat + dLat],
      [lon, lat + dLat],
      [lon, lat],
    ]],
  };
}

describe('arePolygonsAdjacent — basic cases', () => {
  it('identical polygons → adjacent, shared boundary > 0', () => {
    const a = rect(-97.5, 30.5, 0.0001, 0.0001);
    const result = arePolygonsAdjacent(a, a);
    expect(result.adjacent).toBe(true);
    expect(result.minBoundaryDistanceMeters).toBe(0);
    expect(result.sharedBoundaryLengthMeters).toBeGreaterThan(0);
  });

  it('two polygons sharing a full edge → adjacent', () => {
    // a's right edge at lon = -97.4999 = b's left edge.
    const a = rect(-97.5, 30.5, 0.0001, 0.0001);
    const b = rect(-97.4999, 30.5, 0.0001, 0.0001);
    const result = arePolygonsAdjacent(a, b);
    expect(result.adjacent).toBe(true);
    expect(result.minBoundaryDistanceMeters).toBeCloseTo(0, 5);
    // Shared boundary ≈ 11 m (one latitude step at 30.5°).
    expect(result.sharedBoundaryLengthMeters).toBeGreaterThan(5);
  });

  it('two polygons sharing a corner only → adjacent (one point)', () => {
    // a is the SW quadrant; b is the NE quadrant — they share the
    // single corner at (-97.4999, 30.5001).
    const a = rect(-97.5, 30.5, 0.0001, 0.0001);
    const b = rect(-97.4999, 30.5001, 0.0001, 0.0001);
    const result = arePolygonsAdjacent(a, b);
    expect(result.adjacent).toBe(true);
    expect(result.minBoundaryDistanceMeters).toBeCloseTo(0, 5);
  });

  it('two polygons across the street (~30m apart) → not adjacent', () => {
    const a = rect(-97.5, 30.5, 0.0001, 0.0001);
    // ~30 m east at this latitude is ~0.00031 deg
    const b = rect(-97.4994, 30.5, 0.0001, 0.0001);
    const result = arePolygonsAdjacent(a, b);
    expect(result.adjacent).toBe(false);
    expect(result.minBoundaryDistanceMeters).toBeGreaterThan(DEFAULT_TOLERANCE_METERS);
    expect(result.sharedBoundaryLengthMeters).toBe(0);
  });
});

describe('arePolygonsAdjacent — tolerance behaviour', () => {
  it('absorbs a small surveyor gap when within the default tolerance', () => {
    // a's right edge at -97.5 + 0.0001; b's left edge ~2 m further
    // east (about 0.00002 deg lon at this latitude). Within default
    // 3 m tolerance.
    const a = rect(-97.5, 30.5, 0.0001, 0.0001);
    const b = rect(-97.5 + 0.0001 + 0.00002, 30.5, 0.0001, 0.0001);
    const result = arePolygonsAdjacent(a, b);
    expect(result.adjacent).toBe(true);
  });

  it('honours a tighter custom tolerance', () => {
    const a = rect(-97.5, 30.5, 0.0001, 0.0001);
    const b = rect(-97.5 + 0.0001 + 0.00002, 30.5, 0.0001, 0.0001);
    // Same configuration as above (gap ≈2 m) but custom tolerance
    // = 1 m → no longer adjacent.
    const result = arePolygonsAdjacent(a, b, { toleranceMeters: 1 });
    expect(result.adjacent).toBe(false);
  });

  it('handles MultiPolygon geometry', () => {
    const a: GeoJsonPolygonish = {
      type: 'MultiPolygon',
      coordinates: [
        rect(-97.5, 30.5, 0.0001, 0.0001).coordinates as number[][][],
      ],
    };
    const b = rect(-97.4999, 30.5, 0.0001, 0.0001);
    expect(arePolygonsAdjacent(a, b).adjacent).toBe(true);
  });
});

describe('arePolygonsAdjacent — robustness', () => {
  it('returns non-adjacent for empty polygons', () => {
    const empty: GeoJsonPolygonish = { type: 'Polygon', coordinates: [] };
    const a = rect(-97.5, 30.5, 0.0001, 0.0001);
    expect(arePolygonsAdjacent(empty, a).adjacent).toBe(false);
    expect(arePolygonsAdjacent(a, empty).adjacent).toBe(false);
  });
});

describe('findGisAdjoiners', () => {
  const subject = rect(-97.5, 30.5, 0.0001, 0.0001);
  const adjoinerNorth = rect(-97.5, 30.5001, 0.0001, 0.0001);
  const adjoinerEast  = rect(-97.4999, 30.5, 0.0001, 0.0001);
  const distantParcel = rect(-97.49, 30.5, 0.0001, 0.0001);

  it('returns only adjacent candidates', () => {
    const hits = findGisAdjoiners(subject, [adjoinerNorth, distantParcel, adjoinerEast]);
    expect(hits.map((h) => h.index).sort()).toEqual([0, 2]);
  });

  it('sorts results by shared-boundary length descending', () => {
    // Build a candidate that only shares a corner (≈0 shared
    // length) and one that shares a full edge.
    const sharesEdge = rect(-97.4999, 30.5, 0.0001, 0.0001);
    const sharesCornerOnly = rect(-97.4999, 30.5001, 0.0001, 0.0001);
    const hits = findGisAdjoiners(subject, [sharesCornerOnly, sharesEdge]);
    expect(hits[0]!.index).toBe(1); // sharesEdge first
    expect(hits[0]!.result.sharedBoundaryLengthMeters)
      .toBeGreaterThan(hits[1]!.result.sharedBoundaryLengthMeters);
  });

  it('returns empty when nothing is adjacent', () => {
    expect(findGisAdjoiners(subject, [distantParcel])).toEqual([]);
  });
});

describe('findGisAdjoinersFromRecords', () => {
  const mkRecord = (parcel_id: string, geom: GeoJsonPolygonish): CanonicalProperty => ({
    parcel_id,
    attribution: ATTR,
    geometry: { geojson: geom },
  });
  const subjectRec = mkRecord('SUBJECT', rect(-97.5, 30.5, 0.0001, 0.0001));
  const adjRec     = mkRecord('A1',      rect(-97.4999, 30.5, 0.0001, 0.0001));
  const farRec     = mkRecord('FAR',     rect(-97.49,   30.5, 0.0001, 0.0001));
  const geomlessRec = mkRecord('NO_GEOM', { type: 'Polygon', coordinates: [] });

  it('returns only adjacent records', () => {
    const hits = findGisAdjoinersFromRecords(subjectRec, [adjRec, farRec, geomlessRec]);
    expect(hits.map((h) => h.candidate.parcel_id)).toEqual(['A1']);
  });

  it('returns an empty array when the subject has no geometry', () => {
    const subjectNoGeom = mkRecord('NO_GEOM', { type: 'Polygon', coordinates: [] });
    expect(findGisAdjoinersFromRecords(subjectNoGeom, [adjRec])).toEqual([]);
  });
});
