// __tests__/cad/geometry/offset.test.ts — Unit tests for parallel offset engine
import { describe, it, expect } from 'vitest';
import { offsetPolyline, OFFSET_PRESETS } from '@/lib/cad/geometry/offset';
import type { OffsetConfig } from '@/lib/cad/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseConfig: OffsetConfig = {
  distance: 10,
  side: 'RIGHT',
  cornerHandling: 'MITER',
  miterLimit: 4,
  maintainLink: false,
  targetLayerId: null,
};

// ── OFFSET_PRESETS ────────────────────────────────────────────────────────────

describe('OFFSET_PRESETS', () => {
  it('has exactly 12 entries', () => {
    expect(OFFSET_PRESETS).toHaveLength(12);
  });

  it('every preset has id, label, and config', () => {
    for (const preset of OFFSET_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.config).toBeDefined();
    }
  });

  it('preset IDs are unique', () => {
    const ids = OFFSET_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all preset configs have a positive distance', () => {
    for (const preset of OFFSET_PRESETS) {
      expect(preset.config.distance).toBeGreaterThan(0);
    }
  });
});

// ── offsetPolyline: 2-point segment ──────────────────────────────────────────

describe('offsetPolyline: 2-point segment', () => {
  it('returns 2 points for a simple segment offset', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const result = offsetPolyline(pts, baseConfig);
    expect(result).toHaveLength(2);
  });

  it('offset 10\' to the right of a North-going segment → shifted East 10\'', () => {
    // Going North (azimuth 0), right offset should go East (+x)
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 100 }];
    const result = offsetPolyline(pts, { ...baseConfig, side: 'RIGHT' });
    expect(result[0].x).toBeCloseTo(10, 5);
    expect(result[1].x).toBeCloseTo(10, 5);
    expect(result[0].y).toBeCloseTo(0, 5);
    expect(result[1].y).toBeCloseTo(100, 5);
  });

  it('offset 10\' to the left of a North-going segment → shifted West 10\'', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 100 }];
    const result = offsetPolyline(pts, { ...baseConfig, side: 'LEFT' });
    expect(result[0].x).toBeCloseTo(-10, 5);
    expect(result[1].x).toBeCloseTo(-10, 5);
  });

  it('result segment is parallel to input (same length)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const result = offsetPolyline(pts, baseConfig);
    const inputLen = 100;
    const resultLen = Math.sqrt(
      (result[1].x - result[0].x) ** 2 + (result[1].y - result[0].y) ** 2,
    );
    expect(resultLen).toBeCloseTo(inputLen, 4);
  });

  it('returns empty for less than 2 vertices', () => {
    expect(offsetPolyline([], baseConfig)).toHaveLength(0);
    expect(offsetPolyline([{ x: 0, y: 0 }], baseConfig)).toHaveLength(0);
  });
});

// ── offsetPolyline: MITER corner ─────────────────────────────────────────────

describe('offsetPolyline: MITER corner', () => {
  // Right-angle polyline: (0,0) → (100,0) → (100,100)
  const rightAngle = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];

  it('MITER offset of right-angle polyline returns 3 points (intersection collapses corner)', () => {
    const result = offsetPolyline(rightAngle, { ...baseConfig, cornerHandling: 'MITER' });
    expect(result).toHaveLength(3);
  });
});

// ── offsetPolyline: CHAMFER corner ───────────────────────────────────────────

describe('offsetPolyline: CHAMFER corner', () => {
  const rightAngle = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];

  it('CHAMFER offset of right-angle polyline returns 4 points', () => {
    const result = offsetPolyline(rightAngle, { ...baseConfig, cornerHandling: 'CHAMFER' });
    expect(result).toHaveLength(4);
  });
});
