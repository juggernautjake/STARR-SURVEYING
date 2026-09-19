// Points on the earth: what is in view, how far apart, and what to draw when there are too many.
//
// Owner, 2026-09-18: "the point loading and rendering would only show up at a certain level of zoom.
// We wouldn't want a situation where we have 500 points loading all at once."
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isLatLng, roundLatLng, boundsContain, padBounds, boundsOf, padPoint, parseLatLng,
  PIN_SIZE_PX, PIN_TIP_PX, PIN_BOX_HEIGHT_PX,
  distanceFeet, pathLengthFeet, areaSquareFeet, acresFrom, bearingDeg, destination,
  clusterPoints, shouldLoadPoints, zoomHint, pinHighlight, layerRowLit,
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

describe('going to a coordinate somebody typed', () => {
  // Owner, 2026-09-19: "This should work whether it is an address or lat/long." Google Places is an
  // address lookup and will not answer a coordinate, so it has to be recognised before Google is
  // asked — otherwise the search either fails or finds somewhere with those digits in its name.
  it('reads a plain decimal pair', () => {
    expect(parseLatLng('30.9589, -97.5252')).toEqual({ lat: 30.9589, lng: -97.5252 });
    expect(parseLatLng('30.9589 -97.5252')).toEqual({ lat: 30.9589, lng: -97.5252 });
    expect(parseLatLng('  30.9589,-97.5252  ')).toEqual({ lat: 30.9589, lng: -97.5252 });
  });

  it('reads the N/S/E/W a GPS or a deed produces', () => {
    expect(parseLatLng('30.9589N, 97.5252W')).toEqual({ lat: 30.9589, lng: -97.5252 });
    expect(parseLatLng('30.9589 N 97.5252 W')).toEqual({ lat: 30.9589, lng: -97.5252 });
  });

  it('reads degrees-minutes-seconds, which is what old survey documents carry', () => {
    const at = parseLatLng(`30°57'32.1"N 97°31'30.9"W`);
    expect(at).not.toBeNull();
    expect(at!.lat).toBeCloseTo(30.9589, 3);
    expect(at!.lng).toBeCloseTo(-97.5252, 3);
  });

  it('is not fooled by an address that merely contains numbers', () => {
    expect(parseLatLng('1512 Chisholm Trail')).toBeNull();
    expect(parseLatLng('309 West Gibson, Thorndale')).toBeNull();
    expect(parseLatLng('Salado')).toBeNull();
    expect(parseLatLng('')).toBeNull();
  });

  it('refuses a pair that is not on the earth', () => {
    expect(parseLatLng('91, 0')).toBeNull();
    expect(parseLatLng('0, 181')).toBeNull();
    expect(parseLatLng('0, 0'), 'the Gulf of Guinea again').toBeNull();
  });
});

describe('a pin points AT its coordinate', () => {
  // Owner, 2026-09-19: "all of the points should keep their positions relative to the map."
  //
  // Google anchors a marker by the bottom-centre of its content box. The pin is a square rotated
  // 45°, so its tip hangs below that box — and the overhang is in screen pixels, so zooming never
  // scales it away. The ground slides under a fixed error, which is exactly what a drifting point
  // looks like.
  it('the tip is a half-diagonal from the centre', () => {
    expect(PIN_TIP_PX).toBeCloseTo((PIN_SIZE_PX * Math.SQRT2) / 2, 1);
  });

  it('the wrapper is tall enough that its bottom edge IS the tip', () => {
    expect(PIN_BOX_HEIGHT_PX).toBeCloseTo(PIN_SIZE_PX / 2 + PIN_TIP_PX, 1);
    // The bug this replaces: the un-wrapped box was only 26px, leaving the tip 5.4px below it.
    expect(PIN_BOX_HEIGHT_PX - PIN_SIZE_PX).toBeCloseTo(5.4, 1);
  });

  it('the stylesheet uses the same number, or the pin drifts again', () => {
    const css = readFileSync('app/admin/map/PropertyMap.css', 'utf8');
    expect(css).toContain(`height: ${PIN_BOX_HEIGHT_PX}px`);
    expect(css, 'and the scale keeps the tip still').toContain('transform-origin: 0 100%');
  });
});

describe('hovering: two questions, two answers', () => {
  // Owner, 2026-09-19: "whenever I hover over one point, all of the points on that layer light up.
  // I just want the one point that I am hovering over to light up. If I hover over the layer in the
  // layer list, then all of the points and elements in that layer should light up."
  //
  // These were one piece of state, and that was the bug: a pin's mouseenter set the LAYER hover.
  const A = { id: 'a', layerId: 'base' };
  const B = { id: 'b', layerId: 'base' };
  const C = { id: 'c', layerId: 'utils' };
  const idle = { hoverLayer: null, hoverPoint: null, selectedId: null };

  it('hovering ONE PIN lights that pin and nothing else', () => {
    const s = { ...idle, hoverPoint: 'a' };
    expect(pinHighlight(A, s).lit, 'the one being pointed at').toBe(true);
    expect(pinHighlight(B, s).lit, 'its neighbour on the same sheet — the bug').toBe(false);
    expect(pinHighlight(C, s).lit).toBe(false);
  });

  it('hovering one pin dims nothing — the rest of the map is not the question', () => {
    const s = { ...idle, hoverPoint: 'a' };
    expect(pinHighlight(A, s).dim).toBe(false);
    expect(pinHighlight(B, s).dim).toBe(false);
    expect(pinHighlight(C, s).dim).toBe(false);
  });

  it('hovering a LAYER ROW lights everything on it, and dims what is not', () => {
    const s = { ...idle, hoverLayer: 'base' };
    expect(pinHighlight(A, s).lit).toBe(true);
    expect(pinHighlight(B, s).lit).toBe(true);
    expect(pinHighlight(C, s).lit).toBe(false);
    expect(pinHighlight(C, s).dim, 'the other sheet steps back').toBe(true);
    expect(pinHighlight(A, s).dim).toBe(false);
  });

  it('a point on no sheet is treated as being on none of them', () => {
    // `layerId` is resolved through layerOf before it gets here, so a null at this point means the
    // caller could not place it — it must not accidentally match a hovered layer.
    const orphan = { id: 'x', layerId: null };
    expect(pinHighlight(orphan, { ...idle, hoverLayer: 'base' }).lit).toBe(false);
    expect(pinHighlight(orphan, { ...idle, hoverLayer: 'base' }).dim).toBe(true);
  });

  it('the open point stays marked whatever the cursor is doing', () => {
    expect(pinHighlight(A, { ...idle, selectedId: 'a' }).on).toBe(true);
    expect(pinHighlight(A, { hoverLayer: 'utils', hoverPoint: 'c', selectedId: 'a' }).on).toBe(true);
    expect(pinHighlight(B, { ...idle, selectedId: 'a' }).on).toBe(false);
  });

  it('nothing is lit or dimmed when the cursor is nowhere near', () => {
    for (const p of [A, B, C]) {
      expect(pinHighlight(p, idle)).toEqual({ lit: false, dim: false, on: false });
    }
  });

  it('a layer row lights from EITHER end', () => {
    // Its own hover...
    expect(layerRowLit('base', { ...idle, hoverLayer: 'base' }, null)).toBe(true);
    // ...or a pin on it being hovered, which is the half that was right all along.
    expect(layerRowLit('base', { ...idle, hoverPoint: 'a' }, 'base')).toBe(true);
    expect(layerRowLit('utils', { ...idle, hoverPoint: 'a' }, 'base')).toBe(false);
    expect(layerRowLit('base', idle, null)).toBe(false);
  });
});
