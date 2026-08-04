// lib/cad/render/ghost-preview.ts — what a transform WILL look like, before it is applied.
//
// CAD_AUDIT S19c — the third extraction out of `CanvasViewport.tsx`.
//
// Mirror, move, copy, flip, invert, rotate and scale all show the surveyor a faint outline of where
// the geometry will land before they commit. This draws it, across **nine geometry types** — point,
// line, polyline, polygon, circle, ellipse, arc, spline and mixed — and every one of them was
// untested, because the function lived inside a 15,000-line `'use client'` component.
//
// ── TWO THINGS CHANGED IN THE MOVE, BOTH DELIBERATE ─────────────────────────────────────────────
//
// **It no longer reads the viewport store.** It called `useViewportStore.getState().zoom` twice, so
// testing it meant standing up a store to draw a circle. `zoom` is now a parameter, matching every
// helper in `lib/cad/geometry/curve-render.ts` — and the call sites already had `zoom` in scope.
//
// **It takes `GraphicsLike`, not Pixi's `Graphics`.** That interface already existed for exactly
// this reason: it is the subset of the drawing API these helpers use, so a test can hand it a
// recorder and read back what was drawn instead of rendering to a canvas.
//
// The geometry itself is unchanged — this is a move, not a rewrite. `transformFeature` still does
// the maths; this decides which primitives express the result.

import type { Feature, Point2D } from '../types';
import type { GraphicsLike, W2S } from '../geometry/curve-render';
import { transformFeature } from '../geometry/transform';

/**
 * Render a faint ghost of `feature` after applying
 * `transformFn` so the user can see exactly where a transform
 * (mirror, move, copy, flip, invert, rotate, scale) will land
 * before committing. Caller must have set `g.lineStyle(...)`
 * already; this only issues moveTo/lineTo/drawCircle calls.
 * World→screen conversion is delegated to `w2s` so this
 * helper stays decoupled from the component's render context.
 */
export function drawTransformedFeaturePreview(
  g: GraphicsLike,
  feature: Feature,
  transformFn: (p: Point2D) => Point2D,
  w2s: W2S,
  zoom: number,
): void {
  const ghost = transformFeature(feature, transformFn);
  const gg = ghost.geometry;

  if (gg.type === 'POINT' && gg.point) {
    const sp = w2s(gg.point.x, gg.point.y);
    g.drawCircle(sp.sx, sp.sy, 3);
    return;
  }
  if (gg.type === 'LINE' && gg.start && gg.end) {
    const a = w2s(gg.start.x, gg.start.y);
    const b = w2s(gg.end.x, gg.end.y);
    g.moveTo(a.sx, a.sy);
    g.lineTo(b.sx, b.sy);
    return;
  }
  if ((gg.type === 'POLYLINE' || gg.type === 'POLYGON') && gg.vertices && gg.vertices.length >= 2) {
    const p0 = w2s(gg.vertices[0].x, gg.vertices[0].y);
    g.moveTo(p0.sx, p0.sy);
    for (let i = 1; i < gg.vertices.length; i += 1) {
      const p = w2s(gg.vertices[i].x, gg.vertices[i].y);
      g.lineTo(p.sx, p.sy);
    }
    if (gg.type === 'POLYGON') g.lineTo(p0.sx, p0.sy);
    return;
  }
  if (gg.type === 'CIRCLE' && gg.circle) {
    const sp = w2s(gg.circle.center.x, gg.circle.center.y);
    const radiusPx = gg.circle.radius * zoom;
    g.drawCircle(sp.sx, sp.sy, radiusPx);
    return;
  }
  if (gg.type === 'ELLIPSE' && gg.ellipse) {
    const e = gg.ellipse;
    const cosR = Math.cos(e.rotation);
    const sinR = Math.sin(e.rotation);
    const samples = 64;
    for (let i = 0; i <= samples; i += 1) {
      const t = (i / samples) * Math.PI * 2;
      const lx = e.radiusX * Math.cos(t);
      const ly = e.radiusY * Math.sin(t);
      const wx = e.center.x + lx * cosR - ly * sinR;
      const wy = e.center.y + lx * sinR + ly * cosR;
      const sp = w2s(wx, wy);
      if (i === 0) g.moveTo(sp.sx, sp.sy);
      else g.lineTo(sp.sx, sp.sy);
    }
    return;
  }
  if (gg.type === 'ARC' && gg.arc) {
    const a = gg.arc;
    const sp = w2s(a.center.x, a.center.y);
    const radiusPx = a.radius * zoom;
    const steps = 32;
    let startA = a.startAngle;
    let endA = a.endAngle;
    if (a.anticlockwise) {
      if (endA <= startA) endA += Math.PI * 2;
    } else {
      if (startA <= endA) startA += Math.PI * 2;
      [startA, endA] = [endA, startA];
    }
    const span = endA - startA;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const angle = startA + span * t;
      const px = sp.sx + radiusPx * Math.cos(angle);
      const py = sp.sy - radiusPx * Math.sin(angle);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    return;
  }
  if (gg.type === 'SPLINE' && gg.spline && gg.spline.controlPoints.length >= 4) {
    const cps = gg.spline.controlPoints;
    const segCount = Math.floor((cps.length - 1) / 3);
    const stepsPerSeg = 24;
    let started = false;
    for (let seg = 0; seg < segCount; seg += 1) {
      const p0 = cps[seg * 3];
      const p1 = cps[seg * 3 + 1];
      const p2 = cps[seg * 3 + 2];
      const p3 = cps[seg * 3 + 3];
      const startStep = started ? 1 : 0;
      for (let i = startStep; i <= stepsPerSeg; i += 1) {
        const t = i / stepsPerSeg;
        const u = 1 - t;
        const wx = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
        const wy = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
        const sp = w2s(wx, wy);
        if (!started) {
          g.moveTo(sp.sx, sp.sy);
          started = true;
        } else {
          g.lineTo(sp.sx, sp.sy);
        }
      }
    }
    return;
  }
  if (gg.type === 'MIXED_GEOMETRY' && gg.vertices && gg.vertices.length >= 2) {
    const p0 = w2s(gg.vertices[0].x, gg.vertices[0].y);
    g.moveTo(p0.sx, p0.sy);
    for (let i = 1; i < gg.vertices.length; i += 1) {
      const p = w2s(gg.vertices[i].x, gg.vertices[i].y);
      g.lineTo(p.sx, p.sy);
    }
  }
}