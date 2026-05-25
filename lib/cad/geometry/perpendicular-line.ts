// lib/cad/geometry/perpendicular-line.ts
//
// Pure geometry for the "line off a line" tool: the surveyor locks the start
// point onto an existing line, then extends a new line off it — perpendicular
// (90°) by default, or at a fixed angle measured off the base line, with the
// length set by dragging or typed numerically. The far endpoint can later be
// snapped onto another line by the caller (see lineLineIntersection / the snap
// engine); this module only handles the direction + endpoint math.
//
// Coordinate convention matches the rest of the CAD engine: x = Easting,
// y = Northing, and azimuth is degrees clockwise from North (matching
// bearing.ts forwardPoint / inverseBearingDistance).

import type { Point2D } from '../types';

export interface UnitVector {
  x: number;
  y: number;
}

/** Unit direction from a → b, or null if the points coincide. */
export function unitVector(a: Point2D, b: Point2D): UnitVector | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  return { x: dx / len, y: dy / len };
}

/** Rotate a vector CCW by `deg` degrees (standard math sense, y up). */
export function rotate(v: UnitVector, deg: number): UnitVector {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
}

/**
 * Direction of the offset line as an angle measured off the base line.
 * `angleDeg` defaults to 90 (perpendicular). `side` flips which side of the
 * base line the offset extends to (+1 / -1).
 */
export function offsetDirection(
  baseDir: UnitVector,
  angleDeg: number,
  side: 1 | -1,
): UnitVector {
  return rotate(baseDir, angleDeg * side);
}

/** Endpoint = start + dir * length (dir need not be normalised; it is here). */
export function offsetEndpoint(
  start: Point2D,
  dir: UnitVector,
  length: number,
): Point2D {
  return { x: start.x + dir.x * length, y: start.y + dir.y * length };
}

/**
 * Signed length of the cursor's projection onto `dir`, measured from `start`.
 * Positive when the cursor is on the `dir` side; used to drive drag-to-length
 * while keeping the line locked to the offset direction.
 */
export function projectedLength(
  start: Point2D,
  dir: UnitVector,
  cursor: Point2D,
): number {
  return (cursor.x - start.x) * dir.x + (cursor.y - start.y) * dir.y;
}

/**
 * Which side of the base line the cursor is on: +1 or -1. Uses the 2-D cross
 * product of the base direction with (cursor - start). Returns +1 on the zero
 * line so the result is always a usable side.
 */
export function cursorSide(
  start: Point2D,
  baseDir: UnitVector,
  cursor: Point2D,
): 1 | -1 {
  const cross = baseDir.x * (cursor.y - start.y) - baseDir.y * (cursor.x - start.x);
  return cross < 0 ? -1 : 1;
}

/**
 * Unit direction for an absolute azimuth (degrees clockwise from North).
 * Matches bearing.ts forwardPoint: East = sin(az), North = cos(az).
 */
export function directionFromAzimuth(azimuthDeg: number): UnitVector {
  const r = (azimuthDeg * Math.PI) / 180;
  return { x: Math.sin(r), y: Math.cos(r) };
}

/** Azimuth (degrees clockwise from North, 0–360) of a direction vector. */
export function azimuthOfDirection(dir: UnitVector): number {
  let az = (Math.atan2(dir.x, dir.y) * 180) / Math.PI;
  if (az < 0) az += 360;
  return az;
}
