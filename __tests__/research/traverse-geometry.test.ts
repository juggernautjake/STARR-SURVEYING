// __tests__/research/traverse-geometry.test.ts
//
// The coordinate geometry behind the traverse entry panel. **It shipped untested** — three closures
// inside a 3,300-line component, unreachable and therefore uncalled by any test.
//
// Every rule here is a convention that is easy to get backwards and impossible to notice by reading:
// azimuth is from NORTH so easting takes `sin`; `atan2` is passed `(dx, dy)` rather than the usual
// `(y, x)`; and quadrant bearings measure back from south in two of the four quadrants.
//
// **A wrong closing leg does not throw.** It produces a parcel that closes to the wrong corner by a
// few feet — the size of error a surveyor might blame on the record rather than the software.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CLOSED_TOLERANCE, advance, azimuthToBearing, closingLeg, needsClosing,
} from '../../app/admin/research/[projectId]/_sections/traverse-geometry';

const near = (a: number, b: number, p = 6) => expect(a).toBeCloseTo(b, p);

describe('advance — a leg from a point', () => {
  it('due north increases the northing only', () => {
    const p = advance({ x: 0, y: 0 }, { azimuth: 0, distance: 100 });
    near(p.x, 0); near(p.y, 100);
  });

  it('due east increases the easting only', () => {
    // The assertion that fails if sin and cos are swapped. Azimuth 90 is EAST, so x moves.
    const p = advance({ x: 0, y: 0 }, { azimuth: 90, distance: 100 });
    near(p.x, 100); near(p.y, 0);
  });

  it('due south and due west go the other way', () => {
    const s = advance({ x: 0, y: 0 }, { azimuth: 180, distance: 50 });
    near(s.x, 0); near(s.y, -50);
    const w = advance({ x: 0, y: 0 }, { azimuth: 270, distance: 50 });
    near(w.x, -50); near(w.y, 0);
  });

  it('45° splits the distance evenly between north and east', () => {
    const p = advance({ x: 0, y: 0 }, { azimuth: 45, distance: Math.SQRT2 });
    near(p.x, 1); near(p.y, 1);
  });

  it('is relative to where you already are', () => {
    const p = advance({ x: 10, y: 20 }, { azimuth: 90, distance: 5 });
    near(p.x, 15); near(p.y, 20);
  });
});

describe('closingLeg — back to the first corner', () => {
  it('a leg due north closes due south', () => {
    const leg = closingLeg({ x: 0, y: 0 }, { x: 0, y: 100 });
    near(leg.azimuth, 180); near(leg.distance, 100);
  });

  it('a leg due east closes due west', () => {
    // The assertion that fails if atan2's arguments are the conventional way round: with `(dy, dx)`
    // this comes out 180 instead of 270, and every closing leg is rotated 90°.
    const leg = closingLeg({ x: 0, y: 0 }, { x: 100, y: 0 });
    near(leg.azimuth, 270); near(leg.distance, 100);
  });

  it('never returns a negative azimuth', () => {
    // `atan2` returns -π..π. Without the `+360 % 360` normalisation, half of all closing legs are
    // negative and every bearing derived from them lands in the wrong quadrant.
    for (const last of [{ x: 5, y: 5 }, { x: -5, y: 5 }, { x: 5, y: -5 }, { x: -5, y: -5 }]) {
      const { azimuth } = closingLeg({ x: 0, y: 0 }, last);
      expect(azimuth).toBeGreaterThanOrEqual(0);
      expect(azimuth).toBeLessThan(360);
    }
  });

  it('round-trips: closing a leg and walking it lands on the first corner', () => {
    // The property that matters. Any sign or argument-order error breaks this even when the
    // individual numbers look reasonable.
    const first = { x: 12.5, y: -3.25 };
    const last = { x: -40, y: 88 };
    const back = advance(last, closingLeg(first, last));
    near(back.x, first.x, 6); near(back.y, first.y, 6);
  });
});

