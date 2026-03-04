// __tests__/cad/geometry/bearing.test.ts — Unit tests for bearing/azimuth utilities
import { describe, it, expect } from 'vitest';
import {
  azimuthToQuadrant,
  quadrantToAzimuth,
  parseBearing,
  formatBearing,
  inverseBearingDistance,
  forwardPoint,
  dmsToDecimal,
} from '@/lib/cad/geometry/bearing';

// ── azimuthToQuadrant ─────────────────────────────────────────────────────────

describe('azimuthToQuadrant', () => {
  it('N 45°30\'15" E → azimuth 45.504167°', () => {
    const az = dmsToDecimal(45, 30, 15);
    const qb = azimuthToQuadrant(az);
    expect(qb.direction1).toBe('N');
    expect(qb.direction2).toBe('E');
    expect(qb.degrees).toBe(45);
    expect(qb.minutes).toBe(30);
    // Floating-point normalization may give 14s + 10 tenths or 15s + 0 tenths
    const totalSec = qb.seconds + qb.tenthSeconds / 10;
    expect(totalSec).toBeCloseTo(15, 0);
  });

  it('S 30°15\'00" E → azimuth 149.75°', () => {
    const qb = azimuthToQuadrant(149.75);
    expect(qb.direction1).toBe('S');
    expect(qb.direction2).toBe('E');
    expect(qb.degrees).toBe(30);
    expect(qb.minutes).toBe(15);
    expect(qb.seconds).toBe(0);
  });

  it('Azimuth 225° → S 45°00\'00" W', () => {
    const qb = azimuthToQuadrant(225);
    expect(qb.direction1).toBe('S');
    expect(qb.direction2).toBe('W');
    expect(qb.degrees).toBe(45);
    expect(qb.minutes).toBe(0);
    expect(qb.seconds).toBe(0);
  });

  it('Azimuth 315° → N 45°00\'00" W', () => {
    const qb = azimuthToQuadrant(315);
    expect(qb.direction1).toBe('N');
    expect(qb.direction2).toBe('W');
    expect(qb.degrees).toBe(45);
  });

  it('Azimuth 0° → N 0°00\'00" E', () => {
    const qb = azimuthToQuadrant(0);
    expect(qb.direction1).toBe('N');
    expect(qb.direction2).toBe('E');
    expect(qb.degrees).toBe(0);
  });

  it('Azimuth 90° → S 90°00\'00" E (boundary)', () => {
    const qb = azimuthToQuadrant(90);
    expect(qb.direction1).toBe('S');
    expect(qb.direction2).toBe('E');
    expect(qb.degrees).toBe(90);
    expect(qb.minutes).toBe(0);
  });
});

// ── quadrantToAzimuth ─────────────────────────────────────────────────────────

describe('quadrantToAzimuth', () => {
  it('N 45°30\'15" E → ~45.504167°', () => {
    const az = quadrantToAzimuth({ direction1: 'N', degrees: 45, minutes: 30, seconds: 15, tenthSeconds: 0, direction2: 'E' });
    expect(az).toBeCloseTo(45.504167, 4);
  });

  it('S 30°15\'00" E → 149.75°', () => {
    const az = quadrantToAzimuth({ direction1: 'S', degrees: 30, minutes: 15, seconds: 0, tenthSeconds: 0, direction2: 'E' });
    expect(az).toBeCloseTo(149.75, 5);
  });

  it('S 45°00\'00" W → 225°', () => {
    const az = quadrantToAzimuth({ direction1: 'S', degrees: 45, minutes: 0, seconds: 0, tenthSeconds: 0, direction2: 'W' });
    expect(az).toBeCloseTo(225, 5);
  });

  it('N 45°00\'00" W → 315°', () => {
    const az = quadrantToAzimuth({ direction1: 'N', degrees: 45, minutes: 0, seconds: 0, tenthSeconds: 0, direction2: 'W' });
    expect(az).toBeCloseTo(315, 5);
  });
});

// ── Round-trip: azimuth → quadrant → azimuth ─────────────────────────────────

describe('azimuth round-trip', () => {
  const testAzimuths = [0, 45.504167, 90, 135.75, 180, 225, 270, 315.999];

  for (const az of testAzimuths) {
    it(`azimuth ${az}° survives round-trip`, () => {
      const qb = azimuthToQuadrant(az);
      const back = quadrantToAzimuth(qb);
      expect(back).toBeCloseTo(az, 3);
    });
  }
});

