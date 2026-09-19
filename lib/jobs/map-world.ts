// lib/jobs/map-world.ts — points on the earth, rather than on a picture of it.
//
// Owner, 2026-09-18: "Would it be possible to use google earth or something? … we just have google
// earth in a viewer … we can zoom around and scroll in … say we put in an address and the map zooms
// us to that location … Of course, the point loading and rendering would only show up at a certain
// level of zoom. We wouldn't want a situation where we have 500 points loading all at once."
//
// This is the maths the global map runs on: what is in view, how far apart two things are, and what
// to draw when there are more points in view than anybody can read. No React, no Google, no
// database — so it is built once and tested once, and the map component stays about rendering.
//
// Tested in __tests__/jobs/map-world.test.ts.

export interface LatLng {
  lat: number;
  lng: number;
}

/** A viewport, as Google reports it. `west > east` when the box straddles the antimeridian — which
 *  will never happen in Bell County, but the containment test handles it rather than quietly
 *  returning nothing for anybody who ever pans that far. */
export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

// ── HOW FAR IN YOU HAVE TO BE BEFORE POINTS APPEAR ──────────────────────────────────────────────
//
// Google's zoom scale: 1 is the planet, 10 is a county, 14 is a town, ~18 is a rooftop, 21 is as
// close as satellite imagery goes.
//
// Below MIN_POINT_ZOOM the map does not ask for points at all. That is the owner's "we wouldn't want
// a situation where we have 500 points loading all at once" — but the reason to honour it is not
// really performance, it is legibility: at county zoom, forty pins inside one property render as a
// single unreadable blob on top of each other, and the request that fetched them was wasted.
//
// 12 is about "a few miles across", which is the scale at which one job's points start to separate.
export const MIN_POINT_ZOOM = 12;

/** Above this, every point is drawn individually — the cluster would be the same size as the pins. */
export const CLUSTER_MAX_ZOOM = 17;

/** What one request is allowed to return. A viewport holding more than this is a viewport nobody is
 *  reading point-by-point; the map clusters instead, and says the count is capped. */
export const MAX_POINTS_PER_REQUEST = 600;

/** Where the map opens when nothing else says otherwise: the office in Belton. */
export const DEFAULT_CENTER: LatLng = { lat: 30.99752823122663, lng: -97.40083553223793 };
export const DEFAULT_ZOOM = 10;

/** Close enough to read a fence line, which is what somebody arriving from a job wants to see. */
export const JOB_ZOOM = 18;

export function isLatLng(v: unknown): v is LatLng {
  const p = v as { lat?: unknown; lng?: unknown } | null;
  if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return false;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  if (p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) return false;
  // 0,0 is the Gulf of Guinea, and it is what a failed parse looks like far more often than it is a
  // place anybody meant. The same rule the database enforces (seeds/647).
  return !(p.lat === 0 && p.lng === 0);
}

/** Seven decimals is about a centimetre — past what any of this can justify, and it keeps the JSON
 *  small when six hundred points go over the wire. */
export function roundLatLng(p: LatLng): LatLng {
  const r = (n: number) => Math.round(n * 1e7) / 1e7;
  return { lat: r(p.lat), lng: r(p.lng) };
}

export function boundsContain(b: Bounds, p: LatLng): boolean {
  if (p.lat > b.north || p.lat < b.south) return false;
  // A box that crosses the antimeridian has west > east, and then "inside" is the union of the two
  // halves rather than the span between them.
  return b.west <= b.east ? p.lng >= b.west && p.lng <= b.east : p.lng >= b.west || p.lng <= b.east;
}

/** Grow a viewport by a fraction of its own size.
 *
 *  The map asks for a little more than it shows so that a small pan does not immediately blank the
 *  pins and re-fetch. 25% is roughly one flick of a trackpad in each direction. */
export function padBounds(b: Bounds, fraction = 0.25): Bounds {
  const dLat = Math.abs(b.north - b.south) * fraction;
  const spanLng = b.west <= b.east ? b.east - b.west : 360 - b.west + b.east;
  const dLng = Math.abs(spanLng) * fraction;
  return {
    north: Math.min(90, b.north + dLat),
    south: Math.max(-90, b.south - dLat),
    east: Math.min(180, b.east + dLng),
    west: Math.max(-180, b.west - dLng),
  };
}

