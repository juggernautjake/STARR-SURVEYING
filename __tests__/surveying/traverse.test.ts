// __tests__/surveying/traverse.test.ts — the Work Mode surveying calculator's traverse computations.
import { describe, it, expect } from 'vitest';
import {
  latitudeDeparture, traverseMisclosure, areaByCoordinates, squareFeetToAcres,
} from '@/lib/surveying/traverse';

const near = (v: number | null | undefined, expected: number, tol = 1e-4) => {
  expect(v).not.toBeNull();
  expect(Math.abs((v as number) - expected)).toBeLessThan(tol);
};

describe('latitudeDeparture', () => {
  it('due north is all latitude, no departure', () => {
    const ld = latitudeDeparture(0, 100)!;
    near(ld.latitude, 100);
    near(ld.departure, 0);
  });
  it('due east is all departure, no latitude', () => {
    const ld = latitudeDeparture(90, 100)!;
    near(ld.latitude, 0);
    near(ld.departure, 100);
  });
  it('a southwest course is negative latitude AND negative departure', () => {
    const ld = latitudeDeparture(225, 100)!; // SW
    expect(ld.latitude).toBeLessThan(0);
    expect(ld.departure).toBeLessThan(0);
    near(ld.latitude, -70.7107);
    near(ld.departure, -70.7107);
  });
  it('rejects a non-finite input', () => {
    expect(latitudeDeparture(Number.NaN, 100)).toBeNull();
  });
});

describe('traverseMisclosure', () => {
  it('a perfect square (N/E/S/W, 100 each) closes exactly', () => {
    const m = traverseMisclosure([
      { azimuth: 0, distance: 100 }, { azimuth: 90, distance: 100 },
      { azimuth: 180, distance: 100 }, { azimuth: 270, distance: 100 },
    ])!;
    near(m.latError, 0);
    near(m.depError, 0);
    near(m.linearError, 0);
    expect(m.perimeter).toBe(400);
    expect(m.precisionDenominator).toBe(0); // exact
  });

  it('reports the linear error + precision when a leg is short', () => {
    // Close the square but make the last leg 99 not 100 → 1 ft of departure error.
    const m = traverseMisclosure([
      { azimuth: 0, distance: 100 }, { azimuth: 90, distance: 100 },
      { azimuth: 180, distance: 100 }, { azimuth: 270, distance: 99 },
    ])!;
    near(m.linearError, 1, 1e-3);
    expect(m.perimeter).toBe(399);
    expect(m.precisionDenominator).toBe(399); // 1:399
  });

  it('returns null for an empty set', () => {
    expect(traverseMisclosure([])).toBeNull();
  });
});

describe('areaByCoordinates (shoelace)', () => {
  it('computes a unit square as 1', () => {
    near(areaByCoordinates([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]), 1);
  });
  it('is orientation-independent (clockwise = counter-clockwise magnitude)', () => {
    const cw = areaByCoordinates([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }]);
    near(cw, 1);
  });
  it('a 100×200 rectangle is 20000', () => {
    near(areaByCoordinates([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }]), 20000);
  });
  it('needs at least 3 points', () => {
    expect(areaByCoordinates([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
  });
});

describe('squareFeetToAcres', () => {
  it('converts an acre exactly', () => {
    near(squareFeetToAcres(43560), 1);
    near(squareFeetToAcres(21780), 0.5);
  });
});
