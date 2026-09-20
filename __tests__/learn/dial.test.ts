// __tests__/learn/dial.test.ts — angle arithmetic, with attention to the wrap.
//
// Every function here looks obvious and is wrong in one case. The cases are what is tested.

import { describe, it, expect } from 'vitest';
import {
  normalize, angularDifference, signedDifference, withinTolerance,
  azimuthFromPoint, snap, turnedTo, toDMS,
} from '@/lib/learn/dial';

describe('normalize', () => {
  it('leaves an angle already in range alone', () => {
    expect(normalize(0)).toBe(0);
    expect(normalize(192)).toBe(192);
    expect(normalize(359.9)).toBeCloseTo(359.9, 6);
  });

  it('brings a negative round', () => {
    expect(normalize(-30)).toBe(330);
    expect(normalize(-360)).toBe(0);
    expect(normalize(-450)).toBe(270);
  });

  it('brings multiple turns down', () => {
    expect(normalize(360)).toBe(0);
    expect(normalize(450)).toBe(90);
    expect(normalize(1080)).toBe(0);
  });

  it('does not produce NaN from a bad input', () => {
    // A drag handler that fires before layout can hand this a NaN, and a NaN azimuth draws an SVG
    // path of the word "NaN" — which does not throw, does not warn, and renders as nothing.
    expect(normalize(Number.NaN)).toBe(0);
    expect(normalize(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('angularDifference — the wrap case is the whole point', () => {
  it('is 2 between 359 and 1, not 358', () => {
    // Math.abs(a - b) gives 358 here. As a tolerance check that tells somebody one degree the
    // wrong side of north that they are 358 degrees out.
    expect(angularDifference(359, 1)).toBe(2);
    expect(angularDifference(1, 359)).toBe(2);
  });

  it('is never more than 180', () => {
    for (let a = 0; a < 360; a += 17) {
      for (let b = 0; b < 360; b += 23) {
        expect(angularDifference(a, b)).toBeLessThanOrEqual(180);
      }
    }
  });

  it('is symmetric', () => {
    expect(angularDifference(30, 200)).toBe(angularDifference(200, 30));
  });

  it('is 0 for the same direction expressed differently', () => {
    expect(angularDifference(0, 360)).toBe(0);
    expect(angularDifference(-90, 270)).toBe(0);
  });

  it('is 180 for opposite directions', () => {
    expect(angularDifference(0, 180)).toBe(180);
    expect(angularDifference(90, 270)).toBe(180);
  });
});

describe('signedDifference — which way to turn', () => {
  it('takes the short way round', () => {
    // "turn 2° clockwise", never "turn 358° anticlockwise".
    expect(signedDifference(359, 1)).toBe(2);
    expect(signedDifference(1, 359)).toBe(-2);
  });

  it('is positive clockwise and negative anticlockwise', () => {
    expect(signedDifference(0, 90)).toBe(90);
    expect(signedDifference(90, 0)).toBe(-90);
  });

  it('stays inside −180 to +180', () => {
    for (let a = 0; a < 360; a += 13) {
      for (let b = 0; b < 360; b += 29) {
        const d = signedDifference(a, b);
        expect(d).toBeGreaterThan(-181);
        expect(d).toBeLessThanOrEqual(180);
      }
    }
  });

  it('resolves the exact half-turn consistently', () => {
    // 180 either way is a genuine tie. It resolves clockwise, and the point is that it resolves the
    // SAME way every time rather than flickering between two answers as a drag crosses it.
    expect(signedDifference(0, 180)).toBe(180);
    expect(signedDifference(180, 0)).toBe(180);
  });

  it('agrees with angularDifference in magnitude', () => {
    for (let a = 0; a < 360; a += 11) {
      for (let b = 0; b < 360; b += 31) {
        expect(Math.abs(signedDifference(a, b))).toBeCloseTo(angularDifference(a, b), 9);
      }
    }
  });
});

describe('withinTolerance', () => {
  it('accepts an aim inside the window, including across north', () => {
    expect(withinTolerance(359, 1, 3)).toBe(true);
    expect(withinTolerance(1, 359, 3)).toBe(true);
  });

  it('rejects one outside it', () => {
    expect(withinTolerance(355, 1, 3)).toBe(false);
  });

  it('accepts exactly on the boundary', () => {
    // A student who lands precisely on the stated tolerance was told that would do.
    expect(withinTolerance(0, 3, 3)).toBe(true);
  });
});

describe('azimuthFromPoint', () => {
  // SVG y grows downward, so "above centre" is a SMALLER y.
  it('reads north as 0 when the point is above the centre', () => {
    expect(azimuthFromPoint(100, 100, 100, 20)).toBe(0);
  });

  it('reads east as 90, south as 180, west as 270', () => {
    expect(azimuthFromPoint(100, 100, 180, 100)).toBe(90);
    expect(azimuthFromPoint(100, 100, 100, 180)).toBe(180);
    expect(azimuthFromPoint(100, 100, 20, 100)).toBe(270);
  });

  it('runs clockwise, not anticlockwise', () => {
    // The mirrored version of this function passes every cardinal test above and reflects
    // everything in between. north-east is what separates them.
    expect(azimuthFromPoint(100, 100, 150, 50)).toBeCloseTo(45, 6);
    expect(azimuthFromPoint(100, 100, 150, 150)).toBeCloseTo(135, 6);
  });

  it('does not blow up at the centre', () => {
    expect(azimuthFromPoint(100, 100, 100, 100)).toBe(0);
  });
});

describe('snap', () => {
  it('rounds to the nearest step', () => {
    expect(snap(47, 5)).toBe(45);
    expect(snap(48, 5)).toBe(50);
  });

  it('snapping near 360 gives 0, not 360', () => {
    // 360 is not in [0, 360) and every comparison downstream assumes it is.
    expect(snap(359.8, 1)).toBe(0);
    expect(snap(358, 5)).toBe(0);
  });

  it('a step of 0 means no snapping', () => {
    expect(snap(47.3, 0)).toBeCloseTo(47.3, 6);
  });
});

describe('turnedTo', () => {
  it('turns clockwise for an angle right', () => {
    expect(turnedTo(90, 45, 'right')).toBe(135);
  });

  it('turns anticlockwise for an angle left', () => {
    expect(turnedTo(90, 45, 'left')).toBe(45);
  });

  it('wraps past north in both directions', () => {
    expect(turnedTo(350, 30, 'right')).toBe(20);
    expect(turnedTo(10, 30, 'left')).toBe(340);
  });

  it('measures a deflection from the extension of the back line', () => {
    // A deflection of 20° right from a backsight of 90° means 20° right of 270°, which is 290° —
    // NOT 110°. This is the distinction the demo exists to teach.
    expect(turnedTo(90, 20, 'right', true)).toBe(290);
    expect(turnedTo(90, 20, 'left', true)).toBe(250);
  });

  it('a zero angle leaves you on the backsight', () => {
    expect(turnedTo(123, 0, 'right')).toBe(123);
    expect(turnedTo(123, 0, 'left')).toBe(123);
  });
});

describe('toDMS', () => {
  it('formats a whole degree', () => {
    expect(toDMS(90)).toBe('90°00′00″');
  });

  it('formats minutes and seconds', () => {
    expect(toDMS(52.241666666)).toBe('52°14′30″');
  });

  it('carries 60 seconds into a minute instead of printing 60', () => {
    // Rounding can produce exactly 60 seconds, which is not a number of seconds.
    expect(toDMS(10 + 30 / 60 + 59.7 / 3600)).toBe('10°31′00″');
  });

  it('carries 60 minutes into a degree', () => {
    expect(toDMS(10 + 59 / 60 + 59.8 / 3600)).toBe('11°00′00″');
  });

  it('carries past 360 back to 0, not to 360', () => {
    expect(toDMS(359 + 59 / 60 + 59.8 / 3600)).toBe('0°00′00″');
  });

  it('normalises a negative first', () => {
    expect(toDMS(-90)).toBe('270°00′00″');
  });
});