/** The box that holds everything given, or null for nothing. Used to frame a job's points. */
export function boundsOf(points: LatLng[]): Bounds | null {
  const usable = points.filter(isLatLng);
  if (!usable.length) return null;
  return {
    north: Math.max(...usable.map((p) => p.lat)),
    south: Math.min(...usable.map((p) => p.lat)),
    east: Math.max(...usable.map((p) => p.lng)),
    west: Math.min(...usable.map((p) => p.lng)),
  };
}

/** A single point has no extent, so framing it would zoom to infinity. This gives it about 60 m. */
export function padPoint(p: LatLng, metres = 60): Bounds {
  const dLat = metres / 111_320;
  const dLng = metres / (111_320 * Math.max(0.01, Math.cos((p.lat * Math.PI) / 180)));
  return { north: p.lat + dLat, south: p.lat - dLat, east: p.lng + dLng, west: p.lng - dLng };
}

// ── DISTANCE ────────────────────────────────────────────────────────────────────────────────────

const FEET_PER_DEG_LAT = 364_000;

/**
 * Feet between two points.
 *
 * Equirectangular, not haversine, and deliberately: over a property — a few thousand feet at most —
 * the two agree to a fraction of a foot, and this one is four operations instead of a dozen
 * trigonometric ones. It is run for every leg of every path on every render.
 */
export function distanceFeet(a: LatLng, b: LatLng): number {
  const midLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dLat = (b.lat - a.lat) * FEET_PER_DEG_LAT;
  const dLng = (b.lng - a.lng) * FEET_PER_DEG_LAT * Math.cos(midLat);
  return Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
}

/** Total length of a walked path, in feet. */
export function pathLengthFeet(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceFeet(points[i - 1], points[i]);
  return total;
}

/**
 * Area of a closed ring, in square feet, by the shoelace formula on a local flat projection.
 *
 * Fine for a parcel; wrong for a county. Anything big enough for the earth's curvature to matter is
 * not a thing this map is drawing.
 */
export function areaSquareFeet(ring: LatLng[]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring.reduce((s, p) => s + p.lat, 0) / ring.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = ring.map((p) => ({ x: p.lng * FEET_PER_DEG_LAT * k, y: p.lat * FEET_PER_DEG_LAT }));
  let twice = 0;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice / 2);
}

export function acresFrom(squareFeet: number): number {
  return Math.round((squareFeet / 43_560) * 100) / 100;
}

/** Compass bearing from one point to another, 0 = north, clockwise. What a photo-direction cone
 *  points along. */
