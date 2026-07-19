// __tests__/surveying/angles.test.ts — the Work Mode surveying calculator's direction-angle computations.
import { describe, it, expect } from 'vitest';
import { backAzimuth, angleRight, deflectionAngle, interiorAngle } from '@/lib/surveying/angles';

describe('backAzimuth', () => {
  it('adds 180 and wraps', () => {
    expect(backAzimuth(90)).toBe(270);
    expect(backAzimuth(270)).toBe(90);
    expect(backAzimuth(0)).toBe(180);
    expect(backAzimuth(350)).toBe(170);
    expect(backAzimuth(Number.NaN)).toBeNull();
  });
});

describe('angleRight (clockwise)', () => {
  it('is the clockwise sweep from one direction to another', () => {
    expect(angleRight(0, 90)).toBe(90);
    expect(angleRight(90, 0)).toBe(270);
    expect(angleRight(350, 10)).toBe(20);
  });
});

describe('deflectionAngle', () => {
  it('a right turn is positive/R', () => {
    expect(deflectionAngle(0, 30)).toEqual({ angle: 30, direction: 'R' });
  });
  it('a left turn is L', () => {
    expect(deflectionAngle(0, 330)).toEqual({ angle: 30, direction: 'L' });
  });
  it('no turn and a 180 reversal read as straight', () => {
    expect(deflectionAngle(45, 45)).toEqual({ angle: 0, direction: 'straight' });
    expect(deflectionAngle(0, 180)).toEqual({ angle: 180, direction: 'straight' });
  });
  it('is null for a bad input', () => {
    expect(deflectionAngle(Number.POSITIVE_INFINITY, 10)).toBeNull();
  });
});

describe('interiorAngle', () => {
  it('a 90° corner of a square gives a 90° interior angle', () => {
    // Walk N (az 0) into a station, then turn to walk E (az 90). Back-azimuth of the incoming = 180 (S);
    // clockwise from 180 to 90 = 270... interior of a square walked clockwise is 90 → walk E then S.
    // Incoming East (90), outgoing South (180): back-az of incoming = 270 (W); clockwise 270→180 = 270.
    // Simplest verified case: incoming az 0 (N), outgoing az 270 (W): back-az = 180, clockwise 180→270 = 90.
    expect(interiorAngle(0, 270)).toBe(90);
  });

  it("a square's four interior angles sum to 360 = (4−2)×180", () => {
    // "Angle to the right" gives interior angles for a COUNTER-CLOCKWISE traverse: courses N(0), W(270),
    // S(180), E(90), back to N(0). Each station uses (incoming course, outgoing course).
    const a = interiorAngle(90, 0)!;   // arriving E, leaving N
    const b = interiorAngle(0, 270)!;  // arriving N, leaving W
    const c = interiorAngle(270, 180)!; // arriving W, leaving S
    const d = interiorAngle(180, 90)!;  // arriving S, leaving E
    expect([a, b, c, d]).toEqual([90, 90, 90, 90]);
    expect(a + b + c + d).toBe(360);
  });

  it('is null for a bad input', () => {
    expect(interiorAngle(Number.NaN, 90)).toBeNull();
  });
});
