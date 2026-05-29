// __tests__/cad/operations/recompute-offset-feature.test.ts
//
// Slice 5 of cad-offset-tool-2026-05-29.md. Locks the pure-helper
// contract used by the PropertyPanel distance edit + the Slice-6
// source-mutation propagator.

import { describe, it, expect } from 'vitest';
import type { Feature } from '@/lib/cad/types';
import { recomputeOffsetGeometry } from '@/lib/cad/operations/recompute-offset-feature';

function lineSource(): Feature {
  return {
    id: 'src-line',
    type: 'LINE',
    geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
    layerId: 'layer-0',
    style: { color: '#fff', lineWeight: 1, opacity: 1 } as Feature['style'],
    properties: {},
  };
}

function polylineSource(): Feature {
  return {
    id: 'src-poly',
    type: 'POLYLINE',
    geometry: {
      type: 'POLYLINE',
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    },
    layerId: 'layer-0',
    style: { color: '#fff', lineWeight: 1, opacity: 1 } as Feature['style'],
    properties: {},
  };
}

function circleSource(): Feature {
  return {
    id: 'src-circle',
    type: 'CIRCLE',
    geometry: {
      type: 'CIRCLE',
      circle: { center: { x: 0, y: 0 }, radius: 10 },
    },
    layerId: 'layer-0',
    style: { color: '#fff', lineWeight: 1, opacity: 1 } as Feature['style'],
    properties: {},
  };
}

function ellipseSource(): Feature {
  return {
    id: 'src-ell',
    type: 'ELLIPSE',
    geometry: {
      type: 'ELLIPSE',
      ellipse: { center: { x: 0, y: 0 }, radiusX: 20, radiusY: 10, rotation: 0 },
    },
    layerId: 'layer-0',
    style: { color: '#fff', lineWeight: 1, opacity: 1 } as Feature['style'],
    properties: {},
  };
}

function arcSource(): Feature {
  return {
    id: 'src-arc',
    type: 'ARC',
    geometry: {
      type: 'ARC',
      arc: {
        center: { x: 0, y: 0 },
        radius: 10,
        startAngle: 0,
        endAngle: Math.PI,
        anticlockwise: true,
      },
    },
    layerId: 'layer-0',
    style: { color: '#fff', lineWeight: 1, opacity: 1 } as Feature['style'],
    properties: {},
  };
}

describe('recomputeOffsetGeometry — input validation', () => {
  it('returns null when distance is zero', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: 0, unit: 'FT', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result).toBeNull();
  });

  it('returns null when distance is negative', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: -5, unit: 'FT', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result).toBeNull();
  });

  it('returns null when distance is NaN', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: NaN, unit: 'FT', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result).toBeNull();
  });

  it('returns null when distance is Infinity', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: Infinity, unit: 'FT', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result).toBeNull();
  });
});

describe('recomputeOffsetGeometry — LINE source', () => {
  it('LEFT offset of a horizontal line shifts the line up by the distance', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: 5, unit: 'FT', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result).not.toBeNull();
    expect(result!.geometry.type).toBe('LINE');
    expect(result!.geometry.start!.x).toBeCloseTo(0, 6);
    expect(result!.geometry.start!.y).toBeCloseTo(5, 6);
    expect(result!.geometry.end!.x).toBeCloseTo(10, 6);
    expect(result!.geometry.end!.y).toBeCloseTo(5, 6);
  });

  it('RIGHT offset of a horizontal line shifts the line down by the distance', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: 5, unit: 'FT', side: 'RIGHT', cornerHandling: 'MITER',
    });
    expect(result!.geometry.start!.y).toBeCloseTo(-5, 6);
    expect(result!.geometry.end!.y).toBeCloseTo(-5, 6);
  });

  it('typing a larger distance moves the offset farther from the source', () => {
    const five = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: 5, unit: 'FT', side: 'LEFT', cornerHandling: 'MITER',
    });
    const eight = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: 8, unit: 'FT', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(eight!.geometry.start!.y - five!.geometry.start!.y).toBeCloseTo(3, 6);
  });
});

