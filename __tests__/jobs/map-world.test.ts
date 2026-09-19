// Points on the earth: what is in view, how far apart, and what to draw when there are too many.
//
// Owner, 2026-09-18: "the point loading and rendering would only show up at a certain level of zoom.
// We wouldn't want a situation where we have 500 points loading all at once."
import { describe, it, expect } from 'vitest';
import {
  isLatLng, roundLatLng, boundsContain, padBounds, boundsOf, padPoint,
  distanceFeet, pathLengthFeet, areaSquareFeet, acresFrom, bearingDeg, destination,
  clusterPoints, shouldLoadPoints, zoomHint,
  MIN_POINT_ZOOM, CLUSTER_MAX_ZOOM, DEFAULT_CENTER,
} from '@/lib/jobs/map-world';

// The office, and a corner of a real Bell County property.
const OFFICE = { lat: 30.99752823122663, lng: -97.40083553223793 };
const SALADO = { lat: 30.958932, lng: -97.525251 };

describe('a coordinate that is actually a place', () => {
  it('takes a real one', () => {
    expect(isLatLng(OFFICE)).toBe(true);
  });

  it('refuses 0,0 — the Gulf of Guinea is not a Texas survey', () => {
    expect(isLatLng({ lat: 0, lng: 0 })).toBe(false);
  });

  it('refuses what is not a finite pair, and what is off the globe', () => {
    expect(isLatLng(null)).toBe(false);
    expect(isLatLng({ lat: 30 })).toBe(false);
    expect(isLatLng({ lat: NaN, lng: 0 })).toBe(false);
    expect(isLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isLatLng({ lat: 0, lng: 181 })).toBe(false);
    expect(isLatLng({ lat: '30', lng: '-97' })).toBe(false);
  });

  it('keeps a real coordinate that happens to contain a zero', () => {
    expect(isLatLng({ lat: 0, lng: -97.4 })).toBe(true);
  });

  it('rounds to about a centimetre, to keep 600 points small on the wire', () => {
    expect(roundLatLng({ lat: 30.123456789, lng: -97.987654321 }))
      .toEqual({ lat: 30.1234568, lng: -97.9876543 });
  });
});

describe('what is in view', () => {
  const box = { north: 31, south: 30.9, east: -97.3, west: -97.5 };

  it('contains what is inside and not what is outside', () => {
    expect(boundsContain(box, OFFICE)).toBe(true);
    expect(boundsContain(box, { lat: 31.5, lng: -97.4 })).toBe(false);
    expect(boundsContain(box, { lat: 30.95, lng: -96.0 })).toBe(false);
  });

  it('handles a box across the antimeridian rather than silently returning nothing', () => {
    // Never going to happen in Bell County, but "returns nothing" is a bad way to find out.
    const pacific = { north: 10, south: -10, east: -170, west: 170 };
    expect(boundsContain(pacific, { lat: 0, lng: 175 })).toBe(true);
    expect(boundsContain(pacific, { lat: 0, lng: -175 })).toBe(true);
    expect(boundsContain(pacific, { lat: 0, lng: 0 })).toBe(false);
  });

  it('pads the viewport so a small pan does not blank the pins', () => {
    const p = padBounds({ north: 31, south: 30, east: -97, west: -98 }, 0.25);
    expect(p.north).toBeCloseTo(31.25, 6);
    expect(p.south).toBeCloseTo(29.75, 6);
    expect(p.east).toBeCloseTo(-96.75, 6);
    expect(p.west).toBeCloseTo(-98.25, 6);
  });

  it('never pads past the poles', () => {
    const p = padBounds({ north: 89.9, south: -89.9, east: 10, west: -10 }, 1);
    expect(p.north).toBeLessThanOrEqual(90);
    expect(p.south).toBeGreaterThanOrEqual(-90);
  });

  it('frames a set of points, and ignores the unplaceable ones', () => {
    const b = boundsOf([OFFICE, SALADO, { lat: 0, lng: 0 }]);
    expect(b).not.toBeNull();
    expect(b!.north).toBeCloseTo(OFFICE.lat, 6);
    expect(b!.south).toBeCloseTo(SALADO.lat, 6);
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ lat: 0, lng: 0 }])).toBeNull();
  });

  it('gives a single point some extent, so framing it does not zoom to infinity', () => {
    const b = padPoint(OFFICE, 60);
    expect(b.north).toBeGreaterThan(OFFICE.lat);
    expect(b.south).toBeLessThan(OFFICE.lat);
    expect(distanceFeet({ lat: b.north, lng: OFFICE.lng }, { lat: b.south, lng: OFFICE.lng }))
      .toBeGreaterThan(300); // ~120 m across
  });
});

