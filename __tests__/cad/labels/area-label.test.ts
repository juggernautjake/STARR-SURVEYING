// __tests__/cad/labels/area-label.test.ts — Unit tests for area labels
import { describe, it, expect } from 'vitest';
import {
  createAreaAnnotation,
  buildAreaText,
  computeCentroid,
  DEFAULT_AREA_LABEL_CONFIG,
} from '@/lib/cad/labels/area-label';
import type { AreaLabelConfig } from '@/lib/cad/labels/area-label';

const cfg: AreaLabelConfig = { ...DEFAULT_AREA_LABEL_CONFIG };

// ── computeCentroid ───────────────────────────────────────────────────────────

describe('computeCentroid', () => {
  it('returns (0,0) for empty array', () => {
    expect(computeCentroid([])).toEqual({ x: 0, y: 0 });
  });

  it('returns the single point for a 1-vertex array', () => {
    expect(computeCentroid([{ x: 5, y: 10 }])).toEqual({ x: 5, y: 10 });
  });

  it('returns midpoint for two equal-weight points', () => {
    const c = computeCentroid([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    expect(c.x).toBeCloseTo(5, 5);
    expect(c.y).toBeCloseTo(5, 5);
  });

  it('returns center of a 100×100 square', () => {
    const c = computeCentroid([
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 100, y: 100 }, { x: 0, y: 100 },
    ]);
    expect(c.x).toBeCloseTo(50, 3);
    expect(c.y).toBeCloseTo(50, 3);
  });
});

// ── buildAreaText ─────────────────────────────────────────────────────────────

describe('buildAreaText', () => {
  it('SQFT format: shows "Sq. Ft." and no acres', () => {
    const text = buildAreaText(10000, 'SQFT');
    expect(text).toContain('Sq. Ft.');
    expect(text).not.toContain('Acres');
  });

  it('ACRES format: shows "Acres" and correct decimal', () => {
    const text = buildAreaText(43560, 'ACRES');
    expect(text).toContain('1.0000 Acres');
  });

  it('BOTH format: contains both Sq. Ft. and Acres', () => {
    const text = buildAreaText(43560, 'BOTH');
    expect(text).toContain('Sq. Ft.');
    expect(text).toContain('Acres');
  });

  it('LOT_NUMBER format includes LOT and BLK when provided', () => {
    const text = buildAreaText(10000, 'LOT_NUMBER', '5', '2');
    expect(text).toContain('LOT 5');
    expect(text).toContain('BLK 2');
  });

  it('LOT_NUMBER without blockNumber omits BLK', () => {
    const text = buildAreaText(10000, 'LOT_NUMBER', '5', null);
    expect(text).toContain('LOT 5');
    expect(text).not.toContain('BLK');
  });

  it('10,000 sq ft ≈ 0.2296 acres', () => {
    const text = buildAreaText(10000, 'ACRES');
    expect(text).toContain('0.2296');
  });
});

// ── createAreaAnnotation ──────────────────────────────────────────────────────

describe('createAreaAnnotation', () => {
  const square = [
    { x: 0, y: 0 }, { x: 100, y: 0 },
    { x: 100, y: 100 }, { x: 0, y: 100 },
  ];

  it('has type AREA_LABEL', () => {
    const ann = createAreaAnnotation('feat-1', square, cfg);
    expect(ann.type).toBe('AREA_LABEL');
  });

  it('has priority 4', () => {
    const ann = createAreaAnnotation('feat-1', square, cfg);
    expect(ann.priority).toBe(4);
  });

  it('computes correct area for 100×100 square', () => {
    const ann = createAreaAnnotation('feat-1', square, cfg);
    expect(ann.areaSqFt).toBeCloseTo(10000, 1);
    expect(ann.areaAcres).toBeCloseTo(10000 / 43560, 5);
  });

  it('position is the centroid (50,50) for a 100×100 square', () => {
    const ann = createAreaAnnotation('feat-1', square, cfg);
    expect(ann.position.x).toBeCloseTo(50, 3);
    expect(ann.position.y).toBeCloseTo(50, 3);
  });

  it('linkedFeatureId matches provided id', () => {
    const ann = createAreaAnnotation('my-feature', square, cfg);
    expect(ann.linkedFeatureId).toBe('my-feature');
  });

  it('text contains both sq ft and acres with BOTH format', () => {
    const ann = createAreaAnnotation('feat-1', square, { ...cfg, format: 'BOTH' });
    expect(ann.text).toContain('Sq. Ft.');
    expect(ann.text).toContain('Acres');
  });

  it('layerId is ANNOTATION', () => {
    const ann = createAreaAnnotation('feat-1', square, cfg);
    expect(ann.layerId).toBe('ANNOTATION');
  });

  it('stores lotNumber and blockNumber when provided', () => {
    const ann = createAreaAnnotation('feat-1', square, { ...cfg, format: 'LOT_NUMBER' }, 'LOT-3', 'BLK-A');
    expect(ann.lotNumber).toBe('LOT-3');
    expect(ann.blockNumber).toBe('BLK-A');
  });
});
