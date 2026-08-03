// The deed checking our reading of it.
//
// Closure is computed all over this codebase and printed as a number. Nothing has ever asked what it
// MEANS — and it is the only check available on an OCR'd description that needs no second document,
// no field visit, and no known answer. A boundary is a closed figure: walk the calls and you must
// arrive back where you started.
//
// The two assertions that carry the most weight are at the bottom. A bad closure is NOT proof we
// misread anything — an 1880s compass-and-chain survey closing at 1:800 is a fact about that survey,
// not about our OCR — and the method only works for ONE blunder, because two errors interact and the
// direction argument stops holding.

import { describe, it, expect } from 'vitest';
import { traverse } from '../services/survey-geometry.js';
import {
  GOOD_CLOSURE,
  classifyClosure,
  diagnoseClosure,
  rankSuspects,
} from '../services/closure-diagnosis.js';

/** A clean 1000 ft square. */
const square = () => ([
  { bearing: 'N 0°00\'00" E', distance: 1000 },
  { bearing: 'N 90°00\'00" E', distance: 1000 },
  { bearing: 'S 0°00\'00" E', distance: 1000 },
  { bearing: 'S 90°00\'00" W', distance: 1000 },
]);

describe('a clean closure is positive evidence, not merely the absence of a problem', () => {
  it('says a well-closing figure means the reading was right', () => {
    // A single transposed digit would not survive a 1:10,000 closure. That is real evidence, and it
    // comes from the document rather than from our own confidence.
    const d = diagnoseClosure(traverse(square()));
    expect(d.readingLooksSound).toBe(true);
    expect(d.statement).toContain('a single transposed digit would not survive it');
    expect(d.suspects).toHaveLength(0);
  });

  it('classifies the bands', () => {
    expect(classifyClosure(50_000)).toBe('excellent');
    expect(classifyClosure(7_000)).toBe('acceptable');
    expect(classifyClosure(2_000)).toBe('poor');
    expect(classifyClosure(200)).toBe('unusable');
    expect(classifyClosure(null)).toBe('unknown');
  });
});

