// lib/jobs/property-map-shapes.ts — the four ways a point of interest can be drawn.
//
// Owner, 2026-09-16: "I want to be able to create a point that is just a single point on the map.
// Then I want to create a point that has a field of view feature … for pictures that are taken and
// the uploader wanted to show where they were and what direction they were facing and what their
// field of view was … I also want to create a mechanic where the user create the first point, then
// can click to draw connected lines that represent what path they walked … for if the user takes a
// video and starts at one point and then walks to another point."
// And: "The user would need to be able to define the field of view too, how wide or narrow it is
// and in what direction from the point."
//
// Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
// Schema: seeds/642_job_map_point_shapes.sql
//
// ── WHY THE MATHS IS IN PIXELS AND THE DATA IS IN FRACTIONS ─────────────────────────────────────
//
// A point is stored as 0–1 fractions of the image box, so re-scanning the aerial does not move it.
// But fractions are NOT isotropic: on a 4000×3000 image, moving 0.1 across is 400 px and 0.1 down is
// 300 px. Do the trigonometry in fraction space and a 45° camera bearing points somewhere else, a
// cone comes out lopsided, and a "straight" path measures wrong.
//
// So every function here takes the image's pixel dimensions, converts in, does the work in pixels,
// and converts back. Callers that genuinely do not know the dimensions (an aerial whose size was
// never recorded) pass a square, which is the honest approximation and is at least self-consistent.
//
// Pure. No React, no I/O. Tested in __tests__/jobs/property-map-shapes.test.ts.
import { clampToImage, type Georeference, type RelativePoint, distanceFeet, pixelToLatLng } from './property-map';

// ── THE FOUR SHAPES ─────────────────────────────────────────────────────────────────────────────

export type GeometryId = 'point' | 'fov' | 'path' | 'area';

export interface PointGeometry {
  id: GeometryId;
  label: string;
  /** One line, in the editor, under the name. What this shape is FOR. */
  hint: string;
  /** What the person should do, shown while they are drawing. The single most useful thing a
   *  drawing tool can put on screen, and the reason nobody needs to be taught this. */
  howTo: string;
  icon: string;
  /** Does drawing it need more clicks after the first? */
  multiClick: boolean;
}

export const POINT_GEOMETRIES: readonly PointGeometry[] = [
  {
    id: 'point',
    label: 'Single point',
    hint: 'One spot on the property. The default, and what most things are.',
    howTo: 'Click the spot on the map.',
    icon: 'MapPin',
    multiClick: false,
  },
  {
    id: 'fov',
    label: 'Photo direction',
    hint: 'Where somebody stood and which way they were facing — for a photo, so the next person knows what they are looking at.',
    howTo: 'Click where you were standing, then drag to aim. Widen or narrow the cone with its handle, or type the numbers.',
    icon: 'Video',
    multiClick: false,
  },
  {
    id: 'path',
    label: 'Walked path',
    hint: 'A route across the property — for a video taken while walking from one place to another.',
    howTo: 'Click where you started, then click each turn you made. Double-click, press Enter, or hit Finish to end it.',
    icon: 'Route',
    multiClick: true,
  },
  {
    id: 'area',
    label: 'Area',
    hint: 'A region rather than a spot — heavy brush, a flood-prone corner, the stretch of fence that is wrong.',
    howTo: 'Click each corner of the area. Double-click, press Enter, or hit Finish to close it.',
    icon: 'Hexagon',
    multiClick: true,
  },
];

export const DEFAULT_GEOMETRY: GeometryId = 'point';

export function geometryOf(id: string | null | undefined): PointGeometry {
  return POINT_GEOMETRIES.find((g) => g.id === id) ?? POINT_GEOMETRIES[0]!;
}

export function isKnownGeometry(id: string | null | undefined): id is GeometryId {
  return POINT_GEOMETRIES.some((g) => g.id === id);
}

// ── FIELD OF VIEW ───────────────────────────────────────────────────────────────────────────────
// Defaults chosen from real cameras rather than roundness: a phone's main lens is about 68°
// horizontally, which is why a cone drawn at 90° looks wrong beside the photo it describes.

