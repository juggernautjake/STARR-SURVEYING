// lib/jobs/map-shapes-world.ts — the four shapes, drawn on the earth.
//
// Owner, 2026-09-19: "Need to be able to create a single point location, and also a point and its
// corresponding area around it, and a point with a drawn path to another point, and a point with
// field of view lines, and whatever else makes sense."
//
// The four already existed on the image map, where every coordinate was a fraction of a photograph
// and every measurement was a guess. On the earth they become the thing they were always pretending
// to be: a path has a length in feet, an area has acreage, and a camera cone points at a compass
// bearing rather than at a direction on somebody's screenshot.
//
// ── WHY THE FOV RADIUS CHANGED UNITS ────────────────────────────────────────────────────────────
//
// It used to be 0–2 as a fraction of the image, which meant the same cone covered forty feet on a
// close aerial and four hundred on a wide one. It is FEET now. That is a real change of meaning for
// the column, and the reason the old values are not migrated: 0.18 of a photograph is not a distance
// anybody can convert without the photograph.
//
// Pure. Tested in __tests__/jobs/map-shapes-world.test.ts.
import {
  destination, distanceFeet, pathLengthFeet, areaSquareFeet, acresFrom, bearingDeg, roundLatLng,
  type LatLng,
} from './map-world';
import type { GeometryId } from './property-map-shapes';

/** How far a camera cone reaches by default, in feet. About the distance at which a fence post is
 *  still identifiable in a phone photograph. */
export const FOV_DEFAULT_FEET = 150;
export const FOV_MIN_FEET = 10;
export const FOV_MAX_FEET = 5_000;

export function clampFovFeet(feet: number | null | undefined): number {
  // null and undefined are checked BEFORE the Number(): `Number(null)` is 0, which is finite, so a
  // cone with no reach recorded would clamp to the minimum and draw ten feet long instead of taking
  // the default. `Number(undefined)` is NaN, so only one of the two would have been caught.
  if (feet === null || feet === undefined) return FOV_DEFAULT_FEET;
  const n = Number(feet);
  if (!Number.isFinite(n)) return FOV_DEFAULT_FEET;
  return Math.min(FOV_MAX_FEET, Math.max(FOV_MIN_FEET, Math.round(n)));
}

/**
 * The outline of a camera's field of view: the wedge from where somebody stood.
 *
 * Returned as a closed ring starting and ending at the camera, so it draws as a filled wedge rather
 * than as an arc floating in a field. Sixteen segments is enough that the arc reads as curved at any
 * zoom a parcel is viewed at, and few enough that a map of forty cones is not forty times a hundred
 * points.
 */
export function fovRing(at: LatLng, bearing: number, spreadDeg: number, feet: number, segments = 16): LatLng[] {
  const half = Math.min(179.9, Math.max(1, spreadDeg)) / 2;
  const reach = clampFovFeet(feet);
  const ring: LatLng[] = [at];
  for (let i = 0; i <= segments; i++) {
    ring.push(destination(at, bearing - half + (2 * half * i) / segments, reach));
  }
  ring.push(at);
  return ring;
}

/** Is there enough here to draw? A path needs somewhere to go; an area needs to enclose something. */
export function isDrawable(geometry: GeometryId, vertexCount: number): boolean {
  if (geometry === 'path') return vertexCount >= 1;
  if (geometry === 'area') return vertexCount >= 2;
  return true;
}

/** How many more clicks before this shape can be kept. Shown while drawing, so nobody has to guess
 *  why the Finish button is refusing them. */
export function needsMore(geometry: GeometryId, vertexCount: number): string | null {
  if (geometry === 'path') return vertexCount >= 1 ? null : 'Click where the path goes next.';
  if (geometry === 'area') {
    if (vertexCount >= 2) return null;
    return vertexCount === 0 ? 'Click the second corner.' : 'Click one more corner.';
  }
  return null;
}

export interface ShapeMeasure {
  /** One line for the panel: "412 ft", "3 legs · 1,204 ft", "1.8 acres". */
  label: string;
  feet?: number;
  squareFeet?: number;
  acres?: number;
}

/**
 * What a shape measures on the ground.
 *
 * This is the whole reason the map moved to real coordinates. On the image map these numbers either
 * did not exist or required a two-point georeference nobody had ever set, so a walked path was a
 * squiggle and an area was a shape. Here they are feet and acres, from the coordinates themselves,
 * with nothing to configure.
 */
export function measureShape(
  geometry: GeometryId,
  anchor: LatLng,
  vertices: LatLng[],
  fov?: { bearing: number; spreadDeg: number; feet: number },
): ShapeMeasure | null {
  if (geometry === 'path') {
    const line = [anchor, ...vertices];
    if (line.length < 2) return null;
    const feet = pathLengthFeet(line);
    const legs = line.length - 1;
    return { feet, label: `${legs} ${legs === 1 ? 'leg' : 'legs'} · ${feet.toLocaleString()} ft` };
  }

  if (geometry === 'area') {
    const ring = [anchor, ...vertices];
    if (ring.length < 3) return null;
    const squareFeet = Math.round(areaSquareFeet(ring));
    const acres = acresFrom(squareFeet);
    // Acres below a hundredth read as "0 acres", which is worse than no acreage at all.
    return {
      squareFeet,
      acres,
      label: acres >= 0.01
        ? `${acres} ${acres === 1 ? 'acre' : 'acres'} · ${squareFeet.toLocaleString()} sq ft`
        : `${squareFeet.toLocaleString()} sq ft`,
    };
  }

  if (geometry === 'fov' && fov) {
    const reach = clampFovFeet(fov.feet);
    return { feet: reach, label: `${Math.round(fov.spreadDeg)}° · ${reach.toLocaleString()} ft · ${compass(fov.bearing)}` };
  }

  return null;
}

/** "NNE", for a bearing. A surveyor reads a compass point faster than three digits. */
export function compass(deg: number): string {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const i = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return `${names[i]} ${Math.round(((deg % 360) + 360) % 360)}°`;
}

/** Aiming a cone by dragging: where the drag ended becomes the direction and the reach. */
export function aimFrom(at: LatLng, to: LatLng): { bearing: number; feet: number } {
  return { bearing: bearingDeg(at, to), feet: clampFovFeet(distanceFeet(at, to)) };
}

/**
 * Move a whole shape by moving its anchor.
 *
 * Owner, 2026-09-19: "I need to be able to grab existing points and move them around."
 *
 * A point's vertices are absolute positions, not offsets from the anchor, so dragging the pin of a
 * walked path would otherwise leave the path exactly where it was with its first corner torn off
 * and dropped somewhere else. Grabbing a thing and moving it means the thing moves — every vertex
 * shifts by the same delta the anchor did, and the shape arrives intact.
 *
 * A cone needs nothing here: its bearing and reach are relative to the anchor already, so it simply
 * points the same way from the new place.
 */
export function translateShape(from: LatLng, to: LatLng, vertices: LatLng[]): LatLng[] {
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  return vertices.map((v) => roundLatLng({ lat: v.lat + dLat, lng: v.lng + dLng }));
}

/** The line or ring a shape draws, anchor included, ready to hand to Google. */
export function shapePath(
  geometry: GeometryId,
  anchor: LatLng,
  vertices: LatLng[],
  fov?: { bearing: number; spreadDeg: number; feet: number },
): LatLng[] {
  if (geometry === 'fov' && fov) return fovRing(anchor, fov.bearing, fov.spreadDeg, fov.feet);
  if (geometry === 'path' || geometry === 'area') return [anchor, ...vertices];
  return [anchor];
}
