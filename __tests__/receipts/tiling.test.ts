// Where to cut a receipt photo — the geometry that decides whether the AI can read the small print.
//
// Owner, 2026-08-18: *"We need the AI to break down the receipt into smaller images and have OCR
// review it all and very carefully capture everything."*

import { describe, it, expect } from 'vitest';
import {
  coversEveryRow, describeBand, everyBandFitsNatively, planTiles,
} from '@/lib/receipts/tiling';
import { STANDARD_TIER, fitsNatively, retainedScale } from '@/lib/receipts/vision-geometry';

/** A typical phone photo of a till roll: narrow and very tall. */
const TILL_ROLL = { w: 1200, h: 3600 };

describe('the whole point: no band may be downscaled', () => {
  it('keeps every band inside the no-downscale envelope', () => {
    // Checked with the REAL fit rule, not "long edge under 1568" — an image can sit inside both
    // edges and still be resized for exceeding the visual-token budget.
    const plan = planTiles(TILL_ROLL.w, TILL_ROLL.h);
    expect(everyBandFitsNatively(plan, STANDARD_TIER)).toBe(true);
  });

  it('holds that invariant across every shape, which is the whole contract', () => {
    const shapes = [
      [1200, 3600], [1000, 5000], [800, 1200], [2000, 2000], [600, 4000],
      [1568, 1568], [400, 400], [1075, 1520], [3000, 4000], [900, 2400],
    ];
    for (const [w, h] of shapes) {
      const plan = planTiles(w, h);
      expect(everyBandFitsNatively(plan, STANDARD_TIER), `${w}x${h} produced a band that would be downscaled`).toBe(true);
    }
  });

  it('catches the A4 trap: fits on both edges, still resized', () => {
    // 1075x1520 is under 1568 both ways and costs 2145 tokens against a budget of 1568. An
    // edge-only planner calls this a perfect fit and hands over a band missing a seventh of its
    // detail. This test is the reason vision-geometry exists.
    expect(fitsNatively(1075, 1520, STANDARD_TIER)).toBe(false);
    const plan = planTiles(1075, 1520);
    expect(plan.bands.length).toBeGreaterThan(1);
    expect(everyBandFitsNatively(plan, STANDARD_TIER)).toBe(true);
  });

  it('and that is a real gain, not a rearrangement', () => {
    // Read whole, a 1200×3600 photo keeps well under half its detail. Banded, the width is kept in
    // full. This is the entire argument for the module and is worth a test stating it in numbers.
    const kept = retainedScale(TILL_ROLL.w, TILL_ROLL.h, STANDARD_TIER);
    expect(kept).toBeLessThan(0.5);

    const plan = planTiles(TILL_ROLL.w, TILL_ROLL.h);
    // At least native, and a little more where the band has budget to spare — bands are enlarged to
    // fill the visual-token budget rather than merely avoiding a downscale.
    expect(plan.outputWidth).toBeGreaterThanOrEqual(TILL_ROLL.w);
    expect(plan.wholeImageRetainedScale).toBeCloseTo(kept, 5);
    expect(1 / kept).toBeGreaterThan(2);
  });
});

describe('coverage', () => {
  it('covers every row, for a wide range of shapes', () => {
    const shapes = [
      [1200, 3600], [1000, 5000], [800, 1200], [2000, 2000],
      [600, 4000], [1568, 1568], [400, 400], [1200, 20000],
    ];
    for (const [w, h] of shapes) {
      const plan = planTiles(w, h);
      expect(coversEveryRow(plan, h), `${w}x${h} left a gap`).toBe(true);
    }
  });

  it('starts at the very top and finishes at the very bottom', () => {
    const plan = planTiles(TILL_ROLL.w, TILL_ROLL.h);
    const first = plan.bands[0];
    const last = plan.bands[plan.bands.length - 1];
    expect(first.top).toBe(0);
    // The bottom is where the total is. A band that stops two pixels short loses the one line
    // nobody can afford to lose, and floating-point drift over ten strides is enough to do it.
    expect(last.top + last.height).toBe(TILL_ROLL.h);
  });

  it('overlaps neighbours, so no text line can be cut out of both bands', () => {
    const plan = planTiles(TILL_ROLL.w, TILL_ROLL.h);
    for (let i = 1; i < plan.bands.length; i += 1) {
      const prev = plan.bands[i - 1];
      const cur = plan.bands[i];
      const overlap = prev.top + prev.height - cur.top;
      expect(overlap, `bands ${i - 1}/${i} do not overlap`).toBeGreaterThan(0);
      // Enough for two or three whole text lines, which is what the assembler anchors on.
      expect(overlap / cur.height).toBeGreaterThan(0.1);
    }
  });
});