export const FOV_DEFAULT_DEG = 68;
export const FOV_DEFAULT_RADIUS = 0.18;
export const FOV_MIN_DEG = 5;
export const FOV_MAX_DEG = 350;

/** The camera presets offered in the editor, so nobody has to know what 68° means. */
export const FOV_PRESETS: readonly { label: string; deg: number }[] = [
  { label: 'Narrow / zoomed', deg: 30 },
  { label: 'Phone camera', deg: 68 },
  { label: 'Wide', deg: 110 },
  { label: 'Ultra-wide', deg: 150 },
  { label: 'All around', deg: 350 },
];

export function clampBearing(deg: number | null | undefined): number {
  if (!Number.isFinite(deg as number)) return 0;
  return ((((deg as number) % 360) + 360) % 360);
}

export function clampFovDeg(deg: number | null | undefined): number {
  if (!Number.isFinite(deg as number)) return FOV_DEFAULT_DEG;
  return Math.min(FOV_MAX_DEG, Math.max(FOV_MIN_DEG, deg as number));
}

export function clampFovRadius(r: number | null | undefined): number {
  if (!Number.isFinite(r as number)) return FOV_DEFAULT_RADIUS;
  return Math.min(1.5, Math.max(0.02, r as number));
}

/** "North-east (46°)" — how a bearing is written for a person. Compass points, because "roughly
 *  north-east" is what somebody remembers about where they were standing, and the number is there
 *  for whoever wants it. */
const COMPASS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'];

export function bearingLabel(deg: number | null | undefined): string {
  const b = clampBearing(deg);
  return `${COMPASS[Math.round(b / 45) % 8]} (${Math.round(b)}°)`;
}

export interface ImageBox {
  width: number;
  height: number;
}

/** An aerial whose dimensions were never recorded. Square is self-consistent and wrong by the
 *  image's aspect ratio, which is better than being wrong unpredictably. */
export const SQUARE: ImageBox = { width: 1000, height: 1000 };

const toPx = (p: RelativePoint, box: ImageBox) => ({ x: p.x * box.width, y: p.y * box.height });
const toRel = (p: { x: number; y: number }, box: ImageBox) => clampToImage({ x: p.x / box.width, y: p.y / box.height });

/** The bearing from one point to another, in compass degrees clockwise from the top of the image.
 *  This is what a drag produces when somebody aims a camera cone. */
