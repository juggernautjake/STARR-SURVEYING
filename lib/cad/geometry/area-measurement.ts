// lib/cad/geometry/area-measurement.ts
//
// Slice W10 (hub-cad-roles-polish-2026-06-18) — pure helpers
// for the area-measure tool's HUD. Extracted from the
// CanvasViewport's MEASURE_AREA case so the in-canvas HUD can
// render the same readouts (and so vitest can exercise the
// math without dragging in PixiJS / next-auth).

import type { Point2D } from '../types';
import { computeAreaFromPoints2D } from './area';

export interface AreaMeasureSummary {
  vertexCount: number;
  /** Open-chain perimeter (sum of segment lengths between
   *  consecutive vertices). */
  perimeterFt: number;
  /** Length of the close-back leg (vertex[n-1] → vertex[0]).
   *  Zero when the polygon would be degenerate (< 3 vertices). */
  closingLegFt: number;
  /** Open perimeter + close-back leg. Matches the legacy
   *  CanvasViewport `closedPerim` value byte-for-byte. */
  closedPerimeterFt: number;
  /** Polygon area in sq ft + acres, or null when < 3 vertices. */
  area: { squareFeet: number; acres: number } | null;
}

/** Pure helper — given the current vertex chain, return the
 *  HUD-ready readouts. Used by `AreaMeasureHUD` and tested
 *  directly. Mirrors the CanvasViewport's MEASURE_AREA case
 *  output. */
export function summarizeAreaMeasurement(points: ReadonlyArray<Point2D>): AreaMeasureSummary {
  if (!points || points.length === 0) {
    return { vertexCount: 0, perimeterFt: 0, closingLegFt: 0, closedPerimeterFt: 0, area: null };
  }

  let perim = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    perim += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  const closing = points.length >= 3
    ? Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y)
    : 0;

  if (points.length < 3) {
    return {
      vertexCount: points.length,
      perimeterFt: perim,
      closingLegFt: 0,
      closedPerimeterFt: perim,
      area: null,
    };
  }

  const a = computeAreaFromPoints2D(points as { x: number; y: number }[]);
  return {
    vertexCount: points.length,
    perimeterFt: perim,
    closingLegFt: closing,
    closedPerimeterFt: perim + closing,
    area: { squareFeet: a.squareFeet, acres: a.acres },
  };
}

/** Round a world-coordinate (in feet) to the nearest grid step.
 *  Used by the snap toggle in the HUD. Pure + exported. */
export function snapToFootGrid(point: Point2D, stepFt: number = 1): Point2D {
  if (!Number.isFinite(stepFt) || stepFt <= 0) return point;
  return {
    x: Math.round(point.x / stepFt) * stepFt,
    y: Math.round(point.y / stepFt) * stepFt,
  };
}