describe('needsClosing', () => {
  it('refuses fewer than three vertices', () => {
    // Two points are a line; "closing" them retraces the same leg backwards.
    expect(needsClosing([])).toBe(false);
    expect(needsClosing([{ x: 0, y: 0 }])).toBe(false);
    expect(needsClosing([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });

  it('is true for an open triangle', () => {
    expect(needsClosing([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe(true);
  });

  it('is false when the figure already closes', () => {
    // Adding a zero-length leg would put a duplicate vertex on top of the first one, which then
    // shows in the report as a leg of 0.00 feet.
    const v = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }];
    expect(needsClosing(v)).toBe(false);
  });

  it('treats within-tolerance as closed', () => {
    const v = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: CLOSED_TOLERANCE / 2, y: 0 }];
    expect(needsClosing(v)).toBe(false);
  });
});

describe('azimuthToBearing', () => {
  it('names the four cardinal directions from the right quadrant', () => {
    expect(azimuthToBearing(0)).toBe(`N 0° 0' 0" E`);
    expect(azimuthToBearing(90)).toBe(`N 90° 0' 0" E`);
    expect(azimuthToBearing(180)).toBe(`S 0° 0' 0" E`);
    expect(azimuthToBearing(270)).toBe(`S 90° 0' 0" W`);
  });

  it('measures BACK from south in the south-east quadrant', () => {
    // The rule that is one subtraction away from wrong. Azimuth 150 is S 30 E, not S 150 E and not
    // N 30 W — and a reversed subtraction gives a bearing that reads fine and points elsewhere.
    expect(azimuthToBearing(150)).toBe(`S 30° 0' 0" E`);
    expect(azimuthToBearing(210)).toBe(`S 30° 0' 0" W`);
    expect(azimuthToBearing(330)).toBe(`N 30° 0' 0" W`);
  });

  it('converts the fraction to minutes and seconds', () => {
    expect(azimuthToBearing(30.5)).toBe(`N 30° 30' 0" E`);
    expect(azimuthToBearing(30.25)).toBe(`N 30° 15' 0" E`);
    // 0.0025° = 9 seconds exactly.
    expect(azimuthToBearing(30.0025)).toBe(`N 30° 0' 9" E`);
  });

  it('normalises angles outside 0–360 instead of producing nonsense', () => {
    // A closing leg computed before normalisation, or a user typing 450, must not yield "N 450 E".
    expect(azimuthToBearing(450)).toBe(azimuthToBearing(90));
    expect(azimuthToBearing(-90)).toBe(azimuthToBearing(270));
  });
});

describe('the page actually uses this geometry', () => {
  // Correct geometry nobody calls is worth nothing, and a rules module is the easiest place to
  // leave that mistake: it compiles, its own tests pass, and the page keeps the maths it always
  // had. This session found that defect nine times in the research code; it is not going to be
  // introduced here.
  const PAGE = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/research/[projectId]/page.tsx'),
    'utf8',
  );

  it('imports the rules', () => {
    expect(PAGE).toContain("from './_sections/traverse-geometry'");
  });

  it('adds a leg through `advance`', () => {
    expect(PAGE).toContain('advance(last, leg)');
  });

  it('closes a traverse through `needsClosing` and `closingLeg`', () => {
    expect(PAGE).toContain('needsClosing(coordVertices)');
    expect(PAGE).toContain('closingLeg(coordVertices[0]');
  });

  it('no longer carries its own copy of the maths', async () => {
    // Two implementations of a coordinate convention is how they drift, and the page's copy is the
    // one that would run. `azimuthToBearingSimple` was the page's own; it is gone.
    const { stripComments } = await import('../../scripts/audit-starr-assumptions.mjs');
    const code = stripComments(PAGE);
    expect(code).toContain('function handleCloseTraverse');   // control: the stripper kept the code
    expect(code, 'the page still defines its own bearing conversion').not.toContain('azimuthToBearingSimple');
    expect(code, 'the page still computes its own closing azimuth').not.toContain('Math.atan2(dx, dy)');
  });
});
