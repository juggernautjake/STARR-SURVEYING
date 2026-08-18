// Exactly what the model sees, in pixels.
//
// The expected values here are ANTHROPIC'S OWN documented examples, taken from the Vision and
// "Coordinates and bounding boxes" pages. That matters: this is a port of somebody else's algorithm,
// so the only test worth writing is one against their published ground truth rather than against
// whatever my port happens to compute.

import { describe, it, expect } from 'vitest';
import {
  HIGH_TIER, STANDARD_TIER, countImageTokens, fitsNatively, mapBoxToOriginal,
  mapCoordinateToOriginal, resizedSize, retainedScale, roundTiesToEven, tierForModel,
} from '@/lib/receipts/vision-geometry';

describe('resizedSize matches the documented reference values', () => {
  it.each([
    // [w, h, expectedW, expectedH] — from the docs' resolution table.
    [200, 200, 200, 200],
    [1000, 1000, 1000, 1000],
    [1092, 1092, 1092, 1092],
    [1920, 1080, 1456, 819],
    [3840, 2160, 1456, 819],
  ])('%ix%i → %ix%i on the standard tier', (w, h, ew, eh) => {
    expect(resizedSize(w, h, STANDARD_TIER)).toEqual([ew, eh]);
  });

  it('2000x1500 lands on an exact .5 tie, where the docs contradict themselves', () => {
    // The docs' summary TABLE says 1269×952. Their REFERENCE IMPLEMENTATION — Python and TypeScript
    // alike, both of which round halves to even — says 1270×952, and that is what this port returns.
    //
    // 2000/1500 is 1.3333333333333333 in floating point and 1270 divided by it is exactly 952.5, a
    // true tie. Banker's rounding takes it to 952, which fits in 1564 tokens; Math.round takes it to
    // 953, which costs 1610 and does not fit, giving the table's 1269. The reference implementation
    // carries a comment warning about precisely this — *"the live API resolves exact .5 ties toward
    // the even neighbor, so Math.round would compute a different size for some images"* — so the
    // table looks like the stale half of the pair, and the tie-to-even path is the live behaviour.
    //
    // Immaterial either way here: every decision in this codebase is made with `fitsNatively`, which
    // both candidates agree on. Recorded rather than silently rounded away, because the next person
    // to diff this against the docs deserves to find the answer already written down.
    expect(resizedSize(2000, 1500, STANDARD_TIER)).toEqual([1270, 952]);
    expect(countImageTokens(1270, 952)).toBe(1564);
    expect(countImageTokens(1269, 952)).toBe(1564);
  });

  it('the A4 scan — both edges under the limit, and STILL resized', () => {
    // The single most important case in this file. 1075 and 1520 are both well under 1568, so the
    // naive "long edge" rule says no resize. It costs 39 × 55 = 2145 tokens against a budget of
    // 1568, so it is resized to 924×1307 and a seventh of the detail is gone.
    expect(countImageTokens(1075, 1520)).toBe(2145);
    expect(fitsNatively(1075, 1520, STANDARD_TIER)).toBe(false);
    expect(resizedSize(1075, 1520, STANDARD_TIER)).toEqual([924, 1307]);
  });

  it('and the same scan is untouched on a high-resolution model', () => {
    expect(fitsNatively(1075, 1520, HIGH_TIER)).toBe(true);
    expect(resizedSize(1075, 1520, HIGH_TIER)).toEqual([1075, 1520]);
  });

  it('3840x2160 on the high tier goes to 2576x1449, not 1456x819', () => {
    expect(resizedSize(3840, 2160, HIGH_TIER)).toEqual([2576, 1449]);
  });

  it('is orientation-symmetric — a portrait receipt is not a special case', () => {
    const [lw, lh] = resizedSize(1920, 1080, STANDARD_TIER);
    const [pw, ph] = resizedSize(1080, 1920, STANDARD_TIER);
    expect([pw, ph]).toEqual([lh, lw]);
  });
});

describe('countImageTokens', () => {
  it('is one token per 28x28 patch, rounded up', () => {
    expect(countImageTokens(28, 28)).toBe(1);
    expect(countImageTokens(29, 28)).toBe(2);   // a single pixel over buys a whole patch
    expect(countImageTokens(1000, 1000)).toBe(1296);
    expect(countImageTokens(1092, 1092)).toBe(1521);
  });
});

