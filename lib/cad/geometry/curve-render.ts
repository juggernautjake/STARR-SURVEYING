// lib/cad/geometry/curve-render.ts — True curve rendering helpers for PixiJS
//
// These functions draw mathematically correct curves using PixiJS native
// drawing primitives (arc, bezierCurveTo, quadraticCurveTo) rather than
// approximating with line segments.

import type { Point2D, CircleGeometry, EllipseGeometry, ArcGeometry, SplineGeometry } from '../types';

// ── TYPES ──

/** World-to-screen coordinate transformer */
export type W2S = (wx: number, wy: number) => { sx: number; sy: number };

/** PixiJS Graphics-compatible interface (subset we need) */
export interface GraphicsLike {
  lineStyle(width: number, color: number, alpha?: number): void;
  beginFill(color: number, alpha?: number): void;
  endFill(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
  drawCircle(x: number, y: number, radius: number): void;
  drawEllipse(x: number, y: number, width: number, height: number): void;
  drawRect(x: number, y: number, width: number, height: number): void;
  clear(): void;
}

// ── CIRCLE ──

/** Draw a true circle using PixiJS native arc(). */
export function drawCircle(
  g: GraphicsLike,
  circle: CircleGeometry,
  w2s: W2S,
  zoom: number,
) {
  const { sx, sy } = w2s(circle.center.x, circle.center.y);
  const screenRadius = circle.radius * zoom;
  g.drawCircle(sx, sy, screenRadius);
}

/** Draw a filled circle. */
export function drawCircleFill(
  g: GraphicsLike,
  circle: CircleGeometry,
  w2s: W2S,
  zoom: number,
  fillColor: number,
  fillAlpha: number,
) {
  const { sx, sy } = w2s(circle.center.x, circle.center.y);
  const screenRadius = circle.radius * zoom;
  g.beginFill(fillColor, fillAlpha);
  g.drawCircle(sx, sy, screenRadius);
  g.endFill();
}

// ── ELLIPSE ──

/** Draw a true ellipse, potentially rotated, using PixiJS bezier curves.
 *  For axis-aligned ellipses, uses native drawEllipse(). For rotated ellipses,
 *  approximates with 4 cubic bezier segments (the standard Kappa technique). */
export function drawEllipse(
  g: GraphicsLike,
  ellipse: EllipseGeometry,
  w2s: W2S,
  zoom: number,
) {
  const { sx: cx, sy: cy } = w2s(ellipse.center.x, ellipse.center.y);
  const rx = ellipse.radiusX * zoom;
  const ry = ellipse.radiusY * zoom;
  const rot = ellipse.rotation;

  if (Math.abs(rot) < 1e-6) {
    // Axis-aligned: use native PixiJS ellipse
    g.drawEllipse(cx, cy, rx, ry);
    return;
  }

  // Rotated ellipse: use 4 cubic bezier segments (Kappa approximation)
  // The magic constant for approximating a quarter-circle with a cubic bezier
  const kappa = 0.5522847498;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);

  // Transform a point from ellipse-local to screen
  const transform = (lx: number, ly: number) => ({
    x: cx + lx * cosR - ly * sinR,
    y: cy - (lx * sinR + ly * cosR), // negative because screen Y is inverted
  });

  // The 4 cardinal points and their bezier control points
  const right = transform(rx, 0);
  const top = transform(0, ry);
  const left = transform(-rx, 0);
  const bottom = transform(0, -ry);

  // Control points for each quarter
  const cr1 = transform(rx, ry * kappa);
  const cr2 = transform(rx * kappa, ry);

  const cl1 = transform(-rx * kappa, ry);
  const cl2 = transform(-rx, ry * kappa);

  const cl3 = transform(-rx, -ry * kappa);
  const cl4 = transform(-rx * kappa, -ry);

  const cr3 = transform(rx * kappa, -ry);
  const cr4 = transform(rx, -ry * kappa);

  g.moveTo(right.x, right.y);
  g.bezierCurveTo(cr1.x, cr1.y, cr2.x, cr2.y, top.x, top.y);
  g.bezierCurveTo(cl1.x, cl1.y, cl2.x, cl2.y, left.x, left.y);
  g.bezierCurveTo(cl3.x, cl3.y, cl4.x, cl4.y, bottom.x, bottom.y);
  g.bezierCurveTo(cr3.x, cr3.y, cr4.x, cr4.y, right.x, right.y);
  g.closePath();
}

