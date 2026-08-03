// The survey reading reaches the document a person opens.
//
// `readSurvey()` runs at Stage 4, its result goes onto `PipelineResult`, and it is written to the
// log. Nothing read it. Everything Phase I built about the CONTENT of a survey — monuments as
// objects, corner-to-corner inverses, curve self-checks, units, closure as evidence about our own
// OCR — stopped one step short of the report a surveyor actually opens.
//
// Wired into the pipeline is not the same as surfaced. This is the same defect class the
// reachability check catches, one layer up: `surveyReading` had a producer and no consumer, and the
// check cannot see it because the field is on a type rather than in a module.

import { describe, it, expect } from 'vitest';
import { buildMasterReport } from '../services/report-generator.js';
import { readSurvey } from '../services/survey-reading.js';
import type { BoundaryCall, ExtractedBoundaryData, PipelineResult } from '../types/index.js';

const call = (o: Partial<BoundaryCall> & { sequence: number }): BoundaryCall => ({
  bearing: null, distance: null, curve: null, toPoint: null, along: null, confidence: 0.9, ...o,
});
const brg = (raw: string, dd: number, q: string) => ({ raw, decimalDegrees: dd, quadrant: q });
const dist = (v: number, unit: NonNullable<BoundaryCall['distance']>['unit'] = 'feet') =>
  ({ raw: `${v}`, value: v, unit });

const boundary = (calls: BoundaryCall[]): ExtractedBoundaryData => ({
  type: 'metes_and_bounds', datum: 'unknown',
  pointOfBeginning: { description: 'POB', referenceMonument: null },
  calls, references: [], area: null, lotBlock: null, confidence: 0.9, warnings: [],
});

/** A square with monuments, one short leg so the closure has something to say. */
const square = boundary([
  call({ sequence: 0, bearing: brg('N 0°00\'00" E', 0, 'NE'), distance: dist(1000), toPoint: 'a 1/2 inch iron rod found' }),
  call({ sequence: 1, bearing: brg('N 90°00\'00" E', 90, 'NE'), distance: dist(1000), toPoint: 'a 5/8 inch iron rod set' }),
  call({ sequence: 2, bearing: brg('S 0°00\'00" E', 180, 'SE'), distance: dist(1000), toPoint: 'a 1/2 inch iron pipe found' }),
  call({ sequence: 3, bearing: brg('S 90°00\'00" W', 270, 'SW'), distance: dist(980), toPoint: 'the POINT OF BEGINNING' }),
]);

/** A minimal ValidationReport.
 *
 *  `acreage` is `number | null` on the type and NOT optional, so omitting it produced
 *  `undefined.toFixed` — my stub's fault rather than a defect in the report, since the type makes
 *  that state unreachable in production. Recorded here because the next person to write a stub for
 *  this function will hit the same thing, and the fix is to satisfy the type, not to loosen the
 *  guard in `buildPropertySummary`. */
const emptyReport = {
  propertyName: null, recordingReferences: [], acreage: null, datum: null, pobDescription: null,
  perCallConfidence: [], adjacentProperties: [], roads: [], easements: [], discrepancies: [],
  confidenceCounts: {}, overallConfidencePct: 0,
  overallRating: { display: '—', label: 'none' },
  purchaseRecommendations: [], topActions: [], adjacentResearchOrder: [], discrepancyLog: [],
  analysisLimitations: [],
  generatedAt: '2026-08-03T00:00:00Z', totalApiCalls: 0,
} as unknown as Parameters<typeof buildMasterReport>[0];

const pipelineWith = (surveyReading: PipelineResult['surveyReading']): PipelineResult => ({
  projectId: 'p', status: 'complete', propertyId: null, geoId: null, ownerName: null,
  legalDescription: null, acreage: null, documents: [], boundary: null, validation: null,
  log: [], duration_ms: 0, surveyReading,
} as unknown as PipelineResult);