// ── parseBearing ──────────────────────────────────────────────────────────────

describe('parseBearing', () => {
  it('"N 45 30 15 E" returns ~45.504167', () => {
    const result = parseBearing('N 45 30 15 E');
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(45.504167, 4);
  });

  it('"N45-30-15E" returns ~45.504167', () => {
    const result = parseBearing('N45-30-15E');
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(45.504167, 4);
  });

  it('"135.5" returns 135.5 (decimal passthrough)', () => {
    const result = parseBearing('135.5');
    expect(result).toBeCloseTo(135.5, 5);
  });

  it('"N 0 0 0 E" returns 0', () => {
    const result = parseBearing('N 0 0 0 E');
    expect(result).toBeCloseTo(0, 5);
  });

  it('"S 30 15 0 E" returns 149.75', () => {
    const result = parseBearing('S 30 15 0 E');
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(149.75, 4);
  });

  it('returns null for invalid input', () => {
    expect(parseBearing('GARBAGE')).toBeNull();
  });
});

// ── formatBearing round-trip ──────────────────────────────────────────────────

describe('formatBearing', () => {
  it('produces a string matching expected pattern', () => {
    const formatted = formatBearing(45.504167);
    expect(formatted).toMatch(/^[NS]\s*\d+°\d{2}'\d{2}"\s*[EW]$/);
  });

  it('round-trip: parse(format(az)) ≈ az', () => {
    const az = 135.75;
    const formatted = formatBearing(az);
    const parsed = parseBearing(formatted);
    expect(parsed).not.toBeNull();
    expect(parsed!).toBeCloseTo(az, 3);
  });

  it('includes direction characters', () => {
    expect(formatBearing(225)).toMatch(/S/);
    expect(formatBearing(225)).toMatch(/W/);
  });
});

// ── inverseBearingDistance ────────────────────────────────────────────────────

describe('inverseBearingDistance', () => {
  it('due-North leg: azimuth=0, distance=100', () => {
    const result = inverseBearingDistance({ x: 0, y: 0 }, { x: 0, y: 100 });
    expect(result.azimuth).toBeCloseTo(0, 5);
    expect(result.distance).toBeCloseTo(100, 5);
  });

  it('due-East leg: azimuth=90, distance=100', () => {
    const result = inverseBearingDistance({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(result.azimuth).toBeCloseTo(90, 5);
    expect(result.distance).toBeCloseTo(100, 5);
  });

  it('diagonal NE leg: azimuth=45, distance=√2×100', () => {
    const result = inverseBearingDistance({ x: 0, y: 0 }, { x: 100, y: 100 });
    expect(result.azimuth).toBeCloseTo(45, 5);
    expect(result.distance).toBeCloseTo(Math.sqrt(2) * 100, 4);
  });

  it('SW leg: azimuth=225', () => {
    const result = inverseBearingDistance({ x: 100, y: 100 }, { x: 0, y: 0 });
    expect(result.azimuth).toBeCloseTo(225, 5);
  });
});

// ── forwardPoint ──────────────────────────────────────────────────────────────

describe('forwardPoint', () => {
  it('North 100\' from origin → (0, 100)', () => {
    const pt = forwardPoint({ x: 0, y: 0 }, 0, 100);
    expect(pt.x).toBeCloseTo(0, 5);
    expect(pt.y).toBeCloseTo(100, 5);
  });

  it('East 100\' from origin → (100, 0)', () => {
    const pt = forwardPoint({ x: 0, y: 0 }, 90, 100);
    expect(pt.x).toBeCloseTo(100, 5);
    expect(pt.y).toBeCloseTo(0, 5);
  });

  it('NE 45° 100\' from (500, 500) is correct', () => {
    const pt = forwardPoint({ x: 500, y: 500 }, 45, 100);
    expect(pt.x).toBeCloseTo(500 + 100 * Math.sin(Math.PI / 4), 4);
    expect(pt.y).toBeCloseTo(500 + 100 * Math.cos(Math.PI / 4), 4);
  });

  it('inverse of forwardPoint returns original bearing and distance', () => {
    const from = { x: 1000, y: 2000 };
    const az = 137.5;
    const dist = 250;
    const to = forwardPoint(from, az, dist);
    const inv = inverseBearingDistance(from, to);
    expect(inv.azimuth).toBeCloseTo(az, 4);
    expect(inv.distance).toBeCloseTo(dist, 4);
  });
});
