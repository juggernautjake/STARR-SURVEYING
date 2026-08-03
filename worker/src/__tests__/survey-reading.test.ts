// The bridge between what the pipeline extracts and what Phase I can do with it.
//
// Phase I shipped nine modules of survey geometry, each with tests. Every import of every one came
// from a sibling module in the same folder or from its own test file — the stack had ZERO production
// callers, so a document processed by this platform got exactly the treatment it got before any of it
// was written. These tests are therefore in two halves: the translation itself, and the fact that
// Stage 4 calls it.
//
// The two places the translation can lie are the two it is tested hardest on: what bare "feet" means,
// and what happens to a curve whose chord the record does not state.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  readSurvey, unambiguousRecordedYear, chordFromRadiusDelta, chordBearingFromTangent,
} from '../services/survey-reading.js';
import type { BoundaryCall, ExtractedBoundaryData } from '../types/index.js';

const call = (o: Partial<BoundaryCall> & { sequence: number }): BoundaryCall => ({
  bearing: null, distance: null, curve: null, toPoint: null, along: null, confidence: 0.9, ...o,
});

const bearing = (raw: string, dd: number, quadrant: string) => ({ raw, decimalDegrees: dd, quadrant });
const dist = (v: number, unit: NonNullable<BoundaryCall['distance']>['unit'] = 'feet') =>
  ({ raw: `${v}`, value: v, unit });

const boundary = (calls: BoundaryCall[], type: ExtractedBoundaryData['type'] = 'metes_and_bounds'): ExtractedBoundaryData => ({
  type, datum: 'unknown',
  pointOfBeginning: { description: 'POB', referenceMonument: null },
  calls, references: [], area: null, lotBlock: null, confidence: 0.9, warnings: [],
});

/** A clean 1000 ft square, four calls, a rod at every corner. */
const square = () => boundary([
  call({ sequence: 0, bearing: bearing('N 0°00\'00" E', 0, 'NE'), distance: dist(1000), toPoint: 'a 1/2 inch iron rod found' }),
  call({ sequence: 1, bearing: bearing('N 90°00\'00" E', 90, 'NE'), distance: dist(1000), toPoint: 'a 5/8 inch iron rod set with cap stamped RPLS 5310' }),
  call({ sequence: 2, bearing: bearing('S 0°00\'00" E', 180, 'SE'), distance: dist(1000), toPoint: 'a 1/2 inch iron pipe found' }),
  call({ sequence: 3, bearing: bearing('S 90°00\'00" W', 270, 'SW'), distance: dist(1000), toPoint: 'the POINT OF BEGINNING' }),
]);

describe('bare "feet" is read as the US SURVEY foot', () => {
  // The pipeline's extraction type cannot express the difference; the survey stack can, and the two
  // feet differ in the 7th figure. Texas State Plane is defined in US survey feet, so a description
  // read in international feet drifts against the grid it will be compared to.
  it('walks a 1000 ft call as 1000 US survey feet', () => {
    const r = readSurvey(square());
    expect(r.traverse!.legs[0]!.unit).toBe('us_survey_feet');
    expect(r.traverse!.legs[0]!.distance).toBeCloseTo(1000, 6);
  });

  it('carries varas through as varas and converts them', () => {
    const r = readSurvey(boundary([
      call({ sequence: 0, bearing: bearing('N 0°00\'00" E', 0, 'NE'), distance: dist(1900, 'varas') }),
    ]));
    expect(r.traverse!.legs[0]!.unit).toBe('varas');
    // 1900 varas = 1900 × 25/9 US survey feet.
    expect(r.traverse!.legs[0]!.distance).toBeCloseTo(1900 * (25 / 9), 4);
    expect(r.unitsUsed.some((u) => u.unit === 'varas')).toBe(true);
    expect(r.statement).toContain('converted to US survey feet');
  });
});

