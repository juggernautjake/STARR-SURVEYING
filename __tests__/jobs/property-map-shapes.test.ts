// The four ways a point of interest can be drawn, and the trigonometry behind them.
//
// Owner, 2026-09-16: "I want to be able to create a point that is just a single point on the map.
// Then I want to create a point that has a field of view feature … for pictures that are taken and
// the uploader wanted to show where they were and what direction they were facing … I also want to
// create a mechanic where the user create the first point, then can click to draw connected lines
// that represent what path they walked."
//
// The thing that makes this worth testing without a browser: the data is stored as fractions of the
// image box, which are NOT isotropic. On a 4000×3000 aerial, 0.1 across is 400 px and 0.1 down is
// 300 px — so a cone aimed "north-east" in fraction space points somewhere else on screen, and a
// path measures wrong. Every test here that passes a 4:3 box is holding that line.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  POINT_GEOMETRIES, DEFAULT_GEOMETRY, geometryOf, isKnownGeometry,
  clampBearing, clampFovDeg, clampFovRadius, bearingLabel, bearingBetween, radiusBetween,
  fovPath, fovAimHandle, fovWidthHandle, fovDegFromHandle,
  shapePoints, shapePointsAttr, appendVertex, pathLengthFeet, areaAcres, shapeLabelAt,
  shapeSummary, isDrawable, FOV_DEFAULT_DEG, FOV_PRESETS, SQUARE,
} from '@/lib/jobs/property-map-shapes';
import type { Georeference } from '@/lib/jobs/property-map';

const read = (p: string) => readFileSync(p, 'utf8');
const BOX = { width: 4000, height: 3000 };   // a normal aerial: 4:3, not square
const geo: Georeference = {
  a: { x: 0.1, y: 0.1, lat: 31.0700, lng: -97.4700 },
  b: { x: 0.9, y: 0.9, lat: 31.0600, lng: -97.4600 },
};

describe('the four shapes', () => {
  it('are the ones the owner described, and a plain point is the default', () => {
    expect(POINT_GEOMETRIES.map((g) => g.id)).toEqual(['point', 'fov', 'path', 'area']);
    expect(DEFAULT_GEOMETRY).toBe('point');
    expect(geometryOf('nonsense').id, 'anything unknown draws as a dot').toBe('point');
    expect(isKnownGeometry('fov')).toBe(true);
    expect(isKnownGeometry('blob')).toBe(false);
  });

  it('each one says what it is for AND what to do — which is the whole of "easy to learn"', () => {
    for (const g of POINT_GEOMETRIES) {
      expect(g.hint.length, `${g.id} must say what it is for`).toBeGreaterThan(30);
      expect(g.howTo.length, `${g.id} must say what to do`).toBeGreaterThan(20);
      expect(g.icon.length).toBeGreaterThan(2);
    }
    // The two that need more than one click say so, because the editor changes behaviour on it.
    expect(POINT_GEOMETRIES.filter((g) => g.multiClick).map((g) => g.id)).toEqual(['path', 'area']);
  });

  it('tells a person how to finish a shape, in the words of the keys they would press', () => {
    const path = geometryOf('path');
    expect(path.howTo).toMatch(/Double-click/);
    expect(path.howTo).toMatch(/Enter/);
    expect(path.howTo).toMatch(/Finish/);
  });
});

describe('aiming a camera cone', () => {
  it('0° is up the image and it turns clockwise, on a non-square aerial', () => {
    const at = { x: 0.5, y: 0.5 };
    expect(bearingBetween(at, { x: 0.5, y: 0.2 }, BOX), 'straight up').toBeCloseTo(0, 1);
    expect(bearingBetween(at, { x: 0.8, y: 0.5 }, BOX), 'right is east').toBeCloseTo(90, 1);
    expect(bearingBetween(at, { x: 0.5, y: 0.8 }, BOX), 'down is south').toBeCloseTo(180, 1);
    expect(bearingBetween(at, { x: 0.2, y: 0.5 }, BOX), 'left is west').toBeCloseTo(270, 1);
  });

  it('a true 45° needs the aspect ratio — this is the bug the pixel conversion exists to stop', () => {
    // 400 px right and 400 px up on a 4000×3000 image is 0.1 of the width and 0.1333 of the height.
    const at = { x: 0.5, y: 0.5 };
    expect(bearingBetween(at, { x: 0.6, y: 0.5 - 400 / 3000 }, BOX)).toBeCloseTo(45, 1);
    // The same fractions read as 45° only if you wrongly assume a square image:
    expect(bearingBetween(at, { x: 0.6, y: 0.4 }, BOX)).not.toBeCloseTo(45, 1);
    expect(bearingBetween(at, { x: 0.6, y: 0.4 }, SQUARE)).toBeCloseTo(45, 1);
  });

  it('wraps a bearing instead of rejecting it, however the caller does the arithmetic', () => {
    expect(clampBearing(370)).toBe(10);
    expect(clampBearing(-90)).toBe(270);
    expect(clampBearing(NaN)).toBe(0);
    expect(clampBearing(null)).toBe(0);
  });

  it('writes a direction the way a person would say it', () => {
    expect(bearingLabel(0)).toBe('North (0°)');
    expect(bearingLabel(46)).toBe('North-east (46°)');
    expect(bearingLabel(181)).toBe('South (181°)');
    expect(bearingLabel(359), 'nearly north is north, not 8×45').toBe('North (359°)');
  });
});