describe('measuring on the ground', () => {
  it('measures a known distance', () => {
    // Office (Belton) to the Salado job, roughly 7.8 miles as the crow flies.
    const feet = distanceFeet(OFFICE, SALADO);
    expect(feet / 5280).toBeGreaterThan(7.5);
    expect(feet / 5280).toBeLessThan(8.2);
  });

  it('measures a short leg accurately enough to trust on a property', () => {
    // A tenth of a degree of latitude is 36,400 ft by definition of the constant; a thousandth of
    // one is 364 ft, and that is the scale everything on a parcel is measured at.
    expect(distanceFeet({ lat: 30.9, lng: -97.4 }, { lat: 30.901, lng: -97.4 })).toBe(364);
  });

  it('is zero for a point against itself', () => {
    expect(distanceFeet(OFFICE, OFFICE)).toBe(0);
  });

  it('adds up the legs of a walked path', () => {
    const a = { lat: 30.9, lng: -97.4 };
    const b = { lat: 30.901, lng: -97.4 };
    const c = { lat: 30.902, lng: -97.4 };
    expect(pathLengthFeet([a, b, c])).toBe(distanceFeet(a, b) + distanceFeet(b, c));
    expect(pathLengthFeet([a]), 'one point is not a path').toBe(0);
    expect(pathLengthFeet([])).toBe(0);
  });

  it('measures an area, and converts to acres', () => {
    // A square about 200 ft on a side at this latitude.
    const d = 200 / 364_000;
    const k = 1 / Math.cos((30.9 * Math.PI) / 180);
    const ring = [
      { lat: 30.9, lng: -97.4 },
      { lat: 30.9 + d, lng: -97.4 },
      { lat: 30.9 + d, lng: -97.4 + d * k },
      { lat: 30.9, lng: -97.4 + d * k },
    ];
    const sqft = areaSquareFeet(ring);
    expect(sqft).toBeGreaterThan(38_000);
    expect(sqft).toBeLessThan(42_000);
    expect(acresFrom(43_560)).toBe(1);
    expect(areaSquareFeet([{ lat: 30.9, lng: -97.4 }]), 'two points enclose nothing').toBe(0);
  });

  it('points a cone along a compass bearing', () => {
    expect(bearingDeg({ lat: 30.9, lng: -97.4 }, { lat: 31.0, lng: -97.4 })).toBeCloseTo(0, 0);
    expect(bearingDeg({ lat: 30.9, lng: -97.4 }, { lat: 30.9, lng: -97.3 })).toBeCloseTo(90, 0);
    expect(bearingDeg({ lat: 30.9, lng: -97.4 }, { lat: 30.8, lng: -97.4 })).toBeCloseTo(180, 0);
  });

  it('walks a distance along a bearing, and comes back where it started', () => {
    const out = destination(OFFICE, 45, 500);
    expect(distanceFeet(OFFICE, out)).toBeGreaterThan(480);
    expect(distanceFeet(OFFICE, out)).toBeLessThan(520);
    expect(bearingDeg(OFFICE, out)).toBeCloseTo(45, 0);
  });
});

describe('not loading 500 points at once', () => {
  it('does not ask for points until you are zoomed in', () => {
    expect(shouldLoadPoints(MIN_POINT_ZOOM - 1)).toBe(false);
    expect(shouldLoadPoints(MIN_POINT_ZOOM)).toBe(true);
    expect(shouldLoadPoints(18)).toBe(true);
  });

  it('says why the map is empty, rather than just being empty', () => {
    expect(zoomHint(MIN_POINT_ZOOM, 40)).toBeNull();
    expect(zoomHint(8, 0)).toBe('Zoom in to load points.');
    expect(zoomHint(8, 40)).toBe('Zoom in to see the 40 points on this map.');
    expect(zoomHint(8, 1)).toBe('Zoom in to see the 1 point on this map.');
  });
});

describe('clustering, so forty pins on one property are one marker', () => {
  const near = Array.from({ length: 40 }, (_, i) => ({
    id: `p${i}`, lat: 30.9 + i * 0.000_02, lng: -97.4 + i * 0.000_02,
  }));

  it('collapses points that would land on top of each other', () => {
    const clusters = clusterPoints(near, 12);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].items).toHaveLength(40);
  });

  it('draws the cluster on the points, not in the middle of the cell', () => {
    // A cluster at the cell centre sits in the field next door rather than on the property.
    const [c] = clusterPoints(near, 12);
    const meanLat = near.reduce((s, p) => s + p.lat, 0) / near.length;
    expect(c.lat).toBeCloseTo(meanLat, 9);
  });

  it('stops clustering once you are close enough to read individual pins', () => {
    const solo = clusterPoints(near, CLUSTER_MAX_ZOOM);
    expect(solo).toHaveLength(40);
    expect(solo.every((c) => c.items.length === 1)).toBe(true);
  });

  it('separates things that are genuinely apart', () => {
    const apart = [
      { id: 'a', lat: 30.9, lng: -97.4 },
      { id: 'b', lat: 31.9, lng: -96.4 },
    ];
    expect(clusterPoints(apart, 12)).toHaveLength(2);
  });

  it('drops what cannot be placed rather than drawing it at 0,0', () => {
    const clusters = clusterPoints([{ id: 'ok', ...OFFICE }, { id: 'bad', lat: 0, lng: 0 }], 14);
    expect(clusters.flatMap((c) => c.items.map((i) => i.id))).toEqual(['ok']);
  });

  it('gives a cluster a stable id, so a pan does not rebuild every marker', () => {
    const a = clusterPoints(near, 13).map((c) => c.id);
    const b = clusterPoints([...near].reverse(), 13).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('a single point is still a cluster of one — one code path for pin and count', () => {
    expect(clusterPoints([{ id: 'x', ...OFFICE }], 12)[0].items).toHaveLength(1);
  });
});

describe('where the map opens', () => {
  it('defaults to the office', () => {
    expect(isLatLng(DEFAULT_CENTER)).toBe(true);
    // Same coordinates the public service-area map already uses.
    expect(DEFAULT_CENTER.lat).toBeCloseTo(30.9975, 3);
    expect(DEFAULT_CENTER.lng).toBeCloseTo(-97.4008, 3);
  });
});
