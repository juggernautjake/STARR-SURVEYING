// lib/cad/geometry/image.ts — Image geometry helpers
//
// An IMAGE feature is stored as a bottom-left anchor (`position`),
// a `width`/`height` in world units, and a `rotation` in radians
// (CCW positive, math convention). The renderer anchors the sprite
// at its bottom-left corner and rotates about that anchor, so the
// bottom-left corner stays pinned to `position` and the rest of the
// box swings around it. These helpers expose that geometry (corners,
// center, local↔world mapping) and the center-preserving rotation
// the editor uses so rotating never makes the image walk away.
import type { Point2D, ImageGeometry } from '../types';

/** Rotate a vector (not a point) by angle radians, CCW positive. */
export function rotateVec(v: Point2D, angleRad: number): Point2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/** The four world-space corners of a (possibly rotated) image. */
export function imageCorners(img: ImageGeometry): {
  bl: Point2D;
  br: Point2D;
  tr: Point2D;
  tl: Point2D;
} {
  const { position: p, width: w, height: h, rotation: t } = img;
  const r = (vx: number, vy: number) => {
    const rv = rotateVec({ x: vx, y: vy }, t);
    return { x: p.x + rv.x, y: p.y + rv.y };
  };
  return {
    bl: { x: p.x, y: p.y },
    br: r(w, 0),
    tr: r(w, h),
    tl: r(0, h),
  };
}

/** World-space geometric center of an image. */
export function imageCenter(img: ImageGeometry): Point2D {
  const rv = rotateVec({ x: img.width / 2, y: img.height / 2 }, img.rotation);
  return { x: img.position.x + rv.x, y: img.position.y + rv.y };
}

/**
 * Map a world point into the image's local frame, where the bottom-left
 * corner is (0,0), +x runs along the (unrotated) width and +y along the
 * height. Used so resize math can stay axis-aligned even when the image
 * is rotated.
 */
export function worldToImageLocal(img: ImageGeometry, p: Point2D): Point2D {
  const d = { x: p.x - img.position.x, y: p.y - img.position.y };
  return rotateVec(d, -img.rotation);
}

/** Inverse of `worldToImageLocal`. */
export function imageLocalToWorld(img: ImageGeometry, local: Point2D): Point2D {
  const rv = rotateVec(local, img.rotation);
  return { x: img.position.x + rv.x, y: img.position.y + rv.y };
}

/**
 * Return a copy of the image rotated to `newRotationRad` while keeping
 * its geometric center fixed. Because the stored anchor is the
 * bottom-left corner, the anchor must move to compensate.
 */
export function setImageRotationAroundCenter(
  img: ImageGeometry,
  newRotationRad: number,
): ImageGeometry {
  const c = imageCenter(img);
  const half = rotateVec({ x: img.width / 2, y: img.height / 2 }, newRotationRad);
  return {
    ...img,
    rotation: newRotationRad,
    position: { x: c.x - half.x, y: c.y - half.y },
  };
}

/** Normalize an angle in degrees to the (-180, 180] range. */
export function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}
