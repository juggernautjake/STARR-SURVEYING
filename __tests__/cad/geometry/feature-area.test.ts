// __tests__/cad/geometry/feature-area.test.ts
//
// Slice 227 of cad-area-calculation-multi-unit-2026-05-29.md. Locks
// `computeFeatureArea` — the closed-shape area dispatcher that
// surfaces accurate sq-ft / acres for every geometry kind the
// drawing engine can produce.

import { describe, it, expect } from 'vitest';
import { computeFeatureArea, isVertexLoopClosed } from '@/lib/cad/geometry/area';
import type { Feature, Point2D } from '@/lib/cad/types';

function feat<T extends Feature['geometry']>(geom: T): Feature {
  return {
    id: 'test',
    type: geom.type,
    geometry: geom as Feature['geometry'],
    layerId: 'L',
    style: { color: '#000', lineWeight: 1, opacity: 1 } as Feature['style'],
    properties: {},
  };
}

const square100x100: Point2D[] = [
  { x: 0,   y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0,   y: 100 },
];

describe('computeFeatureArea — POLYGON', () => {
  it('returns the shoelace area for a 100×100 square', () => {
    const r = computeFeatureArea(feat({ type: 'POLYGON', vertices: square100x100 }));
    expect(r.squareFeet).toBe(10_000);
    expect(r.acres).toBeCloseTo(10_000 / 43560, 6);
    expect(r.geometryKind).toBe('POLYGON');
  });

  it('reports zero on a degenerate polygon (< 3 vertices)', () => {
    const r = computeFeatureArea(feat({ type: 'POLYGON', vertices: square100x100.slice(0, 2) }));
    expect(r.squareFeet).toBe(0);
    expect(r.geometryKind).toBe('POLYGON');
  });

  it('returns the same magnitude for clockwise + counterclockwise vertex orderings', () => {
    const cw = [...square100x100].reverse();
    const ccwArea = computeFeatureArea(feat({ type: 'POLYGON', vertices: square100x100 }));
    const cwArea  = computeFeatureArea(feat({ type: 'POLYGON', vertices: cw }));
    expect(cwArea.squareFeet).toBeCloseTo(ccwArea.squareFeet, 6);
  });
});

describe('computeFeatureArea — CIRCLE', () => {
  it('returns π·r² in square feet', () => {
    const r = computeFeatureArea(feat({
      type: 'CIRCLE',
      circle: { center: { x: 0, y: 0 }, radius: 10 },
    }));
    expect(r.squareFeet).toBeCloseTo(Math.PI * 100, 6);
    expect(r.acres).toBeCloseTo((Math.PI * 100) / 43560, 6);
    expect(r.geometryKind).toBe('CIRCLE');
  });

  it('returns zero for a degenerate / missing radius', () => {
    const r = computeFeatureArea(feat({
      type: 'CIRCLE',
      circle: { center: { x: 0, y: 0 }, radius: 0 },
    }));
    expect(r.squareFeet).toBe(0);
    expect(r.geometryKind).toBe('CIRCLE');
  });
});

describe('computeFeatureArea — ELLIPSE', () => {
  it('returns π·a·b for a non-rotated ellipse', () => {
    const r = computeFeatureArea(feat({
      type: 'ELLIPSE',
      ellipse: { center: { x: 0, y: 0 }, radiusX: 8, radiusY: 5, rotation: 0 },
    }));
    expect(r.squareFeet).toBeCloseTo(Math.PI * 8 * 5, 6);
    expect(r.geometryKind).toBe('ELLIPSE');
  });

  it('does NOT depend on the ellipse rotation (area is invariant)', () => {
    const a = computeFeatureArea(feat({
      type: 'ELLIPSE',
      ellipse: { center: { x: 0, y: 0 }, radiusX: 8, radiusY: 5, rotation: 0 },
    }));
    const b = computeFeatureArea(feat({
      type: 'ELLIPSE',
      ellipse: { center: { x: 0, y: 0 }, radiusX: 8, radiusY: 5, rotation: Math.PI / 4 },
    }));
    expect(b.squareFeet).toBeCloseTo(a.squareFeet, 9);
  });

  it('returns zero for a degenerate / negative radius', () => {
    const r = computeFeatureArea(feat({
      type: 'ELLIPSE',
      ellipse: { center: { x: 0, y: 0 }, radiusX: -1, radiusY: 5, rotation: 0 },
    }));
    expect(r.squareFeet).toBe(0);
    expect(r.geometryKind).toBe('ELLIPSE');
  });
});

describe('computeFeatureArea — closed POLYLINE / MIXED_GEOMETRY', () => {
  it('treats a polyline whose first ≈ last vertex as closed + shoelace areas it', () => {
    const closed = [...square100x100, { x: 0, y: 0 }];
    const r = computeFeatureArea(feat({ type: 'POLYLINE', vertices: closed }));
    expect(r.squareFeet).toBe(10_000);
    expect(r.geometryKind).toBe('POLYLINE_CLOSED');
  });

  it('reports zero on an open polyline', () => {
    const open = square100x100.slice(0, 3); // 3 verts, last ≠ first
    const r = computeFeatureArea(feat({ type: 'POLYLINE', vertices: open }));
    expect(r.squareFeet).toBe(0);
    expect(r.geometryKind).toBe('NONE');
  });

  it('handles MIXED_GEOMETRY with a closed vertex loop', () => {
    const closed = [...square100x100, { x: 0, y: 0 }];
    const r = computeFeatureArea(feat({
      type: 'MIXED_GEOMETRY', vertices: closed,
    } as Feature['geometry']));
    expect(r.squareFeet).toBe(10_000);
    expect(r.geometryKind).toBe('MIXED_CLOSED');
  });
});

describe('computeFeatureArea — open / point-like geometries', () => {
  it('LINE returns zero with kind NONE', () => {
    const r = computeFeatureArea(feat({
      type: 'LINE',
      start: { x: 0, y: 0 },
      end:   { x: 10, y: 10 },
    }));
    expect(r.squareFeet).toBe(0);
    expect(r.geometryKind).toBe('NONE');
  });

  it('POINT returns zero with kind NONE', () => {
    const r = computeFeatureArea(feat({ type: 'POINT', point: { x: 1, y: 1 } }));
    expect(r.squareFeet).toBe(0);
    expect(r.geometryKind).toBe('NONE');
  });
});

describe('isVertexLoopClosed', () => {
  it('returns true when first ≈ last within tolerance', () => {
    const verts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 1e-7 }, // within default tol
    ];
    expect(isVertexLoopClosed(verts)).toBe(true);
  });

  it('returns false when first ≠ last beyond tolerance', () => {
    const verts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 0.5 },
    ];
    expect(isVertexLoopClosed(verts)).toBe(false);
  });

  it('returns false on < 3 vertices', () => {
    expect(isVertexLoopClosed([{ x: 0, y: 0 }, { x: 0, y: 0 }])).toBe(false);
  });
});
