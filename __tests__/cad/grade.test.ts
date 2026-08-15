// C29 — slope, grade and vertical curves.
//
// The third of the four capabilities C27 found genuinely absent. Grade between two shots is
// everyday work; the vertical curve is what turns two grades into something a road can be built on.
//
// ── THE FAILURE THESE TESTS ARE AIMED AT ────────────────────────────────────────────────────────
//
// Grade is expressed as a percentage, a ratio, a decimal fraction and an angle depending on who is
// asking, and **two of those differ by a factor of 100 while both looking entirely reasonable** —
// 2% and 0.02 each read as "a gentle grade". So the units are asserted explicitly rather than
// inferred from a round number that happens to work either way.

import { describe, it, expect } from 'vitest';
import {
  gradeBetween,
  elevationAfter,
  verticalCurve,
  elevationAtStation,
  elevationOnVerticalCurve,
  verticalCurveTable,
} from '@/lib/cad/geometry/grade';

describe('grade between two shots', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };

  it('is a PERCENTAGE, not a fraction', () => {
    // The factor-of-100 trap. 2 ft over 100 is 2%, not 0.02.
    expect(gradeBetween(a, b, 100, 102)!.gradePercent).toBeCloseTo(2, 9);
  });

  it('is negative downhill', () => {
    expect(gradeBetween(a, b, 102, 100)!.gradePercent).toBeCloseTo(-2, 9);
  });

  it('reports run, rise and slope distance separately', () => {
    // Run is what a plan shows, slope distance is what a tape measures, and confusing them is a
    // real field error on steep ground.
    const g = gradeBetween({ x: 0, y: 0 }, { x: 30, y: 40 }, 0, 100)!;
    expect(g.run).toBeCloseTo(50, 9);
    expect(g.rise).toBeCloseTo(100, 9);
    expect(g.slopeDistance).toBeCloseTo(Math.hypot(50, 100), 9);
  });

  it('gives the "1 in N" a spec sheet uses', () => {
    expect(gradeBetween(a, b, 100, 105)!.ratio).toBeCloseTo(20, 9);
  });

  it('gives no ratio for dead level', () => {
    // "1 in ∞" is not a number anybody wants printed on a plan.
    const g = gradeBetween(a, b, 100, 100)!;
    expect(g.ratio).toBeNull();
    expect(g.gradePercent).toBe(0);
  });

  it('gives the vertical angle too', () => {
    expect(gradeBetween(a, b, 0, 100)!.verticalAngleDeg).toBeCloseTo(45, 9);
  });

  it('reads z off the points when no elevations are passed', () => {
    expect(gradeBetween({ x: 0, y: 0, z: 10 }, { x: 100, y: 0, z: 13 })!.gradePercent)
      .toBeCloseTo(3, 9);
  });

  it('returns null for two shots on the same spot', () => {
    // Infinite and zero are both wrong here, in ways a caller might not check.
    expect(gradeBetween(a, { x: 0, y: 0 }, 100, 110)).toBeNull();
  });

  it('runs a grade forward', () => {
    expect(elevationAfter(100, -2.5, 40)).toBeCloseTo(99, 9);
  });
});

describe('vertical curve — the tangents', () => {
  // A 400-ft curve, PVI at station 1000 elevation 250, from +3% to −2%. A crest.
  const c = verticalCurve(1000, 250, 3, -2, 400)!;

  it('puts BVC and EVC half a length either side of the PVI', () => {
    expect(c.bvcStation).toBeCloseTo(800, 9);
    expect(c.evcStation).toBeCloseTo(1200, 9);
  });

  it('walks back and forward along the TANGENTS to find their elevations', () => {
    // BVC is 200 ft back at +3%: 250 − 6 = 244. EVC is 200 ft on at −2%: 250 − 4 = 246.
    expect(c.bvcElevation).toBeCloseTo(244, 9);
    expect(c.evcElevation).toBeCloseTo(246, 9);
  });

  it('carries the grades it joined', () => {
    // On the result rather than left for the caller to hold beside it, where the two are free to
    // drift apart.
    expect(c.gIn).toBe(3);
    expect(c.gOut).toBe(-2);
  });

  it('computes A and K', () => {
    expect(c.a).toBeCloseTo(-5, 9);
    expect(c.k).toBeCloseTo(80, 9);
  });

  it('calls a falling A a crest and a rising one a sag', () => {
    expect(c.shape).toBe('CREST');
    expect(verticalCurve(1000, 250, -2, 3, 400)!.shape).toBe('SAG');
  });

  it('refuses a zero or negative length', () => {
    // A zero-length "curve" is the two tangents meeting at a point, and every station formula
    // divides by L.
    expect(verticalCurve(1000, 250, 3, -2, 0)).toBeNull();
    expect(verticalCurve(1000, 250, 3, -2, -100)).toBeNull();
  });
});