export function bearingBetween(from: RelativePoint, to: RelativePoint, box: ImageBox = SQUARE): number {
  const a = toPx(from, box);
  const b = toPx(to, box);
  // Screen y grows downward, so "up" is -y. atan2(dx, -dy) puts 0 at the top and turns clockwise.
  return clampBearing((Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI);
}

/** How far apart two points are, as a fraction of the image width — what a drag gives us for the
 *  cone's reach. */
export function radiusBetween(from: RelativePoint, to: RelativePoint, box: ImageBox = SQUARE): number {
  const a = toPx(from, box);
  const b = toPx(to, box);
  return clampFovRadius(Math.hypot(b.x - a.x, b.y - a.y) / box.width);
}

/** The cone, as an SVG path in the image's own pixel space (viewBox="0 0 width height").
 *
 *  A wedge, not a triangle: the far edge is an arc, because a camera sees everything out to a
 *  distance, not just the two rays at the edges. Past 350° it is drawn as a full circle, which is
 *  what a 360 photo actually saw. */
export function fovPath(
  origin: RelativePoint,
  bearingDeg: number | null | undefined,
  fovDeg: number | null | undefined,
  fovRadius: number | null | undefined,
  box: ImageBox = SQUARE,
): string {
  const o = toPx(clampToImage(origin), box);
  const r = clampFovRadius(fovRadius) * box.width;
  const width = clampFovDeg(fovDeg);
  const mid = clampBearing(bearingDeg);

  if (width >= 350) {
    // A full circle: two arcs, because one arc cannot close a circle in SVG.
    return `M ${o.x - r} ${o.y} A ${r} ${r} 0 1 0 ${o.x + r} ${o.y} A ${r} ${r} 0 1 0 ${o.x - r} ${o.y} Z`;
  }
  const at = (compassDeg: number) => {
    const rad = ((compassDeg - 90) * Math.PI) / 180;
    return { x: o.x + r * Math.cos(rad), y: o.y + r * Math.sin(rad) };
  };
  const start = at(mid - width / 2);
  const end = at(mid + width / 2);
  const largeArc = width > 180 ? 1 : 0;
  return `M ${o.x} ${o.y} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

/** Where the "aim" handle sits: on the centre line, at the cone's reach. Dragging it sets both the
 *  direction and the distance, which is the whole interaction in one grab. */
export function fovAimHandle(
  origin: RelativePoint,
  bearingDeg: number | null | undefined,
  fovRadius: number | null | undefined,
  box: ImageBox = SQUARE,
): RelativePoint {
  const o = toPx(clampToImage(origin), box);
  const r = clampFovRadius(fovRadius) * box.width;
  const rad = ((clampBearing(bearingDeg) - 90) * Math.PI) / 180;
  return toRel({ x: o.x + r * Math.cos(rad), y: o.y + r * Math.sin(rad) }, box);
}

/** Where the "widen" handle sits: on the cone's right-hand edge. Dragging it around the origin
 *  changes only the width — the angle between it and the centre line is half the field of view. */
export function fovWidthHandle(
  origin: RelativePoint,
  bearingDeg: number | null | undefined,
  fovDeg: number | null | undefined,
  fovRadius: number | null | undefined,
  box: ImageBox = SQUARE,
): RelativePoint {
  const edge = clampBearing(clampBearing(bearingDeg) + clampFovDeg(fovDeg) / 2);
  return fovAimHandle(origin, edge, fovRadius, box);
}

/** What the width handle's new position means, in degrees of field of view. */
export function fovDegFromHandle(
  origin: RelativePoint,
  bearingDeg: number | null | undefined,
  handle: RelativePoint,
  box: ImageBox = SQUARE,
): number {
  const edge = bearingBetween(origin, handle, box);
  // The signed difference between the edge and the centre line, wrapped to ±180.
  let delta = edge - clampBearing(bearingDeg);
  delta = ((((delta + 180) % 360) + 360) % 360) - 180;
  return clampFovDeg(Math.abs(delta) * 2);
}

// ── PATHS AND AREAS ─────────────────────────────────────────────────────────────────────────────

/** Every vertex of a shape, the anchor first. The anchor is stored separately (it is where the
 *  numbered marker goes) but every calculation wants the whole run. */
export function shapePoints(point: { x: number; y: number; vertices?: RelativePoint[] | null }): RelativePoint[] {
  return [clampToImage({ x: point.x, y: point.y }), ...(point.vertices ?? []).map(clampToImage)];
}

/** An SVG polyline/polygon `points` attribute in image pixel space. */
export function shapePointsAttr(points: RelativePoint[], box: ImageBox = SQUARE): string {
  return points.map((p) => { const q = toPx(p, box); return `${q.x},${q.y}`; }).join(' ');
}

/** Drop a vertex that lands on top of the one before it — a double-click that finished the shape
 *  should not also leave a zero-length segment behind. */
export function appendVertex(vertices: RelativePoint[], next: RelativePoint, box: ImageBox = SQUARE): RelativePoint[] {
  const clean = clampToImage(next);
  const last = vertices[vertices.length - 1];
  if (last) {
    const a = toPx(last, box);
    const b = toPx(clean, box);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 4) return vertices;
  }
  return [...vertices, clean];
}

/** How long a walk is, in feet — only where the map has been tied to real coordinates. Without a
 *  georeference there is no honest answer, and an invented one on a survey drawing is worse than
 *  none, so this says nothing rather than guessing. */
export function pathLengthFeet(points: RelativePoint[], geo: Georeference | null | undefined): number | null {
  if (points.length < 2 || !geo) return null;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const leg = distanceFeet(points[i - 1]!, points[i]!, geo);
    if (leg === null) return null;
    total += leg;
  }
  return Math.round(total);
}

/** The area of a closed region, in acres, by the shoelace formula on real coordinates. Same rule:
 *  no georeference, no number. */
export function areaAcres(points: RelativePoint[], geo: Georeference | null | undefined): number | null {
  if (points.length < 3 || !geo) return null;
  const feet: Array<{ x: number; y: number }> = [];
  const origin = pixelToLatLng(points[0]!, geo);
  if (!origin) return null;
  const feetPerDegLat = 364000;
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  for (const p of points) {
    const ll = pixelToLatLng(p, geo);
    if (!ll) return null;
    feet.push({ x: (ll.lng - origin.lng) * feetPerDegLat * cosLat, y: (ll.lat - origin.lat) * feetPerDegLat });
  }
  let twice = 0;
  for (let i = 0; i < feet.length; i += 1) {
    const a = feet[i]!;
    const b = feet[(i + 1) % feet.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  const sqft = Math.abs(twice) / 2;
  return Math.round((sqft / 43560) * 100) / 100;
}

/** Where a path's or an area's label belongs: the middle of a path (so it sits on the line rather
 *  than at one end), the centroid of an area. */
export function shapeLabelAt(geometry: GeometryId, points: RelativePoint[], box: ImageBox = SQUARE): RelativePoint {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  if (geometry === 'path' && points.length > 1) {
    const px = points.map((p) => toPx(p, box));
    const legs = px.slice(1).map((p, i) => Math.hypot(p.x - px[i]!.x, p.y - px[i]!.y));
    const half = legs.reduce((a, b) => a + b, 0) / 2;
    let run = 0;
    for (let i = 0; i < legs.length; i += 1) {
      const leg = legs[i]!;
      if (run + leg >= half) {
        const t = leg === 0 ? 0 : (half - run) / leg;
        const a = px[i]!;
        const b = px[i + 1]!;
        return toRel({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, box);
      }
      run += leg;
    }
  }
  if (geometry === 'area' && points.length > 2) {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return clampToImage({ x: sum.x / points.length, y: sum.y / points.length });
  }
  return points[0]!;
}

/** What the side list says about a shape, under its title. Reads as a sentence, not a data dump,
 *  and says nothing about measurements the map cannot honestly make. */
export function shapeSummary(
  point: { geometry: GeometryId; x: number; y: number; vertices?: RelativePoint[] | null; bearingDeg?: number | null; fovDeg?: number | null },
  geo: Georeference | null | undefined,
): string {
  const pts = shapePoints(point);
  switch (point.geometry) {
    case 'fov': {
      return `Facing ${bearingLabel(point.bearingDeg)}, ${Math.round(clampFovDeg(point.fovDeg))}° across`;
    }
    case 'path': {
      const legs = Math.max(0, pts.length - 1);
      const feet = pathLengthFeet(pts, geo);
      const walk = legs === 0 ? 'Path not drawn yet' : `${legs} ${legs === 1 ? 'leg' : 'legs'}`;
      return feet === null ? walk : `${walk}, about ${feet.toLocaleString()} ft`;
    }
    case 'area': {
      const acres = areaAcres(pts, geo);
      const corners = `${pts.length} corners`;
      return acres === null ? corners : `${corners}, about ${acres} ${acres === 1 ? 'acre' : 'acres'}`;
    }
    default:
      return 'Single point';
  }
}

/** Is there enough here to draw? A path of one click is a dot somebody abandoned; an area of two is
 *  a line. The editor uses this to decide whether Finish is available. */
export function isDrawable(geometry: GeometryId, vertexCount: number): boolean {
  if (geometry === 'path') return vertexCount >= 1;   // anchor + 1 bend = a line
  if (geometry === 'area') return vertexCount >= 2;   // anchor + 2 = a triangle
  return true;
}