export function bearingDeg(from: LatLng, to: LatLng): number {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Move a given distance along a bearing. Draws the far edge of a camera cone. */
export function destination(from: LatLng, bearing: number, feet: number): LatLng {
  const rad = (bearing * Math.PI) / 180;
  const dLat = (feet * Math.cos(rad)) / FEET_PER_DEG_LAT;
  const dLng = (feet * Math.sin(rad)) / (FEET_PER_DEG_LAT * Math.cos((from.lat * Math.PI) / 180));
  return roundLatLng({ lat: from.lat + dLat, lng: from.lng + dLng });
}

// ── CLUSTERING ──────────────────────────────────────────────────────────────────────────────────

export interface Clusterable extends LatLng {
  id: string;
}

export interface Cluster<T extends Clusterable> {
  /** Stable across renders at the same zoom, so React does not rebuild every marker on a pan. */
  id: string;
  lat: number;
  lng: number;
  items: T[];
}

/**
 * Group points that would land on top of each other into one marker.
 *
 * A grid, not a distance tree: at a given zoom every cell is the same size on screen, so the rule
 * "these would overlap" is exactly "these share a cell", and it costs one pass instead of a
 * quadratic sweep. The cell shrinks as you zoom in until, past CLUSTER_MAX_ZOOM, every point stands
 * alone — which is where somebody has zoomed in far enough to be reading individual pins and a
 * cluster would be actively unhelpful.
 *
 * A cluster of one is returned as a cluster of one rather than unwrapped; the caller decides how to
 * draw it, and a one-item cluster is what makes "draw a pin" and "draw a count" the same code path.
 */
export function clusterPoints<T extends Clusterable>(points: T[], zoom: number): Cluster<T>[] {
  const usable = points.filter(isLatLng);
  if (zoom >= CLUSTER_MAX_ZOOM) {
    return usable.map((p) => ({ id: `solo:${p.id}`, lat: p.lat, lng: p.lng, items: [p] }));
  }

  // Degrees per cell, halving with each zoom level the way the tile pyramid does. At zoom 12 this is
  // ~0.02°, about a mile and a half — the scale at which one property is a dot.
  const cell = 360 / Math.pow(2, Math.max(1, zoom)) / 4;
  const buckets = new Map<string, T[]>();
  for (const p of usable) {
    const key = `${Math.floor(p.lat / cell)}:${Math.floor(p.lng / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }

  return [...buckets.entries()].map(([key, items]) => ({
    id: `c${zoom}:${key}`,
    // The centre of the things in it, not the centre of the cell: a cluster drawn at the cell centre
    // sits in a field next to the property rather than on it.
    lat: items.reduce((s, p) => s + p.lat, 0) / items.length,
    lng: items.reduce((s, p) => s + p.lng, 0) / items.length,
    items,
  }));
}

/**
 * Read a coordinate somebody typed or pasted, or null when it is not one.
 *
 * Owner, 2026-09-19: "I want it so that we can click on the address and be homed to its location on
 * the map and be zoomed in on it. This should work whether it is an address or lat/long."
 *
 * Google Places will not answer "30.9589, -97.5252" — it is an address lookup, and a coordinate is
 * not an address. So a coordinate has to be recognised before the search box hands anything to
 * Google, and then the map simply goes there: no lookup, no cost, no chance of it resolving to a
 * town of the same name.
 *
 * Accepts the shapes that actually get pasted: plain decimal pairs, with or without a comma, and
 * the N/S/E/W suffixes a GPS or a deed produces. Degrees-minutes-seconds too, because that is what
 * comes off older survey documents.
 */
export function parseLatLng(raw: string): LatLng | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  // 30.9589, -97.5252   |   30.9589 -97.5252   |   30.9589N, 97.5252W
  const dec = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EWew])?\s*$/.exec(s);
  if (dec) {
    let lat = Number(dec[1]);
    let lng = Number(dec[3]);
    if (dec[2] && /[Ss]/.test(dec[2])) lat = -Math.abs(lat);
    if (dec[4] && /[Ww]/.test(dec[4])) lng = -Math.abs(lng);
    const hit = { lat, lng };
    return isLatLng(hit) ? roundLatLng(hit) : null;
  }

  // 30°57'32.1"N 97°31'30.9"W
  const dms = /^\s*(\d{1,3})\s*[°d:\s]\s*(\d{1,2})\s*['m:\s]\s*([\d.]+)\s*["s]?\s*([NSns])\s*[,;\s]+\s*(\d{1,3})\s*[°d:\s]\s*(\d{1,2})\s*['m:\s]\s*([\d.]+)\s*["s]?\s*([EWew])\s*$/.exec(s);
  if (dms) {
    const toDeg = (d: string, m: string, sec: string) => Number(d) + Number(m) / 60 + Number(sec) / 3600;
    let lat = toDeg(dms[1], dms[2], dms[3]);
    let lng = toDeg(dms[5], dms[6], dms[7]);
    if (/[Ss]/.test(dms[4])) lat = -lat;
    if (/[Ww]/.test(dms[8])) lng = -lng;
    const hit = { lat, lng };
    return isLatLng(hit) ? roundLatLng(hit) : null;
  }

  return null;
}

// ── WHERE A PIN'S POINT ACTUALLY IS ─────────────────────────────────────────────────────────────
//
// Owner, 2026-09-19: "please make sure the points we place on the map, whether it is the map or the
// satellite map, track with the view appropriately. all of the points should keep their positions
// relative to the map."
//
// A Google marker anchors its content element by the BOTTOM-CENTRE of that element's box. The pin
// is a square rotated 45°, so its visual tip hangs below the box: rotating a 26px square about its
// centre puts the corner a half-diagonal away — 18.4px — while the box only extends 13px. The tip
// therefore sits ~5.4px BELOW where Google put the anchor, and every pin marks a spot 5.4px above
// the thing it is pointing at.
//
// That offset is in SCREEN pixels, so it does not scale with zoom: the ground moves under it while
// the error stays the same size, which is exactly what "the points don't keep their positions"
// looks like. The fix is to give the pin a wrapper tall enough that the tip lands on the wrapper's
// bottom edge, and these are the numbers that do it.
export const PIN_SIZE_PX = 26;
/** Centre to tip: half the square's diagonal. */
export const PIN_TIP_PX = Math.round((PIN_SIZE_PX * Math.SQRT2) / 2 * 10) / 10;
/** How tall the wrapper has to be so its bottom-centre IS the tip. */
export const PIN_BOX_HEIGHT_PX = Math.round((PIN_SIZE_PX / 2 + PIN_TIP_PX) * 10) / 10;

// ── WHAT A PIN LOOKS LIKE RIGHT NOW ─────────────────────────────────────────────────────────────
//
// Owner, 2026-09-19: "whenever I hover over one point, all of the points on that layer light up. I
// just want the one point that I am hovering over to light up. If I hover over the layer in the
// layer list, then all of the points and elements in that layer should light up."
//
// These were one piece of state, and that was the whole bug: a pin's mouseenter set the LAYER
// hover, so pointing at one pin lit every pin on its sheet. They are two different questions and
// they deserve two different answers:
//
//   hovering a LAYER ROW asks "what is on this sheet?"  → light all of it, and dim everything else
//   hovering a PIN asks "what is this one?"             → light that pin, and leave the rest alone
//
// Only the layer hover dims. Dimming the whole map to point at one pin answers a question nobody
// asked, and makes the pin being read the only thing that moved.
//
// This lives here rather than inline in the component because it is a RULE, and the bug it replaces
// was a rule written in the wrong place — where nothing could check it.

export interface HighlightState {
  /** The layer whose row is under the cursor, or null. Set by the layers panel only. */
  hoverLayer: string | null;
  /** The pin under the cursor, or null. Set by the map only. */
  hoverPoint: string | null;
  /** The point whose panel is open. */
  selectedId: string | null;
}

export interface Highlight {
  /** Drawn brighter: this is what you are pointing at. */
  lit: boolean;
  /** Faded back: you are pointing at a different sheet. */
  dim: boolean;
  /** The open point, which stays marked whatever the cursor is doing. */
  on: boolean;
}

export function pinHighlight(
  point: { id: string; layerId: string | null },
  state: HighlightState,
): Highlight {
  const onHoveredLayer = state.hoverLayer !== null && point.layerId === state.hoverLayer;
  return {
    lit: onHoveredLayer || point.id === state.hoverPoint,
    dim: state.hoverLayer !== null && !onHoveredLayer,
    on: point.id === state.selectedId,
  };
}

/** Should a layer's ROW be highlighted? Its own hover, or a pin on it being hovered — the relation
 *  reads from both ends, which is the half of this that was right all along. */
export function layerRowLit(
  layerId: string,
  state: HighlightState,
  layerOfHoveredPoint: string | null,
): boolean {
  return state.hoverLayer === layerId || layerOfHoveredPoint === layerId;
}

/** Should the map be asking the server for points at all? */
export function shouldLoadPoints(zoom: number): boolean {
  return zoom >= MIN_POINT_ZOOM;
}

/** What to tell somebody who is zoomed too far out to see anything. */
export function zoomHint(zoom: number, totalPoints: number): string | null {
  if (zoom >= MIN_POINT_ZOOM) return null;
  if (totalPoints === 0) return 'Zoom in to load points.';
  return `Zoom in to see the ${totalPoints} ${totalPoints === 1 ? 'point' : 'points'} on this map.`;
}