describe('vertical curve — the parabola', () => {
  const c = verticalCurve(1000, 250, 3, -2, 400)!;

  it('meets its own endpoints', () => {
    expect(elevationAtStation(c, c.bvcStation)).toBeCloseTo(c.bvcElevation, 9);
    expect(elevationAtStation(c, c.evcStation)).toBeCloseTo(c.evcElevation, 9);
  });

  it('is tangent to the incoming grade at the BVC', () => {
    // The property that makes it a vertical curve rather than any old parabola through three
    // points: the road arrives at the grade it was already on.
    const h = 0.001;
    const slope = (elevationAtStation(c, c.bvcStation + h) - c.bvcElevation) / h;
    expect(slope * 100).toBeCloseTo(c.gIn, 4);
  });

  it('is tangent to the outgoing grade at the EVC', () => {
    const h = 0.001;
    const slope = (c.evcElevation - elevationAtStation(c, c.evcStation - h)) / h;
    expect(slope * 100).toBeCloseTo(c.gOut, 4);
  });

  it('finds the high point of a crest', () => {
    // x = −gIn·L/A = −3·400/−5 = 240 ft past the BVC → station 1040.
    expect(c.turningStation).toBeCloseTo(1040, 6);
    expect(c.turningElevation).toBeCloseTo(
      elevationOnVerticalCurve(c.bvcElevation, c.gIn, c.a, c.length, 240), 9,
    );
  });

  it('the high point really is the highest point on the curve', () => {
    // Checked by sampling, independently of the formula that produced it — a sign slip gives a
    // station that is plausible and is not the summit.
    const best = c.turningElevation!;
    for (let s = c.bvcStation; s <= c.evcStation; s += 1) {
      expect(elevationAtStation(c, s)).toBeLessThanOrEqual(best + 1e-9);
    }
  });

  it('finds the low point of a sag, and it really is lowest', () => {
    const sag = verticalCurve(1000, 250, -3, 2, 400)!;
    expect(sag.shape).toBe('SAG');
    for (let s = sag.bvcStation; s <= sag.evcStation; s += 1) {
      expect(elevationAtStation(sag, s)).toBeGreaterThanOrEqual(sag.turningElevation! - 1e-9);
    }
  });

  it('reports NO turning point when the grades do not reverse', () => {
    // +2% to +4% never turns over. The formula still yields an x — outside [0, L] — and a "high
    // point" 400 ft past the end of the curve is a number somebody would stake.
    const rising = verticalCurve(1000, 250, 2, 4, 400)!;
    expect(rising.turningStation).toBeNull();
    expect(rising.turningElevation).toBeNull();
  });

  it('reports no turning point and no K for equal grades', () => {
    const flat = verticalCurve(1000, 250, 2, 2, 400)!;
    expect(flat.shape).toBe('NONE');
    expect(flat.k).toBeNull();
    expect(flat.turningStation).toBeNull();
  });
});

describe('stations outside the curve follow the TANGENTS', () => {
  const c = verticalCurve(1000, 250, 3, -2, 400)!;

  it('before the BVC', () => {
    // Which is what the road actually does. Extending the parabola instead sends the profile off
    // in a direction the road never goes, more wrongly the further out it is asked.
    expect(elevationAtStation(c, 700)).toBeCloseTo(244 - 3, 9);
  });

  it('after the EVC', () => {
    expect(elevationAtStation(c, 1300)).toBeCloseTo(246 - 2, 9);
  });

  it('and the parabola is strictly between them', () => {
    // A crest sits ABOVE its chord and BELOW its tangents; getting the sign of the A term wrong
    // puts it on the wrong side of both.
    const mid = elevationAtStation(c, 1000);
    expect(mid).toBeLessThan(250);        // below the PVI, on a crest
    expect(mid).toBeGreaterThan(245);     // above the BVC–EVC chord
  });
});

describe('stake-out table', () => {
  const c = verticalCurve(1000, 250, 3, -2, 400)!;
  const rows = verticalCurveTable(c, 50);

  it('starts at the BVC and ends at the EVC', () => {
    expect(rows[0].station).toBeCloseTo(c.bvcStation, 9);
    expect(rows[0].note).toBe('BVC');
    expect(rows[rows.length - 1].station).toBeCloseTo(c.evcStation, 9);
    expect(rows[rows.length - 1].note).toBe('EVC');
  });

  it('includes the turning point, which never lands on an even 50', () => {
    // A profile table without its high point is one somebody has to interpolate by hand at the
    // exact spot where drainage depends on it.
    const hp = rows.find((r) => r.note === 'High point');
    expect(hp).toBeDefined();
    expect(hp!.station).toBeCloseTo(1040, 6);
  });

  it('is in station order with no duplicates', () => {
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].station).toBeGreaterThan(rows[i - 1].station - 1e-9);
    }
    const stations = rows.map((r) => Math.round(r.station * 1e6));
    expect(new Set(stations).size).toBe(stations.length);
  });

  it('every elevation matches the curve', () => {
    for (const r of rows) {
      expect(r.elevation).toBeCloseTo(elevationAtStation(c, r.station), 9);
    }
  });

  it('still gives the three key stations with no interval', () => {
    const minimal = verticalCurveTable(c, 0);
    expect(minimal.map((r) => r.note)).toEqual(['BVC', 'High point', 'EVC']);
  });
});
