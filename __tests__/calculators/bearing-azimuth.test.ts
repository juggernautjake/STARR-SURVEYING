// __tests__/calculators/bearing-azimuth.test.ts
//
// Slice P3-ba — pure-math + registration test for the surveyor
// bearing ↔ azimuth converter. The component itself is a thin
// shell over these conversion helpers, so locking the math here
// covers the behavior the user actually cares about.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  azimuthToBearing,
  bearingToAzimuth,
  decimalToDms,
  dmsToDecimal,
  formatAzimuth,
  formatBearing,
  QUADRANTS,
} from '../../lib/calculators/bearing-azimuth/convert';

describe('DMS ↔ decimal', () => {
  it('dmsToDecimal sums degrees + minutes/60 + seconds/3600', () => {
    expect(dmsToDecimal({ deg: 32, min: 15, sec: 0 })).toBeCloseTo(32.25, 6);
    expect(dmsToDecimal({ deg: 0,  min: 0,  sec: 0 })).toBe(0);
    expect(dmsToDecimal({ deg: 45, min: 30, sec: 30 })).toBeCloseTo(45.5083333, 6);
  });

  it('dmsToDecimal returns NaN for negative parts', () => {
    expect(Number.isNaN(dmsToDecimal({ deg: -1, min: 0, sec: 0 }))).toBe(true);
    expect(Number.isNaN(dmsToDecimal({ deg: 0, min: -1, sec: 0 }))).toBe(true);
  });

  it('decimalToDms is the inverse of dmsToDecimal (within rounding)', () => {
    const input = { deg: 122, min: 30, sec: 15 };
    const back = decimalToDms(dmsToDecimal(input));
    expect(back.deg).toBe(122);
    expect(back.min).toBe(30);
    expect(back.sec).toBeCloseTo(15, 1);
  });

  it('decimalToDms carries over to the next minute when seconds round up to 60', () => {
    // 30.999999... degrees should not produce sec: 60.
    const out = decimalToDms(30.999999999);
    expect(out.sec).toBeLessThan(60);
    expect(out.deg + out.min / 60 + out.sec / 3600).toBeCloseTo(31, 2);
  });
});

describe('bearing → azimuth', () => {
  it('NE → azimuth equals the angle (azimuth = bearing)', () => {
    expect(bearingToAzimuth('NE', 32.5)).toBeCloseTo(32.5);
  });
  it('SE → azimuth = 180 - bearing', () => {
    expect(bearingToAzimuth('SE', 32.5)).toBeCloseTo(147.5);
  });
  it('SW → azimuth = 180 + bearing', () => {
    expect(bearingToAzimuth('SW', 32.5)).toBeCloseTo(212.5);
  });
  it('NW → azimuth = 360 - bearing', () => {
    expect(bearingToAzimuth('NW', 32.5)).toBeCloseTo(327.5);
  });
  it('wraps 360 down to 0 so due-north stays a clean read', () => {
    expect(bearingToAzimuth('NE', 0)).toBe(0);
    // N 0° W is also due north (NW with angle 0 → 360 → 0).
    expect(bearingToAzimuth('NW', 0)).toBe(0);
  });
});

describe('azimuth → bearing', () => {
  it('quadrant 1 (0..90) → NE, bearing = azimuth', () => {
    const out = azimuthToBearing(45);
    expect(out.quadrant).toBe('NE');
    expect(out.decimal).toBeCloseTo(45);
  });
  it('quadrant 2 (90..180) → SE, bearing = 180 - azimuth', () => {
    const out = azimuthToBearing(135);
    expect(out.quadrant).toBe('SE');
    expect(out.decimal).toBeCloseTo(45);
  });
  it('quadrant 3 (180..270) → SW, bearing = azimuth - 180', () => {
    const out = azimuthToBearing(225);
    expect(out.quadrant).toBe('SW');
    expect(out.decimal).toBeCloseTo(45);
  });
  it('quadrant 4 (270..360) → NW, bearing = 360 - azimuth', () => {
    const out = azimuthToBearing(315);
    expect(out.quadrant).toBe('NW');
    expect(out.decimal).toBeCloseTo(45);
  });
  it('normalizes out-of-range azimuths back into [0, 360)', () => {
    expect(azimuthToBearing(720).quadrant).toBe('NE');
    expect(azimuthToBearing(-45).quadrant).toBe('NW');
  });
});

describe('round-trip identity', () => {
  for (const q of QUADRANTS) {
    it(`bearing(${q}, 32.5°) → azimuth → bearing recovers ${q}, 32.5°`, () => {
      const az = bearingToAzimuth(q, 32.5);
      const back = azimuthToBearing(az);
      expect(back.quadrant).toBe(q);
      expect(back.decimal).toBeCloseTo(32.5, 5);
    });
  }
});

describe('formatting', () => {
  it('formatBearing produces surveyor notation N … E', () => {
    expect(formatBearing('NE', { deg: 32, min: 15, sec: 40 })).toBe('N 32° 15\' 40" E');
  });
  it('formatBearing flips to S … W for the southwest quadrant', () => {
    expect(formatBearing('SW', { deg: 12, min: 0, sec: 0 })).toBe('S 12° 0\' 0" W');
  });
  it('formatAzimuth omits the quadrant prefix', () => {
    expect(formatAzimuth({ deg: 122, min: 30, sec: 0 })).toBe('122° 30\' 0"');
  });
});

describe('Calculator registration source-lock', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const SRC = fs.readFileSync(
    path.join(repoRoot, 'app/admin/components/calculator/CalculatorProvider.tsx'),
    'utf8',
  );

  it("imports the BearingAzimuth model component", () => {
    expect(SRC).toMatch(/import \{ BearingAzimuth \} from '\.\/models\/BearingAzimuth';/);
  });

  it("adds 'bearing-az' to the ModelKey union", () => {
    expect(SRC).toMatch(/\|\s*'bearing-az'/);
  });

  it("adds 'Surveyor' to the brand union so the new model can label itself", () => {
    expect(SRC).toMatch(/brand:\s*'Generic'\s*\|\s*'TI'\s*\|\s*'Casio'\s*\|\s*'HP'\s*\|\s*'Surveyor';/);
  });

  it("registers the model in CALCULATOR_MODELS with the Surveyor brand", () => {
    expect(SRC).toMatch(/\{ key: 'bearing-az',[\s\S]*?brand: 'Surveyor',[\s\S]*?label: 'Bearing ↔ Azimuth'/);
  });

  it("renderModel routes the new key to <BearingAzimuth />", () => {
    expect(SRC).toMatch(/if \(model\.key === 'bearing-az'\) return <BearingAzimuth \/>;/);
  });
});
