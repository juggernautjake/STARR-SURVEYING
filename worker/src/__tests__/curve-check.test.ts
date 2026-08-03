// A curve proving its own transcription errors (Phase I, S5).
//
// Radius, delta and arc are over-determined — any two give the third — so a curve is one of very few
// things in a land record that can be checked with no field work and no second document.
//
// The assertion that carries the most weight is the CHORD one. The traverse walks the chord, because
// the chord is the straight line between the two corners a crew occupies. So a mis-read chord moves
// a corner; a mis-read radius or delta changes only how the arc bends between corners that are still
// in the right place. A single "curve data inconsistent" flag would lose that distinction, and it is
// the distinction that decides whether this is a field problem or a records correction.

import { describe, it, expect } from 'vitest';
import { checkCurve, checkTangency, digitSubstitution } from '../services/curve-check.js';

/** R=573.69, Δ=30°, so arc = 300.42 and chord = 296.94. */
const R = 573.69;
const DELTA = 30;
const ARC = R * (DELTA * Math.PI) / 180;
const CHORD = 2 * R * Math.sin(((DELTA * Math.PI) / 180) / 2);

describe('a consistent curve', () => {
  it('agrees when all four values match', () => {
    const c = checkCurve({ radius: R, deltaDeg: DELTA, arcLength: ARC, chordDistance: CHORD });
    expect(c.verdict).toBe('consistent');
    expect(c.suspect).toBeNull();
  });

  it('derives the missing values from any valid pair', () => {
    const c = checkCurve({ radius: R, deltaDeg: DELTA });
    expect(c.derived.arcLength).toBeCloseTo(ARC, 2);
    expect(c.derived.chordDistance).toBeCloseTo(CHORD, 2);
  });

  it('derives the radius from delta and arc', () => {
    const c = checkCurve({ deltaDeg: DELTA, arcLength: ARC });
    expect(c.derived.radius).toBeCloseTo(R, 2);
  });
});

describe('a curve that disagrees with itself', () => {
  it('catches a mis-transcribed radius', () => {
    // 573.69 read as 578.69 — plausible in isolation, provable in context.
    const c = checkCurve({ radius: 578.69, deltaDeg: DELTA, arcLength: ARC });
    expect(c.verdict).toBe('inconsistent');
    expect(c.statement).toContain('DISAGREES with itself');
  });

  it('says the document proves it, so no field work is needed to know', () => {
    const c = checkCurve({ radius: 578.69, deltaDeg: DELTA, arcLength: ARC });
    expect(c.statement).toContain('the document proves on its own');
    expect(c.statement).toContain('no field work is needed');
  });

  it('names a single-digit OCR substitution when that explains it', () => {
    // "the radius is 0.9% off" is a statistic; "a 3/8 swap in one digit" is a correction.
    expect(digitSubstitution(578.69, 573.69)).toContain('8/3 substitution');
    expect(digitSubstitution(578.69, 573.69)).toContain('commonest OCR error');
  });

  it('does not claim a digit swap when the difference is not one', () => {
    expect(digitSubstitution(600, 573.69)).toBeNull();
  });
});

describe('whether the error moves a CORNER', () => {
  it('flags a chord error as moving a corner, because the traverse walks the chord', () => {
    const c = checkCurve({ radius: R, deltaDeg: DELTA, chordDistance: CHORD + 5 });
    expect(c.affectsCornerPosition).toBe(true);
    expect(c.statement).toContain('moves a CORNER');
    expect(c.nextStep).toContain('puts the corner in the wrong place');
  });

  it('says an arc-only error leaves the corners where they are', () => {
    const c = checkCurve({ radius: R, deltaDeg: DELTA, arcLength: ARC + 5, chordDistance: CHORD });
    expect(c.affectsCornerPosition).toBe(false);
    expect(c.statement).toContain('corners are in the right place');
    expect(c.nextStep).toContain('records correction rather than a field problem');
  });
});

describe('what it refuses to check', () => {
  it('reports too few values as unverifiable, not as consistent', () => {
    // "Nothing disagreed" and "nothing was compared" must never read the same.
    const c = checkCurve({ radius: R });
    expect(c.verdict).toBe('unverifiable');
    expect(c.statement).toContain('NOT the same as the curve being consistent');
  });

  it('refuses the ill-conditioned arc-and-chord-only case', () => {
    // They determine the curve in principle, but a small reading error swings the radius wildly.
    const c = checkCurve({ arcLength: ARC, chordDistance: CHORD });
    expect(c.verdict).toBe('unverifiable');
    expect(c.statement).toContain('ill-conditioned');
    expect(c.nextStep).toContain('Read the radius or the delta');
  });

  it('tolerates drafting rounding without swallowing a real error', () => {
    // Plats are drafted to hundredths; a transcription error is orders of magnitude larger.
    expect(checkCurve({ radius: R, deltaDeg: DELTA, arcLength: ARC + 0.01 }).verdict).toBe('consistent');
    expect(checkCurve({ radius: R, deltaDeg: DELTA, arcLength: ARC + 5 }).verdict).toBe('inconsistent');
  });
});

describe('tangency, as an independent check on delta', () => {
  it('confirms delta from a different part of the description', () => {
    // A tangent curve's chord bearing differs from the inbound bearing by exactly half the delta.
    const s = checkTangency({
      inboundBearing: 'N 0°00\'00" E', chordBearing: 'N 15°00\'00" E',
      deltaDeg: 30, direction: 'right',
    });
    expect(s).toContain('TANGENT');
    expect(s).toContain('confirms delta independently');
  });

  it('treats a non-tangent curve as a question, not a defect', () => {
    // Non-tangent curves are legal and common — a cul-de-sac, a deflection.
    const s = checkTangency({
      inboundBearing: 'N 0°00\'00" E', chordBearing: 'N 25°00\'00" E',
      deltaDeg: 30, direction: 'right',
    });
    expect(s).toContain('NOT tangent');
    expect(s).toContain('QUESTION rather than an error');
  });

  it('says nothing when it has nothing to work with', () => {
    expect(checkTangency({ deltaDeg: 30 })).toBeNull();
  });
});
