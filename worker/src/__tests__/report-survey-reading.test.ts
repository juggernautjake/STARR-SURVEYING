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
import fsMod from 'node:fs';
import pathMod from 'node:path';
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

describe('what we could not get, and what it cost', () => {
  // Four fields were produced and read by nothing — and TWO were added earlier in this same
  // session. That is the clearest evidence available that this is a shape the codebase invites
  // rather than carelessness: you write the field, you write the comment saying an invisible number
  // is one nobody acts on, and then there is nowhere obvious to put it, so it stops on the object.
  it('lists retrieval failures as errands, not absences', () => {
    // A report that never mentions the documents it failed to fetch reads as complete.
    const p = pipelineWith(undefined);
    (p as { retrievalFailures?: string[] }).retrievalFailures = ['Kofile search timed out for Vol 412 Pg 88'];
    const out = buildMasterReport(emptyReport, p);
    expect(out).toContain('WHAT WE COULD NOT GET');
    expect(out).toContain('errands, not absences');
    expect(out).toContain('Vol 412 Pg 88');
  });

  it('distinguishes "none failed" from "not recorded"', () => {
    // The pipeline is careful to keep undefined and [] apart; the report must not flatten them.
    const notRecorded = buildMasterReport(emptyReport, pipelineWith(undefined));
    expect(notRecorded).toContain('not recorded for this run');

    const noneFailed = pipelineWith(undefined);
    (noneFailed as { retrievalFailures?: string[] }).retrievalFailures = [];
    expect(buildMasterReport(emptyReport, noneFailed)).toContain('Every document this run went after');
  });

  it('prints the overpay with its reason, not just a count', () => {
    const out = buildMasterReport(emptyReport, pipelineWith(undefined), {
      policyPremiums: [{ instrument: '2020-1234', reason: 'Tyler covers this county at $0.50 but has no credentials configured' }],
    });
    expect(out).toContain('2020-1234');
    expect(out).toContain('no credentials configured');
    expect(out).toContain('nobody decides to stop paying');
  });

  it('prints what FREE mode meant for the run', () => {
    const out = buildMasterReport(emptyReport, pipelineWith(undefined), {
      modeStatement: 'FREE mode: the paid phase was not run. 4 document(s) were NOT purchased.',
    });
    expect(out).toContain('FREE mode');
    expect(out).toContain('4 document(s)');
  });

  it('credits the library only when it actually saved something', () => {
    const saved = buildMasterReport(emptyReport, pipelineWith(undefined), {
      librarySavings: { reused: 3, savedUsd: 12.5 },
    });
    expect(saved).toContain('already in the firm');
    expect(saved).toContain('$12.50');

    const none = buildMasterReport(emptyReport, pipelineWith(undefined), {
      librarySavings: { reused: 0, savedUsd: 0 },
    });
    expect(none).not.toContain('already in the firm');
  });
});

describe('the pipeline hands the report what the report reads', () => {
  // `partialResult` is assembled by hand and cast with `as PipelineResult`, so anything omitted is
  // silently absent from the printed report rather than a compile error. surveyReading was added to
  // the report in the previous slice and never added here — every real run would have printed
  // "Not computed for this run".
  const src = fsMod.readFileSync(
    pathMod.join(process.cwd(), 'src/services/pipeline.ts'), 'utf8');

  it('includes surveyReading in the object it passes', () => {
    expect(src).toMatch(/const partialResult = \{[\s\S]{0,400}?surveyReading,/);
  });

  it('includes retrievalFailures too', () => {
    expect(src).toMatch(/const partialResult = \{[\s\S]{0,400}?retrievalFailures:/);
  });
});