describe('a curve whose chord the record does not state', () => {
  // The traverse walks CHORDS, because the chord is the straight line between the two corners a crew
  // occupies. Left alone, a radius-and-delta curve is an unusable call — and one unusable call leaves
  // every corner after it unplaced, discarding the whole figure over a derivable value.
  it('derives the chord length as 2R·sin(Δ/2)', () => {
    expect(chordFromRadiusDelta(500, 60)).toBeCloseTo(500, 6); // Δ=60° ⇒ chord = R
  });

  it('deflects the chord bearing by HALF the central angle, in the stated direction', () => {
    // Getting this sign backwards puts the next corner on the wrong side of the line by twice the
    // offset, which is why the direction is required rather than assumed.
    expect(chordBearingFromTangent(90, 60, 'right')).toBeCloseTo(120, 6);
    expect(chordBearingFromTangent(90, 60, 'left')).toBeCloseTo(60, 6);
  });

  it('places the corner instead of dropping the rest of the figure', () => {
    const r = readSurvey(boundary([
      call({ sequence: 0, bearing: bearing('N 90°00\'00" E', 90, 'NE'), distance: dist(100) }),
      call({ sequence: 1, curve: {
        radius: { raw: '500', value: 500 },
        arcLength: null, chordBearing: null, chordDistance: null,
        direction: 'right', delta: { raw: '60°', decimalDegrees: 60 },
      } }),
      call({ sequence: 2, bearing: bearing('S 0°00\'00" E', 180, 'SE'), distance: dist(100) }),
    ]));
    expect(r.traverse!.unusable).toHaveLength(0);
    expect(r.traverse!.legs).toHaveLength(3);
  });

  it('says the corner is positioned from a value WE computed', () => {
    // A corner placed from a derived chord is not the same evidence as one the deed recites: if the
    // record's radius or delta was misread, this corner moves and nothing else flags it.
    const r = readSurvey(boundary([
      call({ sequence: 0, bearing: bearing('N 90°00\'00" E', 90, 'NE'), distance: dist(100) }),
      call({ sequence: 1, curve: {
        radius: { raw: '500', value: 500 },
        arcLength: null, chordBearing: null, chordDistance: null,
        direction: 'right', delta: { raw: '60°', decimalDegrees: 60 },
      } }),
    ]));
    expect(r.derivedChords).toHaveLength(1);
    expect(r.derivedChords[0]!.derived).toEqual(['chordDistance', 'chordBearing']);
    expect(r.derivedChords[0]!.statement).toContain('not one the deed recites');
    expect(r.statement).toContain('chord WE derived');
  });

  it('does not derive what the record already states', () => {
    const r = readSurvey(boundary([
      call({ sequence: 0, curve: {
        radius: { raw: '500', value: 500 },
        arcLength: null,
        chordBearing: bearing('N 60°00\'00" E', 60, 'NE'),
        chordDistance: { raw: '500', value: 500 },
        direction: 'right', delta: { raw: '60°', decimalDegrees: 60 },
      } }),
    ]));
    expect(r.derivedChords).toHaveLength(0);
  });

  it('still checks the curve against its own stated values', () => {
    const r = readSurvey(boundary([
      call({ sequence: 0, curve: {
        radius: { raw: '500', value: 500 },
        arcLength: { raw: '523.60', value: 523.6 },
        chordBearing: null,
        chordDistance: { raw: '900', value: 900 },   // wrong: should be 500
        direction: 'right', delta: { raw: '60°', decimalDegrees: 60 },
      } }),
    ]));
    expect(r.curves).toHaveLength(1);
    expect(r.curves[0]!.check.verdict).toBe('inconsistent');
    expect(r.statement).toContain('do not check out');
  });
});

describe('where the monuments are in relation to each other', () => {
  // The owner's ask, verbatim in intent: a deed only ever describes CONSECUTIVE corners, so the
  // distance from the rod in hand to the one two corners away is written nowhere.
  it('gives an inverse between every pair of located monuments', () => {
    const r = readSurvey(square());
    expect(r.monuments).toHaveLength(3);          // the 4th toPoint is the POB, not a monument
    expect(r.located).toHaveLength(3);
    expect(r.pairs).toHaveLength(3);              // 3 monuments ⇒ 3 pairs
  });

  it('computes a pair distance the deed never states', () => {
    const r = readSurvey(square());
    // Corner 0 is at (1000, 0); corner 1 at (1000, 1000): 1000 ft due east of it.
    const p = r.pairs.find((x) => x.fromCallIndex === 0 && x.toCallIndex === 1)!;
    expect(p.distance).toBeCloseTo(1000, 4);
    expect(p.statement).toContain('the deed never states it');
  });

  it('does not attach a monument to a corner that could not be placed', () => {
    // A monument on an unplaced corner is listed but NOT located — the alternative is a position
    // that looks surveyed and is not.
    const r = readSurvey(boundary([
      call({ sequence: 0, bearing: null, distance: null, toPoint: 'a 1/2 inch iron rod found' }),
      call({ sequence: 1, bearing: bearing('N 0°00\'00" E', 0, 'NE'), distance: dist(100), toPoint: 'a 5/8 inch iron rod set' }),
    ]));
    expect(r.monuments).toHaveLength(2);
    expect(r.located).toHaveLength(1);
    expect(r.statement).toContain('positions relative to the others are NOT known');
  });
});