// ── ARC ──

/** Draw a true arc using PixiJS native arc(). */
export function drawArc(
  g: GraphicsLike,
  arc: ArcGeometry,
  w2s: W2S,
  zoom: number,
) {
  const { sx: cx, sy: cy } = w2s(arc.center.x, arc.center.y);
  const screenRadius = arc.radius * zoom;

  // PixiJS screen coordinates: Y is inverted, so angles must be negated
  const screenStart = -arc.startAngle;
  const screenEnd = -arc.endAngle;

  // PixiJS arc expects: arc(cx, cy, r, startAngle, endAngle, anticlockwise)
  // Since Y is inverted, anticlockwise in world = clockwise on screen
  const screenAnticlockwise = !arc.anticlockwise;

  // Move to the start point of the arc
  const startX = cx + screenRadius * Math.cos(screenStart);
  const startY = cy + screenRadius * Math.sin(screenStart);
  g.moveTo(startX, startY);
  g.arc(cx, cy, screenRadius, screenStart, screenEnd, screenAnticlockwise);
}

// ── SPLINE (CUBIC BEZIER) ──

/** Draw a cubic bezier spline using native bezierCurveTo(). */
export function drawSpline(
  g: GraphicsLike,
  spline: SplineGeometry,
  w2s: W2S,
) {
  const pts = spline.controlPoints;
  if (pts.length < 4) return;

  // First point
  const p0 = w2s(pts[0].x, pts[0].y);
  g.moveTo(p0.sx, p0.sy);

  // Each segment uses 3 control points (cubic bezier)
  const numSegments = Math.floor((pts.length - 1) / 3);
  for (let i = 0; i < numSegments; i++) {
    const idx = i * 3;
    const cp1 = w2s(pts[idx + 1].x, pts[idx + 1].y);
    const cp2 = w2s(pts[idx + 2].x, pts[idx + 2].y);
    const end = w2s(pts[idx + 3].x, pts[idx + 3].y);
    g.bezierCurveTo(cp1.sx, cp1.sy, cp2.sx, cp2.sy, end.sx, end.sy);
  }

  if (spline.isClosed && numSegments > 0) {
    g.closePath();
  }
}

// ── HIT TESTING ──

/** Distance from a point to the nearest point on a circle (returns distance to circumference). */
export function pointToCircleDistance(pt: Point2D, circle: CircleGeometry): number {
  const dist = Math.hypot(pt.x - circle.center.x, pt.y - circle.center.y);
  return Math.abs(dist - circle.radius);
}

/** Check if a point is inside a circle. */
export function pointInCircle(pt: Point2D, circle: CircleGeometry): boolean {
  const dist = Math.hypot(pt.x - circle.center.x, pt.y - circle.center.y);
  return dist <= circle.radius;
}

/** Distance from a point to the nearest point on an ellipse boundary. */
export function pointToEllipseDistance(pt: Point2D, ellipse: EllipseGeometry): number {
  // Transform to ellipse-local coordinates (undo rotation)
  const cosR = Math.cos(-ellipse.rotation);
  const sinR = Math.sin(-ellipse.rotation);
  const dx = pt.x - ellipse.center.x;
  const dy = pt.y - ellipse.center.y;
  const lx = dx * cosR - dy * sinR;
  const ly = dx * sinR + dy * cosR;

  // Normalize to unit circle
  const nx = lx / ellipse.radiusX;
  const ny = ly / ellipse.radiusY;
  const normDist = Math.hypot(nx, ny);

  if (normDist < 1e-10) return Math.min(ellipse.radiusX, ellipse.radiusY);

  // Closest point on ellipse in local coords (approximate via normalization)
  const closestLx = lx / normDist;
  const closestLy = ly / normDist;

  // Distance in original coords
  return Math.hypot(lx - closestLx, ly - closestLy);
}

/** Check if a point is inside an ellipse. */
export function pointInEllipse(pt: Point2D, ellipse: EllipseGeometry): boolean {
  const cosR = Math.cos(-ellipse.rotation);
  const sinR = Math.sin(-ellipse.rotation);
  const dx = pt.x - ellipse.center.x;
  const dy = pt.y - ellipse.center.y;
  const lx = dx * cosR - dy * sinR;
  const ly = dx * sinR + dy * cosR;
  return (lx / ellipse.radiusX) ** 2 + (ly / ellipse.radiusY) ** 2 <= 1;
}

