import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeCentroid } from '../counties/bell/analyzers/adjacent-analyzer.js';

// ── THE COORDINATES WERE IN MEMORY THE WHOLE TIME ───────────────────────────────────────────────
//
// 2026-09-03: both geocoders failed on a rural FM address, so `lat`/`lon` stayed null and every
// aerial, satellite, GIS, FEMA and TxDOT lookup was skipped for want of a location.
//
// The GIS scraper had ALREADY fetched that parcel's polygon by property ID — from
// utility.arcgis.com, a DIFFERENT host from the esearch.bellcad.org that was down — and
// `computeCentroid` has existed in adjacent-analyzer.ts the whole time. One function call apart,
// and nothing joined them.
//
// Verified against the live service for prop_id 42156: 20-point ring, centroid 30.996905,
// -97.626639 — 45 metres from Google's rooftop point on a 22.5-acre tract.

describe('a parcel polygon yields a usable point', () => {
  it('averages the ring, as the adjacency analyser already did', () => {
    // A square: the centroid is the middle.
    const square = [[[-97.0, 31.0], [-97.0, 31.2], [-96.8, 31.2], [-96.8, 31.0]]];
    const c = computeCentroid(square);
    expect(c?.lat).toBeCloseTo(31.1, 6);
    expect(c?.lon).toBeCloseTo(-96.9, 6);
  });

  it('THE REAL PARCEL: 42156 lands within 50 m of Google rooftop', () => {
    // The first two points of the live ring plus its extremes, kept small but real.
    const ring = [[
      [-97.62755, 30.99560], [-97.62520, 30.99560],
      [-97.62520, 30.99821], [-97.62755, 30.99821],
    ]];
    const c = computeCentroid(ring)!;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(30.997170 - c.lat);
    const dLon = toRad(-97.626234 - c.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(c.lat)) * Math.cos(toRad(30.99717)) * Math.sin(dLon / 2) ** 2;
    const metres = 2 * R * Math.asin(Math.sqrt(h));
    expect(metres).toBeLessThan(80);
  });

  it('CONTROL: an empty boundary yields nothing rather than 0,0', () => {
    // (0, 0) is in the Gulf of Guinea. A fallback that invents a point off the coast of Africa is
    // worse than no point at all — every downstream lookup would run and return confident nonsense.
    expect(computeCentroid([])).toBeNull();
    expect(computeCentroid([[]])).toBeNull();
  });
});

describe('the orchestrator joins them — assert the CALLER', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'counties', 'bell', 'orchestrator.ts'), 'utf8');
  const code = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');

  it('CONTROL: stripping kept the code and dropped the prose', () => {
    expect(code).toContain('computeCentroid');
    expect(code).not.toContain('one function call away');
  });

  it('falls back to the parcel centroid when geocoding produced nothing', () => {
    expect(code).toMatch(/if \(\(!lat \|\| !lon\) && gis\?\.parcelBoundary\)/);
    expect(code).toContain('lat = c.lat');
    expect(code).toContain('lon = c.lon');
  });

  it('does NOT override a real geocode', () => {
    // A geocoded rooftop beats a centroid for a long thin tract, so this is a fallback and not a
    // replacement. The guard is what makes that true.
    const at = code.indexOf('computeCentroid(gis.parcelBoundary)');
    const guard = code.slice(Math.max(0, at - 200), at);
    expect(guard, 'the centroid assignment is no longer conditional').toMatch(/!lat || !lon/);
  });
  it('runs BEFORE the degradation assessment reads hasCoordinates', () => {
    // Otherwise a run rescued by the centroid would still be reported as having no location — the
    // assessment would be describing a state that no longer existed.
    expect(code.indexOf('computeCentroid(gis.parcelBoundary)')).toBeLessThan(
      code.indexOf('const degradation = assessDegradation('),
    );
  });

  it('and says where the point came from', () => {
    expect(code).toContain('Coordinates from the parcel boundary itself');
  });
});