describe('it does not split what does not need splitting', () => {
  it('reads a small card slip as ONE image', () => {
    // Splitting a receipt that already fits buys no resolution and costs a call. The common case
    // for a card slip photographed close up.
    const plan = planTiles(800, 1200);
    expect(plan.bands).toHaveLength(1);
    expect(plan.rationale).toMatch(/one image/i);
  });

  it('upscales a small photo instead of leaving digits six pixels tall', () => {
    const plan = planTiles(600, 900);
    expect(plan.scale).toBeGreaterThan(1);
    // Capped at the largest enlargement that still fits whole, so an upscale never causes a split:
    // enlarging invents no detail, and paying two calls for it would be pure loss.
    expect(plan.bands).toHaveLength(1);
    expect(plan.outputWidth).toBeLessThanOrEqual(1100);
  });

  it('never renders a band BELOW native width', () => {
    // The floor that matters. Going under native throws away captured detail; going over merely
    // spends more of the model's budget on it, which is the point of banding.
    const plan = planTiles(1400, 6000);
    expect(plan.scale).toBeGreaterThanOrEqual(1);
    expect(plan.outputWidth).toBeGreaterThanOrEqual(1400);
    expect(everyBandFitsNatively(plan, STANDARD_TIER)).toBe(true);
  });

  it('but DOES reduce a width no band could ever fit, rather than pretending', () => {
    // 2000px wide exceeds the standard tier's 1568px edge on its own, so no band height rescues it
    // and horizontal banding cannot preserve native width. Accepting the reduction is the honest
    // outcome; the earlier version of this test asserted scale === 1 and was simply wrong, which the
    // no-band-may-be-downscaled invariant caught on a 2000×2000 input.
    const plan = planTiles(2000, 6000);
    expect(plan.scale).toBeLessThan(1);
    expect(plan.outputWidth).toBeLessThanOrEqual(1568);
    expect(everyBandFitsNatively(plan, STANDARD_TIER)).toBe(true);
  });
});

describe('thorough mode is capped by what the source can support', () => {
  it('gives a VGA receipt three bands even when five are asked for', () => {
    // Measured, not guessed. On the firm's own 480×640 photos, five bands read Guy's Quick Stop as
    // $27.69 and CEFCO as $9.08; three bands read $27.89 and $9.03 — both correct. Splitting that
    // photo five ways leaves ~124 source rows per band, which is a fragment with no structure in it,
    // and enlarging a fragment magnifies the JPEG artefacts rather than the ink.
    const plan = planTiles(215, 620, { thorough: true, thoroughBands: 5 });
    expect(plan.bands).toHaveLength(3);
  });

  it('but honours the full request on a photo with the pixels to back it', () => {
    // A 4K capture cropped to the paper. Here the constraint never binds.
    const plan = planTiles(950, 3400, { thorough: true, thoroughBands: 5 });
    expect(plan.bands).toHaveLength(5);
  });

  it('never falls below two bands, however small the receipt', () => {
    const plan = planTiles(120, 300, { thorough: true, thoroughBands: 5 });
    expect(plan.bands.length).toBeGreaterThanOrEqual(2);
    expect(coversEveryRow(plan, 300)).toBe(true);
  });
});

describe('limits', () => {
  it('honours the band cap on an absurdly long roll', () => {
    const plan = planTiles(1200, 60000, { maxBands: 8 });
    expect(plan.bands).toHaveLength(8);
    // Still covers everything — the bands simply get taller and some resolution is given back.
    // Losing some detail is the right trade against 40 vision calls on one receipt.
    expect(coversEveryRow(plan, 60000)).toBe(true);
  });

  it('is total: a corrupt image yields one band rather than throwing into the pipeline', () => {
    for (const [w, h] of [[0, 0], [-5, 100], [NaN, 100], [100, Infinity]]) {
      const plan = planTiles(w, h);
      expect(plan.bands.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('coversEveryRow catches a bad plan', () => {
  it('rejects a hole in the middle', () => {
    const holed = {
      outputWidth: 100, scale: 1, rationale: '',
      wholeImageRetainedScale: 1,
      bands: [
        { index: 0, top: 0, height: 40, startFraction: 0, endFraction: 0.4 },
        { index: 1, top: 60, height: 40, startFraction: 0.6, endFraction: 1 },
      ],
    };
    expect(coversEveryRow(holed, 100)).toBe(false);
  });

  it('rejects a plan that stops short of the bottom', () => {
    const short = {
      outputWidth: 100, scale: 1, rationale: '',
      wholeImageRetainedScale: 1,
      bands: [{ index: 0, top: 0, height: 90, startFraction: 0, endFraction: 0.9 }],
    };
    expect(coversEveryRow(short, 100)).toBe(false);
  });
});

describe('describeBand', () => {
  it('tells the reader where it is looking, in words a person would use', () => {
    const plan = planTiles(TILL_ROLL.w, TILL_ROLL.h);
    const n = plan.bands.length;
    expect(describeBand(plan.bands[0], n)).toMatch(/TOP/);
    expect(describeBand(plan.bands[n - 1], n)).toMatch(/BOTTOM/);
    // Position matters to the reader: the header is where the vendor and address are, the bottom is
    // where the total and card are, and saying so measurably improves what comes back.
    expect(describeBand(plan.bands[0], n)).toMatch(/address/);
    expect(describeBand(plan.bands[n - 1], n)).toMatch(/card/);
  });

  it('says so plainly when there is only one', () => {
    expect(describeBand({ index: 0, top: 0, height: 10, startFraction: 0, endFraction: 1 }, 1))
      .toBe('the whole receipt');
  });
});