describe('the report carries the survey reading', () => {
  const out = buildMasterReport(emptyReport, pipelineWith(readSurvey(square, { recordedYear: 2015 })));

  it('has a section for it at all', () => {
    expect(out).toContain('THE SURVEY ITSELF');
  });

  it('lists the monuments, with found and set distinguished', () => {
    // Finding called-for monuments is most of what a field crew is sent to do.
    expect(out).toMatch(/iron rod/i);
    expect(out.toLowerCase()).toContain('found');
    expect(out.toLowerCase()).toContain('set');
  });

  it('says what the closure means about our READING, not just its ratio', () => {
    // TRAVERSE QUALITY already prints the number. The number is not the finding.
    expect(out).toContain('WHAT THE CLOSURE SAYS ABOUT OUR READING');
    expect(out).toMatch(/reading error is the more likely|compass-and-chain|recording date is unknown/);
  });

  it('sits immediately after the section that reports the closure as a number', () => {
    // Separating them is how a precision ratio ends up looking like a verdict on the survey.
    expect(out.indexOf('THE SURVEY ITSELF')).toBeGreaterThan(out.indexOf('TRAVERSE QUALITY'));
    expect(out.indexOf('THE SURVEY ITSELF')).toBeLessThan(out.indexOf('CONFIDENCE'));
  });

  it('gives corner-to-corner distances the deed never states', () => {
    expect(out).toContain('CORNER TO CORNER');
    expect(out).toContain('the deed states only consecutive corners');
  });

  it('wraps long statements instead of emitting 200-character lines', () => {
    // The statements are prose written for a person; printed raw the section stops being readable.
    const body = out.slice(out.indexOf('THE SURVEY ITSELF'), out.indexOf('CONFIDENCE'));
    for (const line of body.split('\n')) expect(line.length).toBeLessThanOrEqual(110);
  });
});

describe('what it says when there is nothing to report', () => {
  it('distinguishes "did not run" from "found nothing"', () => {
    // A run predating this section has not looked, which is not a finding about the property.
    const out = buildMasterReport(emptyReport, pipelineWith(undefined));
    expect(out).toContain('Not computed for this run');
    expect(out).toContain('not the same');
  });

  it('explains a lot-and-block description rather than printing an empty section', () => {
    const lotBlock = { ...boundary([]), type: 'lot_and_block' as const };
    const out = buildMasterReport(emptyReport, pipelineWith(readSurvey(lotBlock)));
    expect(out).toContain('recorded plat');
  });

  it('flags a description that names no monuments as worth checking', () => {
    const bare = boundary([
      call({ sequence: 0, bearing: brg('N 0°00\'00" E', 0, 'NE'), distance: dist(100) }),
      call({ sequence: 1, bearing: brg('S 0°00\'00" E', 180, 'SE'), distance: dist(100) }),
    ]);
    const out = buildMasterReport(emptyReport, pipelineWith(readSurvey(bare)));
    expect(out).toContain('names no monuments');
  });
});

describe('the things that must not be quiet', () => {
  it('prints a curve that disagrees with its own stated values', () => {
    const withCurve = boundary([
      call({ sequence: 0, curve: {
        radius: { raw: '500', value: 500 },
        arcLength: { raw: '523.60', value: 523.6 },
        chordBearing: { raw: 'N 60°00\'00" E', decimalDegrees: 60, quadrant: 'NE' },
        chordDistance: { raw: '900', value: 900 },   // wrong: should be 500
        direction: 'right', delta: { raw: '60°', decimalDegrees: 60 },
      } }),
    ]);
    const out = buildMasterReport(emptyReport, pipelineWith(readSurvey(withCurve)));
    expect(out).toContain('CURVES THAT DO NOT CHECK OUT');
  });

  it('names corners positioned from a value we computed rather than one the deed recites', () => {
    const derived = boundary([
      call({ sequence: 0, bearing: brg('N 90°00\'00" E', 90, 'NE'), distance: dist(100) }),
      call({ sequence: 1, curve: {
        radius: { raw: '500', value: 500 },
        arcLength: null, chordBearing: null, chordDistance: null,
        direction: 'right', delta: { raw: '60°', decimalDegrees: 60 },
      } }),
    ]);
    const out = buildMasterReport(emptyReport, pipelineWith(readSurvey(derived)));
    expect(out).toContain('CORNERS POSITIONED FROM A VALUE WE COMPUTED');
  });

  it('states the conversion when the deed recites varas', () => {
    const varas = boundary([
      call({ sequence: 0, bearing: brg('N 0°00\'00" E', 0, 'NE'), distance: dist(1900, 'varas') }),
    ]);
    const out = buildMasterReport(emptyReport, pipelineWith(readSurvey(varas)));
    expect(out).toContain('UNITS');
    expect(out).toMatch(/vara/i);
  });
});