describe('recomputeOffsetGeometry — unit conversion', () => {
  it('1 m at LEFT side converts to ~3.281 ft of offset', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: 1, unit: 'M', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result!.geometry.start!.y).toBeCloseTo(1 / 0.3048, 4);
  });

  it('12 in equals 1 ft of offset', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: 12, unit: 'IN', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result!.geometry.start!.y).toBeCloseTo(1, 6);
  });

  it('1 mi equals 5280 ft of offset', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: 1, unit: 'MILE', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result!.geometry.start!.y).toBeCloseTo(5280, 4);
  });
});

describe('recomputeOffsetGeometry — POLYLINE source', () => {
  it('produces a polyline offset with at least 2 vertices', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: polylineSource(),
      distance: 2, unit: 'FT', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result!.geometry.type).toBe('POLYLINE');
    expect(result!.geometry.vertices!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('recomputeOffsetGeometry — CIRCLE source', () => {
  it('LEFT side increases the radius (outward parallel)', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: circleSource(),
      distance: 3, unit: 'FT', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result!.geometry.circle!.radius).toBeCloseTo(13, 6);
  });

  it('RIGHT side decreases the radius (inward parallel)', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: circleSource(),
      distance: 3, unit: 'FT', side: 'RIGHT', cornerHandling: 'MITER',
    });
    expect(result!.geometry.circle!.radius).toBeCloseTo(7, 6);
  });

  it('returns null when the inward offset would collapse the circle', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: circleSource(),
      distance: 15, unit: 'FT', side: 'RIGHT', cornerHandling: 'MITER',
    });
    expect(result).toBeNull();
  });
});

describe('recomputeOffsetGeometry — ARC + ELLIPSE sources', () => {
  it('arcs offset by adjusting the radius', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: arcSource(),
      distance: 2, unit: 'FT', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result!.geometry.type).toBe('ARC');
    expect(result!.geometry.arc!.radius).toBeCloseTo(12, 6);
  });

  it('ellipses offset by adjusting both radii', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: ellipseSource(),
      distance: 1, unit: 'FT', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result!.geometry.type).toBe('ELLIPSE');
    expect(result!.geometry.ellipse!.radiusX).toBeGreaterThan(20);
    expect(result!.geometry.ellipse!.radiusY).toBeGreaterThan(10);
  });
});

describe('recomputeOffsetGeometry — metadata round-trip', () => {
  it('passes the typed value + unit through verbatim (not the converted feet)', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: 6, unit: 'IN', side: 'LEFT', cornerHandling: 'CHAMFER',
    });
    expect(result!.metadata).toEqual({
      sourceId: 'src-line',
      distance: 6,
      unit: 'IN',
      side: 'LEFT',
      cornerHandling: 'CHAMFER',
    });
  });

  it('preserves the RIGHT side + ROUND corner across the recompute', () => {
    const result = recomputeOffsetGeometry({
      sourceFeature: polylineSource(),
      distance: 3.5, unit: 'M', side: 'RIGHT', cornerHandling: 'ROUND',
    });
    expect(result!.metadata.side).toBe('RIGHT');
    expect(result!.metadata.cornerHandling).toBe('ROUND');
  });
});

describe('recomputeOffsetGeometry — unsupported geometry', () => {
  it('returns null for POINT sources (offset of a point is not defined)', () => {
    const pointSource: Feature = {
      id: 'src-point',
      type: 'POINT',
      geometry: { type: 'POINT', point: { x: 0, y: 0 } },
      layerId: 'layer-0',
      style: { color: '#fff', lineWeight: 1, opacity: 1 } as Feature['style'],
      properties: {},
    };
    const result = recomputeOffsetGeometry({
      sourceFeature: pointSource,
      distance: 5, unit: 'FT', side: 'LEFT', cornerHandling: 'MITER',
    });
    expect(result).toBeNull();
  });
});
