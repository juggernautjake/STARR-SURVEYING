// __tests__/surveying/triangle.test.ts — the Work Mode surveying calculator's triangle + angle math.
import { describe, it, expect } from 'vitest';
import {
  normalizeAngle, addAngles, subtractAngles, addAnglesDms, subtractAnglesDms,
  complement, supplement, pythagoreanHypotenuse, pythagoreanLeg,
  lawOfSinesSide, lawOfSinesAngle, lawOfCosinesSide, lawOfCosinesAngle,
} from '@/lib/surveying/triangle';

const near = (v: number | null, expected: number, tol = 1e-6) => {
  expect(v).not.toBeNull();
  expect(Math.abs((v as number) - expected)).toBeLessThan(tol);
};

describe('angle arithmetic', () => {
  it('normalizes into [0, 360)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(370)).toBe(10);
    expect(normalizeAngle(-10)).toBe(350);
    expect(normalizeAngle(Number.NaN)).toBeNull();
  });

  it('adds and subtracts, wrapping around 360', () => {
    expect(addAngles(350, 20)).toBe(10);
    expect(subtractAngles(10, 20)).toBe(350);
    expect(subtractAngles(90, 30)).toBe(60);
    expect(addAngles(Number.POSITIVE_INFINITY, 1)).toBeNull();
  });

  it('does DMS angle arithmetic', () => {
    // 45°30'00" + 20°45'00" = 66°15'00"
    const sum = addAnglesDms({ deg: 45, min: 30, sec: 0 }, { deg: 20, min: 45, sec: 0 });
    expect(sum).toEqual({ deg: 66, min: 15, sec: 0 });
    // 30°15'00" − 45°30'00" wraps: 344°45'00"
    const diff = subtractAnglesDms({ deg: 30, min: 15, sec: 0 }, { deg: 45, min: 30, sec: 0 });
    expect(diff).toEqual({ deg: 344, min: 45, sec: 0 });
  });

  it('complement is only defined for 0..90; supplement for 0..180', () => {
    expect(complement(30)).toBe(60);
    expect(complement(90)).toBe(0);
    expect(complement(120)).toBeNull();
    expect(supplement(30)).toBe(150);
    expect(supplement(180)).toBe(0);
    expect(supplement(200)).toBeNull();
  });
});

describe('right triangles (Pythagorean)', () => {
  it('hypotenuse from legs (3,4,5)', () => {
    near(pythagoreanHypotenuse(3, 4), 5);
  });
  it('the other leg from hyp + a leg (5,3 → 4)', () => {
    near(pythagoreanLeg(5, 3), 4);
  });
  it('rejects impossible inputs', () => {
    expect(pythagoreanHypotenuse(0, 4)).toBeNull();
    expect(pythagoreanLeg(3, 5)).toBeNull(); // leg cannot exceed the hypotenuse
    expect(pythagoreanLeg(5, 5)).toBeNull(); // degenerate
  });
});

describe('law of sines', () => {
  // A 30-60-90 triangle with the side opposite 30° = 1 → hypotenuse (opp 90°) = 2, side opp 60° = √3.
  it('solves for a side', () => {
    near(lawOfSinesSide(1, 30, 90), 2);
    near(lawOfSinesSide(1, 30, 60), Math.sqrt(3));
  });
  it('solves for an angle (primary solution)', () => {
    near(lawOfSinesAngle(2, 1, 30), 90);
    near(lawOfSinesAngle(Math.sqrt(3), 1, 30), 60);
  });
  it('returns null for an impossible SSA ratio > 1', () => {
    expect(lawOfSinesAngle(10, 1, 30)).toBeNull();
  });
  it('rejects degenerate angles', () => {
    expect(lawOfSinesSide(1, 0, 60)).toBeNull();
    expect(lawOfSinesSide(1, 180, 60)).toBeNull();
  });
});

describe('law of cosines', () => {
  // 3-4-5 right triangle: the angle opposite the 5 side is 90°.
  it('finds the angle opposite the longest side of a 3-4-5', () => {
    near(lawOfCosinesAngle(3, 4, 5), 90);
    near(lawOfCosinesAngle(5, 5, 5), 60); // equilateral
  });
  it('finds the third side from two sides + the included angle', () => {
    near(lawOfCosinesSide(3, 4, 90), 5);
    near(lawOfCosinesSide(1, 1, 60), 1); // equilateral third side
  });
  it('rejects lengths that violate the triangle inequality', () => {
    expect(lawOfCosinesAngle(1, 1, 10)).toBeNull();
    expect(lawOfCosinesAngle(0, 4, 5)).toBeNull();
  });
  it('rejects an included angle outside (0, 180)', () => {
    expect(lawOfCosinesSide(3, 4, 0)).toBeNull();
    expect(lawOfCosinesSide(3, 4, 180)).toBeNull();
  });
});
