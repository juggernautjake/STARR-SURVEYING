// __tests__/cad/geometry/curb-return.test.ts — Unit tests for curb-return tool
import { describe, it, expect } from 'vitest';
import { computeCurbReturn, CURB_RETURN_PRESETS } from '@/lib/cad/geometry/curb-return';
import type { CurbReturnInput } from '@/lib/cad/geometry/curb-return';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a CurbReturnInput for two perpendicular lines meeting at the origin. */
function perpendicularInput(radius: number, trimOriginals = false): CurbReturnInput {
  // Line 1: runs East along X-axis from (-200, 0) to (0, 0)
  // Line 2: runs North along Y-axis from (0, 0) to (0, 200)
  return {
    line1Start: { x: -200, y: 0 },
    line1End:   { x: 200, y: 0 },   // extends past intersection so PI is solvable
    line2Start: { x: 0, y: -200 },
    line2End:   { x: 0, y: 200 },
    radius,
    trimOriginals,
  };
}

// ── Tests: computeCurbReturn ──────────────────────────────────────────────────

describe('computeCurbReturn', () => {
  it('returns null for parallel lines', () => {
    const result = computeCurbReturn({
      line1Start: { x: 0, y: 0 },
      line1End:   { x: 100, y: 0 },
      line2Start: { x: 0, y: 50 },
      line2End:   { x: 100, y: 50 },
      radius: 25,
      trimOriginals: false,
    });
    expect(result).toBeNull();
  });

  it('returns a valid CurveParameters object for perpendicular lines', () => {
    const result = computeCurbReturn(perpendicularInput(25));
    expect(result).not.toBeNull();
    expect(result!.curve).toBeDefined();
    expect(result!.curve.R).toBeCloseTo(25, 3);
  });

  it('curve radius matches input radius', () => {
    for (const r of [10, 25, 30, 50]) {
      const result = computeCurbReturn(perpendicularInput(r));
      expect(result).not.toBeNull();
      expect(result!.curve.R).toBeCloseTo(r, 2);
    }
  });

  it('PC and PT are both at distance R from the radius point (center)', () => {
    const radius = 30;
    const result = computeCurbReturn(perpendicularInput(radius));
    expect(result).not.toBeNull();
    const { pc, pt, rp } = result!.curve;
    expect(Math.hypot(pc.x - rp.x, pc.y - rp.y)).toBeCloseTo(radius, 2);
    expect(Math.hypot(pt.x - rp.x, pt.y - rp.y)).toBeCloseTo(radius, 2);
  });

  it('PC is at tangent-length distance from the PI', () => {
    // For 90° turn: T = R × tan(45°) = R
    const radius = 30;
    const result = computeCurbReturn(perpendicularInput(radius));
    expect(result).not.toBeNull();
    const { pc, pi, T } = result!.curve;
    expect(Math.hypot(pc.x - pi.x, pc.y - pi.y)).toBeCloseTo(T, 2);
    expect(T).toBeCloseTo(radius, 2); // T = R for 90° turn
  });

  it('trimmedLine1 and trimmedLine2 are null when trimOriginals=false', () => {
    const result = computeCurbReturn(perpendicularInput(25, false));
    expect(result).not.toBeNull();
    expect(result!.trimmedLine1).toBeNull();
    expect(result!.trimmedLine2).toBeNull();
  });

  it('provides trimmed lines when trimOriginals=true', () => {
    const result = computeCurbReturn(perpendicularInput(25, true));
    expect(result).not.toBeNull();
    expect(result!.trimmedLine1).not.toBeNull();
    expect(result!.trimmedLine2).not.toBeNull();
    // Trimmed line 1 endpoint should equal PC
    const { pc, pt } = result!.curve;
    expect(result!.trimmedLine1!.end.x).toBeCloseTo(pc.x, 2);
    expect(result!.trimmedLine1!.end.y).toBeCloseTo(pc.y, 2);
    // Trimmed line 2 start should equal PT
    expect(result!.trimmedLine2!.start.x).toBeCloseTo(pt.x, 2);
    expect(result!.trimmedLine2!.start.y).toBeCloseTo(pt.y, 2);
  });

  it('arc central angle is ~90° for perpendicular lines', () => {
    const result = computeCurbReturn(perpendicularInput(25));
    expect(result).not.toBeNull();
    const deltaDeg = (result!.curve.delta * 180) / Math.PI;
    expect(deltaDeg).toBeCloseTo(90, 1);
  });

  it('arc length equals R × delta (radians) for a 90° turn', () => {
    const radius = 40;
    const result = computeCurbReturn(perpendicularInput(radius));
    expect(result).not.toBeNull();
    const { L, R, delta } = result!.curve;
    expect(L).toBeCloseTo(R * delta, 3);
  });
});

// ── Tests: CURB_RETURN_PRESETS ────────────────────────────────────────────────

describe('CURB_RETURN_PRESETS', () => {
  it('has exactly 11 entries', () => {
    expect(CURB_RETURN_PRESETS).toHaveLength(11);
  });

  it('every preset has id, label, and radius', () => {
    for (const preset of CURB_RETURN_PRESETS) {
      expect(typeof preset.id).toBe('string');
      expect(preset.id.length).toBeGreaterThan(0);
      expect(typeof preset.label).toBe('string');
      expect(preset.label.length).toBeGreaterThan(0);
      expect(typeof preset.radius).toBe('number');
    }
  });

  it('all preset radii are positive', () => {
    for (const preset of CURB_RETURN_PRESETS) {
      expect(preset.radius).toBeGreaterThan(0);
    }
  });

  it('preset IDs are unique', () => {
    const ids = CURB_RETURN_PRESETS.map(p => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all presets produce valid curves on perpendicular lines', () => {
    for (const preset of CURB_RETURN_PRESETS) {
      const result = computeCurbReturn(perpendicularInput(preset.radius));
      expect(result).not.toBeNull();
      expect(result!.curve.R).toBeCloseTo(preset.radius, 2);
    }
  });

  it('contains expected standard radii', () => {
    const radii = new Set(CURB_RETURN_PRESETS.map(p => p.radius));
    expect(radii.has(25)).toBe(true);  // Residential standard
    expect(radii.has(35)).toBe(true);  // Commercial standard
  });
});
