// lib/cad/ai/selection-points.ts
//
// Pure helpers that pull POINT coordinates out of CAD Feature
// objects for the solver dialogues (Calc Point + Sketch
// Reconcile). Kept as standalone functions — and unit-tested —
// because an inline `.position` typo (the real field is
// `geometry.point`) shipped undetected past the solver unit
// tests and only surfaced at runtime when a POINT was selected.
// See CAD_POINTS_AND_AI audit notes.

import type { Feature, Point2D } from '../types';

export interface SelectedPoint {
  id: string;
  name: string;
  point: Point2D;
}

/** Resolve a feature's display name: its `pointName` property when
 *  present and string-typed, else a short id prefix. */
function featureName(f: Feature): string {
  const raw = f.properties?.pointName;
  return typeof raw === 'string' ? raw : f.id.slice(0, 8);
}

/**
 * Map an arbitrary feature list down to the POINT features with
 * usable coordinates. Features whose geometry is not a POINT, or a
 * POINT missing its `point` coordinate, are dropped rather than
 * throwing — the dialogues treat a short list as "not enough
 * points selected".
 */
export function selectedPoints(features: Feature[]): SelectedPoint[] {
  const out: SelectedPoint[] = [];
  for (const f of features) {
    if (f.geometry.type !== 'POINT') continue;
    const p = f.geometry.point;
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
    out.push({ id: f.id, name: featureName(f), point: { x: p.x, y: p.y } });
  }
  return out;
}

/** Sketch-reconcile shape: name + flat x/y for the Vision prompt. */
export function collectedPoints(features: Feature[]): Array<{ name: string; x: number; y: number }> {
  return selectedPoints(features).map((s) => ({ name: s.name, x: s.point.x, y: s.point.y }));
}