describe('fitsNatively measures the edge AFTER padding', () => {
  it('treats 1560 as 1568 — the padding is part of the limit', () => {
    // ceil(1560/28)*28 = 1568, exactly the ceiling. Simplifying this to `x <= maxEdge` is wrong by
    // one patch at precisely the sizes a tiler aims for.
    expect(Math.ceil(1560 / 28) * 28).toBe(1568);
    expect(fitsNatively(1560, 28, STANDARD_TIER)).toBe(true);
    expect(fitsNatively(1569, 28, STANDARD_TIER)).toBe(false);
  });
});

describe('tierForModel', () => {
  it('puts the 4.5 family on the standard tier', () => {
    expect(tierForModel('claude-sonnet-4-5-20250929').name).toBe('standard');
    expect(tierForModel('claude-haiku-4-5-20251001').name).toBe('standard');
  });

  it('puts 4.7 and the 5 family on the high tier', () => {
    expect(tierForModel('claude-sonnet-4-7').name).toBe('high');
    expect(tierForModel('claude-opus-5').name).toBe('high');
    expect(tierForModel('claude-sonnet-5-20260101').name).toBe('high');
  });

  it('defaults an UNKNOWN model to standard, which is the safe direction', () => {
    // Guessing high on a standard model hands it bands that are quietly downscaled — the exact
    // failure this module exists to prevent. Guessing standard on a high model only leaves detail
    // on the table. The cost of being wrong is asymmetric, so the default is pessimistic.
    expect(tierForModel('some-future-model').name).toBe('standard');
    expect(tierForModel('').name).toBe('standard');
  });
});

describe('roundTiesToEven', () => {
  it('rounds exact halves to the even neighbour, unlike Math.round', () => {
    expect(roundTiesToEven(0.5)).toBe(0);
    expect(roundTiesToEven(1.5)).toBe(2);
    expect(roundTiesToEven(2.5)).toBe(2);
    expect(Math.round(2.5)).toBe(3); // the difference that would shift a coordinate
    expect(roundTiesToEven(2.4)).toBe(2);
    expect(roundTiesToEven(-1.5)).toBe(-2);
  });
});

describe('mapping coordinates back onto the original', () => {
  it('reproduces the documented A4 example', () => {
    // A table corner Claude returns at (462, 653.5) on the resized page is (537.5, 760) on the
    // 1075×1520 original.
    const [x, y] = mapCoordinateToOriginal(462, 653.5, 1075, 1520, STANDARD_TIER);
    expect(x).toBeCloseTo(537.5, 4);
    expect(y).toBeCloseTo(760.0, 4);
  });

  it('is the identity when the image was never resized', () => {
    const [x, y] = mapCoordinateToOriginal(100, 200, 1000, 1000, STANDARD_TIER);
    expect([x, y]).toEqual([100, 200]);
  });

  it('clamps a coordinate the model pushed off the edge', () => {
    // Spatial reasoning is approximate and a box can come back slightly outside the image. Without
    // the clamp that becomes a crop rectangle outside the photo, which sharp rejects at run time.
    const [x, y] = mapCoordinateToOriginal(99999, -50, 1075, 1520, STANDARD_TIER);
    expect(x).toBeLessThanOrEqual(1075);
    expect(y).toBe(0);
  });

  it('keeps a box ordered even if the model returns the corners the wrong way round', () => {
    const box = mapBoxToOriginal({ x1: 800, y1: 900, x2: 100, y2: 200 }, 1075, 1520, STANDARD_TIER);
    expect(box.x1).toBeLessThan(box.x2);
    expect(box.y1).toBeLessThan(box.y2);
  });
});

describe('retainedScale says how much detail is lost', () => {
  it('is 1 for an image that passes through untouched', () => {
    expect(retainedScale(1000, 1000, STANDARD_TIER)).toBe(1);
  });

  it('quantifies the damage to a tall receipt photo, which is the case that started all this', () => {
    // A 1200×3600 till-roll photo. This number is the argument for banding, stated in one line.
    const kept = retainedScale(1200, 3600, STANDARD_TIER);
    expect(kept).toBeLessThan(0.5);
  });
});