describe('how wide the cone is, and how the handles set it', () => {
  it('defaults to a phone camera rather than a round number', () => {
    expect(FOV_DEFAULT_DEG).toBe(68);
    expect(FOV_PRESETS.map((p) => p.deg)).toContain(68);
    expect(FOV_PRESETS.some((p) => /phone/i.test(p.label))).toBe(true);
  });

  it('keeps the width and the reach inside what can be drawn', () => {
    expect(clampFovDeg(0)).toBeGreaterThan(0);
    expect(clampFovDeg(400)).toBeLessThanOrEqual(350);
    expect(clampFovDeg(undefined)).toBe(FOV_DEFAULT_DEG);
    expect(clampFovRadius(0)).toBeGreaterThan(0);
    expect(clampFovRadius(99)).toBeLessThanOrEqual(1.5);
  });

  it('the aim handle sits where the cone points, and dragging it back gives the same bearing', () => {
    const origin = { x: 0.4, y: 0.6 };
    for (const bearing of [0, 37, 90, 155, 270, 341]) {
      const handle = fovAimHandle(origin, bearing, 0.2, BOX);
      expect(bearingBetween(origin, handle, BOX), `bearing ${bearing}`).toBeCloseTo(bearing, 0);
      expect(radiusBetween(origin, handle, BOX), `radius at ${bearing}`).toBeCloseTo(0.2, 2);
    }
  });

  it('the width handle sits on the cone edge, and dragging it sets the width', () => {
    const origin = { x: 0.5, y: 0.5 };
    const handle = fovWidthHandle(origin, 90, 60, 0.25, BOX);
    // The right-hand edge of a 60° cone aimed east is at 120°.
    expect(bearingBetween(origin, handle, BOX)).toBeCloseTo(120, 0);
    expect(fovDegFromHandle(origin, 90, handle, BOX)).toBeCloseTo(60, 0);
  });

  it('the width handle works on the other side too, and across the 0° wrap', () => {
    const origin = { x: 0.5, y: 0.5 };
    // A handle 40° anticlockwise of the centre line is the same 80° cone as one 40° clockwise.
    const left = fovAimHandle(origin, 50, 0.2, BOX);
    expect(fovDegFromHandle(origin, 90, left, BOX)).toBeCloseTo(80, 0);
    // Aimed just past north, with the handle just before it.
    const wrapped = fovAimHandle(origin, 350, 0.2, BOX);
    expect(fovDegFromHandle(origin, 10, wrapped, BOX)).toBeCloseTo(40, 0);
  });

  it('draws a wedge with an arc, and a full circle for an all-around photo', () => {
    const wedge = fovPath({ x: 0.5, y: 0.5 }, 90, 60, 0.2, BOX);
    expect(wedge.startsWith('M 2000 1500 L'), 'starts where the camera was').toBe(true);
    expect(wedge, 'the far edge is an arc, not a straight line').toContain(' A ');
    expect(wedge.endsWith('Z')).toBe(true);
    // Over 180° the arc has to be told to take the long way round.
    expect(fovPath({ x: 0.5, y: 0.5 }, 0, 240, 0.2, BOX)).toMatch(/A \d+(\.\d+)? \d+(\.\d+)? 0 1 1/);
    // A 360 photo is a circle: two arcs, because one cannot close a circle in SVG.
    const circle = fovPath({ x: 0.5, y: 0.5 }, 0, 360, 0.2, BOX);
    expect((circle.match(/ A /g) ?? []).length).toBe(2);
  });
});

