// __tests__/cad/labels/curve-label.test.ts — Unit tests for curve data labels
import { describe, it, expect } from 'vitest';
import {
  buildCurveDataLines,
  createCurveDataAnnotation,
  computeCurveLabelPosition,
  DEFAULT_CURVE_DATA_CONFIG,
} from '@/lib/cad/labels/curve-label';
import type { CurveDataConfig } from '@/lib/cad/labels/curve-label';
import type { CurveParameters } from '@/lib/cad/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal CurveParameters for a 90° (π/2 radian) arc, R=100' */
function mk90DegCurve(): CurveParameters {
  const R = 100;
  const delta = Math.PI / 2; // 90°
  const L = R * delta;          // 157.08'
  const C = 2 * R * Math.sin(delta / 2); // 141.42'
  const T = R * Math.tan(delta / 2);     // 100'
  return {
    R, delta, L, C, CB: 45, T,
    E: R * (1 / Math.cos(delta / 2) - 1),
    M: R * (1 - Math.cos(delta / 2)),
    D: (180 / Math.PI) * (100 / R),
    direction: 'LEFT',
    pc: { x: 0, y: 0 },
    pt: { x: 100, y: 100 },
    pi: { x: 0, y: 100 },
    rp: { x: 0, y: 100 },
    mpc: { x: 50, y: 120 },
    tangentInBearing: 0,
    tangentOutBearing: 90,
  };
}

const cfg: CurveDataConfig = { ...DEFAULT_CURVE_DATA_CONFIG };

// ── buildCurveDataLines ───────────────────────────────────────────────────────

describe('buildCurveDataLines', () => {
  it('with all defaults produces 5 lines (no tangent)', () => {
    const lines = buildCurveDataLines(mk90DegCurve(), cfg);
    expect(lines).toHaveLength(5);
  });

  it('first line starts with "R = 100.00\'"', () => {
    const lines = buildCurveDataLines(mk90DegCurve(), cfg);
    expect(lines[0]).toBe("R = 100.00'");
  });

  it('includes arc length L', () => {
    const lines = buildCurveDataLines(mk90DegCurve(), cfg);
    expect(lines.some(l => l.startsWith('L ='))).toBe(true);
  });

  it('includes delta in degrees', () => {
    const lines = buildCurveDataLines(mk90DegCurve(), cfg);
    const deltaLine = lines.find(l => l.startsWith('Δ ='));
    expect(deltaLine).toBeDefined();
    // 90° → "90.0000°"
    expect(deltaLine).toContain('90.0000');
  });

  it('includes chord bearing CB', () => {
    const lines = buildCurveDataLines(mk90DegCurve(), cfg);
    expect(lines.some(l => l.startsWith('CB ='))).toBe(true);
  });

  it('includes chord distance C', () => {
    const lines = buildCurveDataLines(mk90DegCurve(), cfg);
    expect(lines.some(l => l.startsWith('C ='))).toBe(true);
  });

  it('does NOT include tangent T by default', () => {
    const lines = buildCurveDataLines(mk90DegCurve(), cfg);
    expect(lines.every(l => !l.startsWith('T ='))).toBe(true);
  });

  it('includes tangent T when showTangent=true', () => {
    const custom: CurveDataConfig = { ...cfg, showTangent: true };
    const lines = buildCurveDataLines(mk90DegCurve(), custom);
    expect(lines.some(l => l.startsWith('T ='))).toBe(true);
  });

  it('produces only 1 line when only showRadius=true', () => {
    const minimal: CurveDataConfig = {
      ...cfg,
      showRadius: true,
      showArcLength: false,
      showChordBearing: false,
      showChordDistance: false,
      showDelta: false,
      showTangent: false,
    };
    const lines = buildCurveDataLines(mk90DegCurve(), minimal);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("R = 100.00'");
  });
});

// ── createCurveDataAnnotation ─────────────────────────────────────────────────

describe('createCurveDataAnnotation', () => {
  it('has type CURVE_DATA', () => {
    const ann = createCurveDataAnnotation(mk90DegCurve(), 'feat-1', cfg);
    expect(ann.type).toBe('CURVE_DATA');
  });

  it('has priority 3', () => {
    const ann = createCurveDataAnnotation(mk90DegCurve(), 'feat-1', cfg);
    expect(ann.priority).toBe(3);
  });

  it('links to provided featureId', () => {
    const ann = createCurveDataAnnotation(mk90DegCurve(), 'feat-xyz', cfg);
    expect(ann.linkedFeatureId).toBe('feat-xyz');
  });

  it('layerId is ANNOTATION', () => {
    const ann = createCurveDataAnnotation(mk90DegCurve(), 'f1', cfg);
    expect(ann.layerId).toBe('ANNOTATION');
  });

  it('textLines has 5 entries by default', () => {
    const ann = createCurveDataAnnotation(mk90DegCurve(), 'f1', cfg);
    expect(ann.textLines).toHaveLength(5);
  });

  it('position defaults to OUTSIDE_ARC', () => {
    const ann = createCurveDataAnnotation(mk90DegCurve(), 'f1', cfg);
    expect(ann.position).toBe('OUTSIDE_ARC');
  });

  it('leaderToArc is true by default', () => {
    const ann = createCurveDataAnnotation(mk90DegCurve(), 'f1', cfg);
    expect(ann.leaderToArc).toBe(true);
  });
});

// ── computeCurveLabelPosition ─────────────────────────────────────────────────

describe('computeCurveLabelPosition', () => {
  it('returns a valid point for OUTSIDE_ARC', () => {
    const pos = computeCurveLabelPosition(mk90DegCurve(), 50, 'OUTSIDE_ARC');
    expect(isFinite(pos.x)).toBe(true);
    expect(isFinite(pos.y)).toBe(true);
  });

  it('returns a valid point for INSIDE_ARC', () => {
    const pos = computeCurveLabelPosition(mk90DegCurve(), 50, 'INSIDE_ARC');
    expect(isFinite(pos.x)).toBe(true);
    expect(isFinite(pos.y)).toBe(true);
  });

  it('OUTSIDE_ARC position is farther from center than INSIDE_ARC', () => {
    const curve = mk90DegCurve();
    const outside = computeCurveLabelPosition(curve, 50, 'OUTSIDE_ARC');
    const inside  = computeCurveLabelPosition(curve, 50, 'INSIDE_ARC');
    const distOut = Math.hypot(outside.x - curve.rp.x, outside.y - curve.rp.y);
    const distIn  = Math.hypot(inside.x  - curve.rp.x, inside.y  - curve.rp.y);
    expect(distOut).toBeGreaterThan(distIn);
  });

  it('returns custom position when position=CUSTOM', () => {
    const customPt = { x: 999, y: 888 };
    const pos = computeCurveLabelPosition(mk90DegCurve(), 50, 'CUSTOM', customPt);
    expect(pos.x).toBe(999);
    expect(pos.y).toBe(888);
  });
});