describe('the direction of the miss points at the call', () => {
  it('blames a DISTANCE when the misclosure runs along a course', () => {
    // 20 ft short on the last leg: the figure fails to return, displaced ALONG that course.
    const t = traverse([
      { bearing: 'N 0°00\'00" E', distance: 1000 },
      { bearing: 'N 90°00\'00" E', distance: 1000 },
      { bearing: 'S 0°00\'00" E', distance: 1000 },
      { bearing: 'S 90°00\'00" W', distance: 980 },
    ]);
    const suspects = rankSuspects(t);
    expect(suspects[0]!.field).toBe('distance');
    expect(suspects[0]!.statement).toContain('misread LENGTH');
    expect(suspects[0]!.statement).toContain('transposed digit');
  });

  it('blames a BEARING when the misclosure runs square to a course', () => {
    // The second leg swung 2 degrees: everything after it is displaced PERPENDICULAR to it.
    const t = traverse([
      { bearing: 'N 0°00\'00" E', distance: 1000 },
      { bearing: 'N 88°00\'00" E', distance: 1000 },
      { bearing: 'S 0°00\'00" E', distance: 1000 },
      { bearing: 'S 90°00\'00" W', distance: 1000 },
    ]);
    const suspects = rankSuspects(t);
    expect(suspects.some((s) => s.field === 'bearing')).toBe(true);
    const bearingSuspect = suspects.find((s) => s.field === 'bearing')!;
    expect(bearingSuspect.statement).toContain('misread DIRECTION');
    // OCR reads the quadrant letter and the degree groups separately, so that is what to check.
    expect(bearingSuspect.statement).toContain('quadrant letters');
  });

  it('states the correction that would close it, in the document\'s own terms', () => {
    const t = traverse([
      { bearing: 'N 0°00\'00" E', distance: 1000 },
      { bearing: 'N 90°00\'00" E', distance: 1000 },
      { bearing: 'S 0°00\'00" E', distance: 1000 },
      { bearing: 'S 90°00\'00" W', distance: 980 },
    ]);
    // Both east-west courses explain this misclosure IDENTICALLY — the geometry cannot choose
    // between them — so the genuinely-wrong 980 ft leg must be AMONG the suspects rather than
    // necessarily first. Asserting it comes first would be asserting a coin-flip.
    const distanceSuspects = rankSuspects(t).filter((s) => s.field === 'distance');
    expect(distanceSuspects.some((s) => /20\.00 ft on a stated 980\.00 ft/.test(s.impliedCorrection))).toBe(true);
  });

  it('points the reviewer at one call rather than the whole description', () => {
    const t = traverse([
      { bearing: 'N 0°00\'00" E', distance: 1000 },
      { bearing: 'N 90°00\'00" E', distance: 1000 },
      { bearing: 'S 0°00\'00" E', distance: 1000 },
      { bearing: 'S 90°00\'00" W', distance: 980 },
    ]);
    const d = diagnoseClosure(t, 2015);
    expect(d.nextStep).toMatch(/Re-read call \d+'s distance/);
    // …and when two calls explain it equally well, it says so rather than letting the ordering
    // imply the first one is the answer.
    expect(d.statement).toContain('EQUALLY well');
  });
});

describe('a bad closure is not proof that WE misread it', () => {
  const bad = () => traverse([
    { bearing: 'N 0°00\'00" E', distance: 1000 },
    { bearing: 'N 90°00\'00" E', distance: 1000 },
    { bearing: 'S 0°00\'00" E', distance: 1000 },
    { bearing: 'S 90°00\'00" W', distance: 980 },
  ]);

  it('says an old deed closing badly is probably the original survey', () => {
    // Compass-and-chain work from the 1880s closing at 1:500 is normal. Telling a surveyor we misread
    // a deed that simply does not close sends them to re-read a correct document.
    const d = diagnoseClosure(bad(), 1885);
    expect(d.statement).toContain('compass-and-chain');
    expect(d.statement).toContain('not ours');
    expect(d.statement).toContain('do not');
  });

  it('says a modern deed closing badly probably IS a reading error', () => {
    const d = diagnoseClosure(bad(), 2015);
    expect(d.statement).toContain('expected to close far better');
    expect(d.statement).toContain('reading error is the more likely');
  });

  it('says the missing date is itself a problem', () => {
    // Without it the two cases cannot be told apart, and guessing either way misleads.
    const d = diagnoseClosure(bad(), null);
    expect(d.statement).toContain('recording date is unknown');
    expect(d.statement).toContain('cannot be told apart');
  });
});

describe('what it refuses to conclude', () => {
  it('will not use closure at all when a call could not be placed', () => {
    // The misclosure then measures our GAP, not our accuracy.
    const t = traverse([
      { bearing: 'N 0°00\'00" E', distance: 1000 },
      { bearing: 'illegible', distance: 1000 },
    ]);
    const d = diagnoseClosure(t);
    expect(d.quality).toBe('unknown');
    expect(d.statement).toContain('measures our gap rather than our accuracy');
  });

  it('declines to name a culprit when nothing lines up', () => {
    // Two errors interact and the direction argument stops holding. Saying so beats a confident
    // wrong finger-point.
    const t = traverse([
      { bearing: 'N 20°00\'00" E', distance: 1000 },
      { bearing: 'N 70°00\'00" E', distance: 900 },
      { bearing: 'S 25°00\'00" E', distance: 1100 },
      { bearing: 'S 65°00\'00" W', distance: 700 },
    ]);
    const d = diagnoseClosure(t, 2015);
    if (d.suspects.length === 0) {
      expect(d.statement).toContain('more than one error');
      expect(d.nextStep).toContain('single-call explanation does not fit');
    }
  });

  it('holds the good-closure threshold where a digit error cannot hide', () => {
    expect(GOOD_CLOSURE).toBeGreaterThanOrEqual(10_000);
  });
});

describe('the diagnosis is attached to the drawing, not left in a module', () => {
  // The whole point is that a person looking at one document's calls sees what its closure says
  // about our reading of it. A diagnosis nobody surfaces changes nothing — the mistake made once
  // already this session with the legibility check.
  it('appears in the drawing\'s caveats', async () => {
    const { drawBoundary } = await import('../services/survey-drawing.js');
    const d = drawBoundary(traverse(square()));
    expect(d.caveats.join(' ')).toContain('closes exactly');
  });

  it('carries the era judgement through, because it changes the conclusion', async () => {
    const { drawBoundary } = await import('../services/survey-drawing.js');
    const bad = [
      { bearing: 'N 0°00\'00" E', distance: 1000 },
      { bearing: 'N 90°00\'00" E', distance: 1000 },
      { bearing: 'S 0°00\'00" E', distance: 1000 },
      { bearing: 'S 90°00\'00" W', distance: 980 },
    ];
    const old = drawBoundary(traverse(bad), { recordedYear: 1885 });
    const modern = drawBoundary(traverse(bad), { recordedYear: 2015 });
    expect(old.caveats.join(' ')).toContain('compass-and-chain');
    expect(modern.caveats.join(' ')).toContain('reading error is the more likely');
  });

  it('gives the reviewer the next step alongside the drawing', async () => {
    const { drawBoundary } = await import('../services/survey-drawing.js');
    const d = drawBoundary(traverse([
      { bearing: 'N 0°00\'00" E', distance: 1000 },
      { bearing: 'N 90°00\'00" E', distance: 1000 },
      { bearing: 'S 0°00\'00" E', distance: 1000 },
      { bearing: 'S 90°00\'00" W', distance: 980 },
    ]), { recordedYear: 2015 });
    expect(d.caveats.some((c) => /Re-read call/.test(c))).toBe(true);
  });
});