describe('a walked path and an area', () => {
  const walk = { x: 0.1, y: 0.1, vertices: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.6 }] };

  it('the anchor is the first vertex — where the walk started', () => {
    expect(shapePoints(walk)).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.6 }]);
    expect(shapePoints({ x: 0.2, y: 0.2 }), 'a dot is a one-point shape').toEqual([{ x: 0.2, y: 0.2 }]);
    expect(shapePoints({ x: 0.2, y: 0.2, vertices: null })).toHaveLength(1);
  });

  it('renders in the image’s own pixel space, so nothing is stretched', () => {
    expect(shapePointsAttr(shapePoints(walk), BOX)).toBe('400,300 2000,300 2000,1800');
  });

  it('a click on top of the last vertex is a double-click finishing the shape, not a new bend', () => {
    const vertices = [{ x: 0.5, y: 0.5 }];
    expect(appendVertex(vertices, { x: 0.5, y: 0.5 }, BOX), 'zero-length leg refused').toHaveLength(1);
    expect(appendVertex(vertices, { x: 0.5001, y: 0.5 }, BOX), 'a pixel away is still the same click').toHaveLength(1);
    expect(appendVertex(vertices, { x: 0.6, y: 0.5 }, BOX), 'a real move is a real bend').toHaveLength(2);
  });

  it('measures a walk in feet only when the map is tied to real coordinates', () => {
    const pts = shapePoints(walk);
    expect(pathLengthFeet(pts, null), 'no georeference, no invented number').toBeNull();
    const feet = pathLengthFeet(pts, geo)!;
    expect(feet).toBeGreaterThan(1000);
    expect(feet).toBeLessThan(20000);
    expect(pathLengthFeet([{ x: 0.1, y: 0.1 }], geo), 'one point is not a walk').toBeNull();
  });

  it('measures an area in acres, and refuses when it cannot', () => {
    // A quarter of the image, on a map whose corners are 0.01° apart.
    const square = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.5 }];
    const acres = areaAcres(square, geo)!;
    expect(acres).toBeGreaterThan(0);
    expect(areaAcres(square, null)).toBeNull();
    expect(areaAcres([{ x: 0, y: 0 }, { x: 1, y: 1 }], geo), 'two points is not an area').toBeNull();
    // The shoelace must not care which way round the corners were clicked. Compared to a hundredth
    // of an acre, which is the rounding step itself — the two orders accumulate the same sum in a
    // different sequence, and the last digit follows the floating point rather than the geometry.
    expect(areaAcres([...square].reverse(), geo)).toBeCloseTo(acres, 1);
  });

  it('puts a path’s label in the middle of the walk, not at one end', () => {
    const at = shapeLabelAt('path', [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], BOX);
    expect(at.x).toBeCloseTo(0.5, 2);
    const area = shapeLabelAt('area', [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], BOX);
    expect(area).toEqual({ x: 0.5, y: 0.5 });
    expect(shapeLabelAt('point', [{ x: 0.3, y: 0.7 }], BOX), 'a dot labels itself').toEqual({ x: 0.3, y: 0.7 });
  });

  it('knows when there is enough of a shape to save', () => {
    expect(isDrawable('point', 0)).toBe(true);
    expect(isDrawable('fov', 0)).toBe(true);
    expect(isDrawable('path', 0), 'a path of one click is an abandoned dot').toBe(false);
    expect(isDrawable('path', 1)).toBe(true);
    expect(isDrawable('area', 1), 'two points is a line, not an area').toBe(false);
    expect(isDrawable('area', 2)).toBe(true);
  });
});

describe('what the list says about a shape', () => {
  it('reads as a sentence, and never invents a measurement', () => {
    expect(shapeSummary({ geometry: 'point', x: 0.5, y: 0.5 }, null)).toBe('Single point');
    expect(shapeSummary({ geometry: 'fov', x: 0.5, y: 0.5, bearingDeg: 46, fovDeg: 68 }, null))
      .toBe('Facing North-east (46°), 68° across');
    // Without a georeference: how many legs, and nothing that pretends to be a distance.
    const walk = { geometry: 'path' as const, x: 0.1, y: 0.1, vertices: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.6 }] };
    expect(shapeSummary(walk, null)).toBe('2 legs');
    expect(shapeSummary(walk, geo)).toMatch(/^2 legs, about [\d,]+ ft$/);
    const region = { geometry: 'area' as const, x: 0.1, y: 0.1, vertices: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }] };
    expect(shapeSummary(region, null)).toBe('3 corners');
    expect(shapeSummary(region, geo)).toMatch(/^3 corners, about [\d.]+ acres?$/);
  });
});

describe('the schema and the route agree with the module', () => {
  const seed = read('seeds/642_job_map_point_shapes.sql');

  it('one table holds all four shapes, and says why it is not four tables', () => {
    expect(seed).toMatch(/ONE TABLE, FOUR SHAPES/);
    expect(seed).toContain("CHECK (geometry IN ('point', 'fov', 'path', 'area'))");
  });

  it('every shape still has an anchor, so a broken shape is a labelled dot and not a lost row', () => {
    expect(seed).toMatch(/x`\/`y` stays meaningful and required for ALL of them/);
  });

  it('the cone cannot be stored pointing nowhere', () => {
    expect(seed).toContain('bearing_deg >= 0 AND bearing_deg < 360');
    expect(seed).toContain('fov_deg     > 0 AND fov_deg    <= 360');
  });

  it('rows written before the shapes existed are dots', () => {
    expect(seed).toContain("UPDATE public.job_map_points SET geometry = 'point' WHERE geometry IS NULL;");
  });

  it('changing a point back to a dot clears the cone and the vertices behind it', () => {
    const route = read('app/api/admin/jobs/[id]/property-map/points/route.ts');
    expect(route).toContain("if (body.geometry !== 'path' && body.geometry !== 'area') patch.vertices = null;");
    expect(route, 'a vertex the renderer cannot draw is never stored').toContain('function cleanVertices');
    expect(route, 'and a drag cannot write ten thousand of them').toContain('raw.slice(0, 500)');
  });

  it('a vertex list that cannot be read degrades to the anchor rather than throwing the map away', () => {
    expect(read('lib/jobs/property-map-server.ts')).toContain('function readVertices');
  });
});
