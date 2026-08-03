// Where the corners are in relation to each other, and putting them on the grid you shoot.
//
// Three modules, one job: read the calls (survey-geometry), get the units right (survey-units), and
// express the result in the basis you are measuring in (bearing-rotation).
//
// The assertions worth reading are the refusals. A traverse that quietly substitutes a value for a
// call it could not read produces a polygon that closes, looks surveyed, and is the wrong shape —
// and every check downstream agrees with it, because it is perfectly self-consistent.

import { describe, it, expect } from 'vitest';
import {
  azimuthToBearing, inverse, parseBearing, traverse,
} from '../services/survey-geometry.js';
import {
  VARAS_TO_US_SURVEY_FEET, convertLength, describeUnitChoice, detectUnit, toInternal,
} from '../services/survey-units.js';
import {
  compareLine, fitRotation, rotateCalls, rotationFromBackthesight,
} from '../services/bearing-rotation.js';

describe('reading a bearing', () => {
  it('reads the four quadrants as azimuths', () => {
    expect(parseBearing('N 45°00\'00" E')!.azimuthDeg).toBeCloseTo(45, 6);
    expect(parseBearing('S 45°00\'00" E')!.azimuthDeg).toBeCloseTo(135, 6);
    expect(parseBearing('S 45°00\'00" W')!.azimuthDeg).toBeCloseTo(225, 6);
    expect(parseBearing('N 45°00\'00" W')!.azimuthDeg).toBeCloseTo(315, 6);
  });

  it('survives the punctuation a scan produces', () => {
    // A 1954 deed scanned in 2011 rarely keeps its degree signs.
    expect(parseBearing('N 45-30-20 E')!.azimuthDeg).toBeCloseTo(45.5056, 3);
    expect(parseBearing('N45o30\'20" E')!.azimuthDeg).toBeCloseTo(45.5056, 3);
  });

  it('returns NULL for an unreadable bearing, never due north', () => {
    // The existing TraverseComputation returns 0 here. Zero is a legitimate azimuth, so an
    // unreadable call silently becomes a real line pointing north and displaces every corner after
    // it — while the traverse still "computes" and the closure absorbs the error.
    expect(parseBearing('illegible')).toBeNull();
    expect(parseBearing('')).toBeNull();
    expect(parseBearing(null)).toBeNull();
    expect(parseBearing('N 95°00\'00" E')).toBeNull();   // >90° is not a quadrant bearing
  });

  it('round-trips through the quadrant form a deed is written in', () => {
    expect(azimuthToBearing(45.5)).toBe('N 45°30\'00" E');
    expect(azimuthToBearing(180)).toBe('S 0°00\'00" E');
    expect(azimuthToBearing(225.25)).toBe('S 45°15\'00" W');
  });

  it('never prints 60 minutes or 60 seconds', () => {
    expect(azimuthToBearing(44.99999)).not.toMatch(/60"/);
    expect(azimuthToBearing(44.99999)).not.toMatch(/60'/);
  });
});

describe('units — a vara is not a foot', () => {
  it('uses the Texas legal vara of 33 1/3 inches', () => {
    expect(VARAS_TO_US_SURVEY_FEET).toBeCloseTo(2.7777778, 6);
    expect(convertLength(1900, 'varas', 'us_survey_feet').value).toBeCloseTo(5277.78, 1);
  });

  it('keeps the two feet apart', () => {
    // 2 ppm — about 0.01 ft per mile, negligible for a fence corner and not for a published
    // State Plane coordinate.
    const mile = convertLength(5280, 'us_survey_feet', 'international_feet');
    expect(mile.value).toBeGreaterThan(5280);
    expect(mile.value - 5280).toBeCloseTo(0.0106, 3);
  });

  it('converts the older units a Texas deed uses', () => {
    expect(convertLength(1, 'chains', 'us_survey_feet').value).toBeCloseTo(66, 6);
    expect(convertLength(1, 'rods', 'us_survey_feet').value).toBeCloseTo(16.5, 6);
    expect(convertLength(100, 'links', 'us_survey_feet').value).toBeCloseTo(66, 6);
  });

  it('detects the unit from the text', () => {
    expect(detectUnit('1900 varas')).toBe('varas');
    expect(detectUnit('20 chains')).toBe('chains');
    expect(detectUnit('330.5 feet')).toBe('us_survey_feet');
  });

  it('returns null rather than defaulting to feet', () => {
    // A vara call read as feet is 36% of its true length, and the traverse still closes to
    // something — there is no downstream check that catches it.
    expect(detectUnit('330.5')).toBeNull();
    expect(describeUnitChoice('330.5', null)).toContain('NOT assumed to be feet');
  });

  it('says when the survey foot was inferred from a bare "feet"', () => {
    expect(describeUnitChoice('330 feet', 'us_survey_feet')).toContain('US SURVEY feet');
  });

  it('names the vara it means', () => {
    expect(describeUnitChoice('1900 varas', 'varas')).toContain('Not the Californian or Mexican vara');
  });
});

describe('the traverse — corners in relation to each other', () => {
  /** A 100 ft square, walked clockwise from the SW corner. */
  const square = [
    { bearing: 'N 0°00\'00" E', distance: 100, toPoint: 'a 1/2 inch iron rod found' },
    { bearing: 'N 90°00\'00" E', distance: 100, toPoint: 'an iron rod set' },
    { bearing: 'S 0°00\'00" E', distance: 100, toPoint: 'a fence corner' },
    { bearing: 'S 90°00\'00" W', distance: 100, toPoint: 'the point of beginning' },
  ];

  it('places every corner', () => {
    const t = traverse(square);
    expect(t.legs).toHaveLength(4);
    expect(t.points).toHaveLength(5);
    expect(t.points[2]!.n).toBeCloseTo(100, 6);
    expect(t.points[2]!.e).toBeCloseTo(100, 6);
  });

  it('closes a closed figure', () => {
    const t = traverse(square);
    expect(t.closureDistance).toBeCloseTo(0, 6);
    expect(t.perimeter).toBeCloseTo(400, 6);
  });

  it('answers the question the deed never does — corner to non-adjacent corner', () => {
    // A metes-and-bounds description only ever relates CONSECUTIVE corners. The diagonal is exactly
    // what a crew wants and exactly what the prose cannot give.
    const t = traverse(square);
    const diag = inverse(t.points[0]!, t.points[2]!);
    expect(diag.distance).toBeCloseTo(141.42, 2);
    expect(diag.bearing).toBe('N 45°00\'00" E');
  });

  it('normalises varas before any geometry', () => {
    const t = traverse([{ bearing: 'N 0°00\'00" E', distance: 100, unit: 'varas' }]);
    expect(t.legs[0]!.distance).toBeCloseTo(277.78, 1);
    expect(t.legs[0]!.unit).toBe('varas');       // the deed's own unit is kept for labelling
  });

  it('handles a deed that mixes units', () => {
    // An old description recited in varas with a modern tie in feet. Adding them raw is a polygon
    // of the wrong shape that closes perfectly.
    const t = traverse([
      { bearing: 'N 0°00\'00" E', distance: 100, unit: 'varas' },
      { bearing: 'N 90°00\'00" E', distance: 277.7778, unit: 'us_survey_feet' },
    ]);
    expect(t.legs[0]!.distance).toBeCloseTo(t.legs[1]!.distance, 2);
  });

  it('traverses a curve on its chord, because the chord joins the corners', () => {
    const t = traverse([{ bearing: null, distance: null, chordBearing: 'N 45°00\'00" E', chordDistance: 141.42 }]);
    expect(t.legs).toHaveLength(1);
    expect(t.legs[0]!.to.n).toBeCloseTo(100, 1);
  });
});

describe('a call it cannot read stops the chain and says so', () => {
  const broken = [
    { bearing: 'N 0°00\'00" E', distance: 100 },
    { bearing: 'illegible', distance: 100 },
    { bearing: 'S 90°00\'00" W', distance: 100 },
  ];

  it('does not treat an unreadable bearing as due north', () => {
    const t = traverse(broken);
    expect(t.unusable).toHaveLength(1);
    expect(t.unusable[0]!.reason).toContain('this is not a call pointing north');
  });

  it('refuses to report a closure it cannot mean', () => {
    // A traverse missing a leg is not a traverse with one fewer side; it is two disconnected runs of
    // corners. A closure figure would be arithmetic on an incomplete figure.
    const t = traverse(broken);
    expect(t.closurePrecision).toBeNull();
    expect(t.statement).toContain('Closure is NOT reported');
  });

  it('says the later corners are positioned relative to the break', () => {
    expect(traverse(broken).statement).toContain('relative to the break');
  });

  it('names a missing distance separately from a missing bearing', () => {
    const t = traverse([{ bearing: 'N 0°00\'00" E', distance: null }]);
    expect(t.unusable[0]!.reason).toContain('The direction is known, the length is not');
  });
});

describe('rotating a record survey onto the grid you shoot', () => {
  /** The same square, measured 2° rotated and offset onto a grid. */
  const rotated = (deg: number, points: Array<{ n: number; e: number }>) => {
    const r = (deg * Math.PI) / 180;
    return points.map((p) => ({
      n: p.n * Math.cos(r) - p.e * Math.sin(r) + 10_000,
      e: p.n * Math.sin(r) + p.e * Math.cos(r) + 3_000_000,
    }));
  };

  const record = [{ n: 0, e: 0 }, { n: 100, e: 0 }, { n: 100, e: 100 }, { n: 0, e: 100 }];

  it('recovers a 2 degree basis difference', () => {
    const measured = rotated(2, record);
    const fit = fitRotation(record.map((p, i) => ({ label: `C${i}`, record: p, measured: measured[i]! })))!;
    expect(fit.rotationDeg).toBeCloseTo(2, 4);
    expect(fit.rmsResidual).toBeCloseTo(0, 4);
  });

  it('leaves the shape alone — a rotation is not a correction', () => {
    // The internal angles are the old surveyor's actual observations and are usually better than the
    // basis they were reported against.
    const measured = rotated(3, record);
    const fit = fitRotation(record.map((p, i) => ({ label: `C${i}`, record: p, measured: measured[i]! })))!;
    expect(fit.scale).toBe(1);
  });

  it('says plainly that a two-point fit has no check', () => {
    const measured = rotated(2, record);
    const fit = fitRotation([
      { label: 'A', record: record[0]!, measured: measured[0]! },
      { label: 'B', record: record[1]!, measured: measured[1]! },
    ])!;
    expect(fit.unchecked).toBe(true);
    expect(fit.statement).toContain('exact by construction');
    expect(fit.statement).toContain('has NOT been checked');
  });

  it('refuses to call one point a rotation', () => {
    const fit = fitRotation([{ label: 'A', record: record[0]!, measured: { n: 1, e: 1 } }])!;
    expect(fit.statement).toContain('fixes position but not direction');
    expect(fit.statement).toContain('would read as "the two bases already agree"');
  });

  it('points at the corner that does not fit, rather than averaging it away', () => {
    // One monument tied to the wrong rod. That is a blunder, not noise, and the fit must not spread
    // it evenly across every corner.
    const measured = rotated(2, record);
    measured[2] = { n: measured[2]!.n + 8, e: measured[2]!.e + 8 };
    const fit = fitRotation(record.map((p, i) => ({ label: `C${i}`, record: p, measured: measured[i]! })))!;
    expect(fit.worst!.label).toBe('C2');
    expect(fit.nextStep).toContain('not the corner the record called for');
  });

  it('holds scale at 1 unless asked, and says why', () => {
    const measured = rotated(0, record).map((p) => ({ n: p.n * 1.0001, e: p.e * 1.0001 }));
    const fit = fitRotation(record.map((p, i) => ({ label: `C${i}`, record: p, measured: measured[i]! })))!;
    expect(fit.scale).toBe(1);
    expect(fit.statement).toContain('grid-versus-ground or a unit');
  });
});

describe('the robotic backsight case', () => {
  it('treats the bearing you enter as the basis everything inherits', () => {
    const r = rotationFromBackthesight(45, 47);
    expect(r.rotationDeg).toBeCloseTo(2, 6);
    expect(r.statement).toContain('ONE-LINE basis with no redundancy');
    expect(r.statement).toContain('nothing here will say so');
  });

  it('rotates every call and leaves distances alone', () => {
    const { rotated } = rotateCalls([{ bearing: 'N 45°00\'00" E', distance: 100 }], 2);
    expect(rotated[0]!.rotatedBearing).toBe('N 47°00\'00" E');
    expect(rotated[0]!.distance).toBe(100);
  });

  it('names calls it could not rotate instead of dropping them', () => {
    const { skipped } = rotateCalls([{ bearing: 'illegible', distance: 100 }], 2);
    expect(skipped[0]!.reason).toContain('could not be read');
  });
});

describe('comparing one line, record against measured', () => {
  it('separates a basis difference from a scale difference from a wrong monument', () => {
    const s = compareLine({ n: 0, e: 0 }, { n: 100, e: 0 }, { n: 0, e: 0 }, { n: 99.9, e: 3.5 });
    expect(s).toContain('A consistent direction difference across every line is a');
    expect(s).toContain('BASIS difference');
    expect(s).toContain('a difference on one line only is usually the wrong monument');
  });
});

describe('the vara constant and the vara arithmetic must agree', () => {
  // They did not. VARAS_TO_US_SURVEY_FEET was exported as 25/9 while the conversion factor was
  // derived from 33 1/3 INTERNATIONAL inches, giving 2.7777772… instead of 2.7777778…. About 0.01 ft
  // over 1,900 varas — small, but a module whose published constant does not match its own
  // arithmetic cannot be checked by anybody, which is worse than the error itself.
  it('converts exactly as the exported constant says', () => {
    expect(convertLength(1, 'varas', 'us_survey_feet').value).toBeCloseTo(VARAS_TO_US_SURVEY_FEET, 12);
  });

  it('holds over a long line, where the discrepancy would show', () => {
    const long = convertLength(1900, 'varas', 'us_survey_feet').value;
    expect(long).toBeCloseTo(1900 * VARAS_TO_US_SURVEY_FEET, 9);
    expect(long).toBeCloseTo(5277.7778, 4);
  });

  it('agrees with toInternal, which is what the traverse actually calls', () => {
    expect(toInternal(1900, 'varas')).toBeCloseTo(convertLength(1900, 'varas', 'us_survey_feet').value, 12);
  });
});