describe('what it says when there is nothing to walk', () => {
  it('explains a lot-and-block description rather than returning an empty reading', () => {
    const r = readSurvey(boundary([], 'lot_and_block'));
    expect(r.traverse).toBeNull();
    expect(r.notTraversable).toContain('recorded plat');
  });

  it('handles a null boundary without throwing', () => {
    // Stage 4 runs on every completed pipeline, including ones that never found a description.
    const r = readSurvey(null);
    expect(r.notTraversable).toContain('nothing to read as a survey');
    expect(r.drawing).toBeNull();
  });
});

describe('the recorded year is used only when the run cannot be wrong about it', () => {
  // The year decides whether a poor closure is the ORIGINAL survey's or ours, and the extraction does
  // not record which document the calls came from. Guessing either way is worse than the honest
  // branch diagnoseClosure already has.
  const doc = (recordingDate: string | null) => ({ ref: { recordingDate } } as any);

  it('uses the year when every dated document agrees', () => {
    expect(unambiguousRecordedYear([doc('1885-04-02'), doc('04/02/1885'), doc(null)])).toBe(1885);
  });

  it('returns null when the bundle spans years', () => {
    // An 1890 deed retrieved alongside a 2015 replat must not excuse an OCR error in the replat.
    expect(unambiguousRecordedYear([doc('1890-01-01'), doc('2015-06-30')])).toBeNull();
  });

  it('returns null when nothing is dated', () => {
    expect(unambiguousRecordedYear([doc(null), doc('')])).toBeNull();
  });

  it('does not read a volume or page number as a year', () => {
    expect(unambiguousRecordedYear([doc('Vol 412 Pg 88')])).toBeNull();
  });

  it('changes the closure conclusion when it is known', () => {
    const short = boundary([
      call({ sequence: 0, bearing: bearing('N 0°00\'00" E', 0, 'NE'), distance: dist(1000) }),
      call({ sequence: 1, bearing: bearing('N 90°00\'00" E', 90, 'NE'), distance: dist(1000) }),
      call({ sequence: 2, bearing: bearing('S 0°00\'00" E', 180, 'SE'), distance: dist(1000) }),
      call({ sequence: 3, bearing: bearing('S 90°00\'00" W', 270, 'SW'), distance: dist(980) }),
    ]);
    expect(readSurvey(short, { recordedYear: 1885 }).closure!.statement).toContain('compass-and-chain');
    expect(readSurvey(short, { recordedYear: 2015 }).closure!.statement).toContain('reading error is the more likely');
    expect(readSurvey(short).closure!.statement).toContain('recording date is unknown');
  });
});

describe('Stage 4 actually calls it', () => {
  // The entire reason this module exists. A bridge nobody crosses leaves the stack exactly as
  // isolated as it was, and every unit test above would still pass.
  const pipeline = fs.readFileSync(
    path.join(process.cwd(), 'src/services/pipeline.ts'), 'utf8');

  it('imports the reading into the pipeline', () => {
    expect(pipeline).toContain("from './survey-reading.js'");
  });

  it('runs it in Stage 4, where the boundary has just been read', () => {
    expect(pipeline).toMatch(/const surveyReading = readSurvey\(boundary/);
  });

  it('passes the recorded year rather than dropping it', () => {
    expect(pipeline).toContain('recordedYear: unambiguousRecordedYear(finalProcessedDocs)');
  });

  it('returns it on the result, not only to the log', () => {
    // A reading that exists only as log lines cannot be shown to a surveyor or stored.
    expect(pipeline).toMatch(/^\s*surveyReading,$/m);
  });

  it('surfaces inconsistent curves and derived chords as warnings', () => {
    expect(pipeline).toContain("c.check.verdict === 'inconsistent'");
    expect(pipeline).toContain('surveyReading.derivedChords');
  });
});