/** Distance from a point to the nearest point on an arc. */
export function pointToArcDistance(pt: Point2D, arc: ArcGeometry): number {
  const dx = pt.x - arc.center.x;
  const dy = pt.y - arc.center.y;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  // Check if the point's angle projection falls within the arc's angular span
  if (isAngleInArc(angle, arc)) {
    return Math.abs(dist - arc.radius);
  }

  // Otherwise, distance to the closer endpoint
  const startPt = { x: arc.center.x + arc.radius * Math.cos(arc.startAngle), y: arc.center.y + arc.radius * Math.sin(arc.startAngle) };
  const endPt = { x: arc.center.x + arc.radius * Math.cos(arc.endAngle), y: arc.center.y + arc.radius * Math.sin(arc.endAngle) };
  return Math.min(Math.hypot(pt.x - startPt.x, pt.y - startPt.y), Math.hypot(pt.x - endPt.x, pt.y - endPt.y));
}

/** Check whether an angle falls within an arc's angular span. */
function isAngleInArc(angle: number, arc: ArcGeometry): boolean {
  let a = normalizeAngle(angle);
  let start = normalizeAngle(arc.startAngle);
  let end = normalizeAngle(arc.endAngle);

  if (arc.anticlockwise) {
    // CCW: from start going counter-clockwise to end
    if (start < end) start += 2 * Math.PI;
    return a <= start && a >= end || (a + 2 * Math.PI) <= start && (a + 2 * Math.PI) >= end;
  } else {
    // CW: from start going clockwise to end
    if (end < start) end += 2 * Math.PI;
    return a >= start && a <= end || (a + 2 * Math.PI) >= start && (a + 2 * Math.PI) <= end;
  }
}

function normalizeAngle(a: number): number {
  a = a % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
}

/** Approximate distance from a point to a cubic bezier spline. */
export function pointToSplineDistance(pt: Point2D, spline: SplineGeometry): number {
  const cps = spline.controlPoints;
  if (cps.length < 4) return Infinity;

  let minDist = Infinity;
  const numSegments = Math.floor((cps.length - 1) / 3);
  const samples = 20; // samples per segment

  for (let seg = 0; seg < numSegments; seg++) {
    const idx = seg * 3;
    const p0 = cps[idx], p1 = cps[idx + 1], p2 = cps[idx + 2], p3 = cps[idx + 3];

    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      const u = 1 - t;
      const bx = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
      const by = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
      const d = Math.hypot(pt.x - bx, pt.y - by);
      if (d < minDist) minDist = d;
    }
  }

  return minDist;
}

// ── VERTEX EXTRACTION (for grip editing) ──

/** Get editable grip points for a circle (center + 4 cardinal points). */
export function circleGripPoints(circle: CircleGeometry): Point2D[] {
  const { center, radius } = circle;
  return [
    center,
    { x: center.x + radius, y: center.y },           // East
    { x: center.x, y: center.y + radius },            // North
    { x: center.x - radius, y: center.y },            // West
    { x: center.x, y: center.y - radius },            // South
  ];
}

/** Get editable grip points for an ellipse (center + 4 axis endpoints). */
export function ellipseGripPoints(ellipse: EllipseGeometry): Point2D[] {
  const { center, radiusX, radiusY, rotation } = ellipse;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  return [
    center,
    { x: center.x + radiusX * cosR, y: center.y + radiusX * sinR },       // +X axis
    { x: center.x - radiusY * sinR, y: center.y + radiusY * cosR },       // +Y axis
    { x: center.x - radiusX * cosR, y: center.y - radiusX * sinR },       // -X axis
    { x: center.x + radiusY * sinR, y: center.y - radiusY * cosR },       // -Y axis
  ];
}

/** Get editable grip points for an arc (center + start + mid + end). */
export function arcGripPoints(arc: ArcGeometry): Point2D[] {
  const { center, radius, startAngle, endAngle } = arc;
  const midAngle = (startAngle + endAngle) / 2;
  return [
    center,
    { x: center.x + radius * Math.cos(startAngle), y: center.y + radius * Math.sin(startAngle) },
    { x: center.x + radius * Math.cos(midAngle), y: center.y + radius * Math.sin(midAngle) },
    { x: center.x + radius * Math.cos(endAngle), y: center.y + radius * Math.sin(endAngle) },
  ];
}

/** Get editable grip points for a spline (all control points). */
export function splineGripPoints(spline: SplineGeometry): Point2D[] {
  return [...spline.controlPoints];
}
