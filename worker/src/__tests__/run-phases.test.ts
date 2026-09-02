// worker/src/__tests__/run-phases.test.ts — the 92% bug, and the shape of an honest bar.
//
// The owner's report: the bar "quickly jumps up to 92% after the research has begun and then loads
// slowly from there until complete… deceiving." Production agreed — one recorded run sat at
// progress_percent = 92, another at 98 while still in "Phase 2".

import { describe, it, expect } from 'vitest';
import {
  RUN_PHASES,
  RunProgressTracker,
  resolvePhaseIndex,
  percentAt,
  timeFraction,
  estimateRemainingSec,
  EXPECTED_TOTAL_SEC,
} from '../research/run-phases.js';

const T0 = 1_700_000_000_000;
const at = (sec: number) => T0 + sec * 1000;

describe('THE BUG: the router pre-check must not jump the bar', () => {
  // counties/router.ts:412, before any work starts:
  //     onProgress({ phase: 'Validation', message: 'Verifying address and county match...' })
  it('files phase "Validation" at the very START of the run, not at 92%', () => {
    const t = new RunProgressTracker(T0);
    const s = t.observe('Validation', 'Verifying address and county match...', 0, T0);
    expect(s.phaseId).toBe('precheck');
    expect(s.percent).toBeLessThan(3);
  });

  it('a run that has only pre-checked is nowhere near done', () => {
    const t = new RunProgressTracker(T0);
    // Even after the pre-check has dawdled for a minute.
    const s = t.observe('Validation', 'Verifying address and county match...', 0, at(60));
    expect(s.percent).toBeLessThan(5);
  });

  it('the late verification rung is reachable by its REAL names, not by the word "validation"', () => {
    expect(RUN_PHASES[resolvePhaseIndex('Adjacent')].id).toBe('validation');
    expect(RUN_PHASES[resolvePhaseIndex('Phase 3C')].id).toBe('validation');
    // And the ambiguous bare word now belongs to the pre-check, which is what actually emits it.
    expect(RUN_PHASES[resolvePhaseIndex('Validation')].id).toBe('precheck');
  });
});

describe('an unrecognised name does NOT move the bar', () => {
  // The inversion. Under the old rule a loose word match could advance the milestone permanently;
  // now only an explicitly recognised name can.
  it('returns -1 rather than guessing', () => {
    expect(resolvePhaseIndex('Some Future Phase')).toBe(-1);
    expect(resolvePhaseIndex('AI Credits')).toBe(-1);
    expect(resolvePhaseIndex(undefined, 'a message about nothing in particular')).toBe(-1);
  });

  it('leaves the milestone where it was', () => {
    const t = new RunProgressTracker(T0);
    t.observe('GIS', undefined, 0, T0);
    const before = t.snapshot(at(10));
    const after = t.observe('Totally Unknown Phase', 'who knows', 0, at(10));
    expect(after.phaseId).toBe(before.phaseId);
    expect(after.phaseIndex).toBe(before.phaseIndex);
  });

  it('a message merely CONTAINING a late word cannot leap the bar', () => {
    // The exact failure: loose /validat/, /report/, /summar/, /extract/ against free text.
    const t = new RunProgressTracker(T0);
    t.observe('GIS', undefined, 0, T0);
    for (const msg of [
      'Validating the address format',
      'Preparing to report on findings',
      'Building a summary of what we will do',
      'About to extract nothing yet',
    ]) {
      const s = t.observe(undefined, msg, 0, at(5));
      expect(s.phaseId, msg).toBe('property');
      expect(s.percent, msg).toBeLessThan(10);
    }
  });
});

describe('the bar moves like a clock', () => {
  it('advances between progress events, with no new event', () => {
    // A run emits an event every few minutes; the screen polls every three seconds. The old bar
    // froze in between and then hopped.
    const t = new RunProgressTracker(T0);
    t.observe('Plats', undefined, 0, T0);          // retrieval, the long pole
    const a = t.snapshot(at(30)).percent;
    const b = t.snapshot(at(120)).percent;
    const c = t.snapshot(at(300)).percent;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('is roughly linear in time across a whole nominal run', () => {
    // Walk the ladder at each phase's expected pace and check the bar tracks elapsed time. This is
    // the property the owner asked for: percentage relatable to time passed and time left.
    const t = new RunProgressTracker(T0);
    let clock = 0;
    for (const p of RUN_PHASES) {
      t.observe(nameFor(p.id), undefined, 0, at(clock));
      clock += p.expectedSec;
      const pct = t.snapshot(at(clock)).percent;
      const elapsedShare = (clock / EXPECTED_TOTAL_SEC) * 100;
      // Within 12 points of wall-clock share for the whole walk.
      expect(Math.abs(pct - elapsedShare), `${p.id} pct=${pct} elapsed=${elapsedShare.toFixed(1)}`)
        .toBeLessThan(12);
    }
  });

  it('never runs past the phase it is in', () => {
    // A slow phase creeps toward its own ceiling and stops. It must not claim the next phase's work.
    const t = new RunProgressTracker(T0);
    t.observe('GIS', undefined, 0, T0);            // property: ends at ~5%
    const veryLate = t.snapshot(at(60 * 60)).percent;
    const propertyEnd = percentAt(1, 1);
    expect(veryLate).toBeLessThanOrEqual(Math.round(propertyEnd));
  });

  it('never goes backwards when phases interleave', () => {
    // Enrichment re-enters retrieval after extraction has begun; a retreating bar reads as "it
    // crashed and started over".
    const t = new RunProgressTracker(T0);
    t.observe('Deed Analysis', undefined, 0, T0);
    const high = t.snapshot(at(10)).percent;
    const after = t.observe('Plats', 'Stage 2: Fetching deed record 9/17', 0, at(20));
    expect(after.percent).toBeGreaterThanOrEqual(high);
  });

  it('prefers the worker\'s own count over the clock when it has one', () => {
    // "document 12 of 40" is better evidence than elapsed time.
    const t = new RunProgressTracker(T0);
    t.observe('Plats', undefined, 0, T0);
    const clockOnly = t.snapshot(at(5)).percent;
    const counted = t.observe('Plats', undefined, 0.8, at(5)).percent;
    expect(counted).toBeGreaterThan(clockOnly);
  });
});

describe('timeFraction', () => {
  it('is linear to the expected duration, then asymptotic', () => {
    expect(timeFraction(0, 100)).toBe(0);
    expect(timeFraction(50, 100)).toBeCloseTo(0.45, 2);
    expect(timeFraction(100, 100)).toBeCloseTo(0.9, 2);
    expect(timeFraction(200, 100)).toBeGreaterThan(0.9);
    // Saturates at 1, never above it. Fraction 1 means "the end of THIS phase", which is the most
    // a phase can honestly claim — it cannot reach into the next phase's span, and the overall bar
    // stays capped at 99 until a genuine completion.
    expect(timeFraction(10_000, 100)).toBeLessThanOrEqual(1);
    expect(timeFraction(1e9, 100)).toBeLessThanOrEqual(1);
  });
});

describe('the ladder is derived from durations, not from invented percentages', () => {
  it('every phase declares a duration', () => {
    for (const p of RUN_PHASES) expect(p.expectedSec, p.id).toBeGreaterThan(0);
  });

  it('a full nominal run is in the 20–30 minute range the owner described', () => {
    expect(EXPECTED_TOTAL_SEC / 60).toBeGreaterThan(18);
    expect(EXPECTED_TOTAL_SEC / 60).toBeLessThan(32);
  });

  it('retrieval is the long pole, so it owns the largest share', () => {
    const longest = [...RUN_PHASES].sort((a, b) => b.expectedSec - a.expectedSec)[0];
    expect(longest.id).toBe('retrieval');
  });

  it('has NO loose single-word pattern that could match unrelated prose', () => {
    // The rule that was broken. Every pattern must be anchored or an exact name.
    for (const p of RUN_PHASES) {
      for (const re of p.match) {
        expect(re.source.startsWith('^'), `${p.id}: ${re} is not anchored`).toBe(true);
      }
    }
  });

  it('has more rungs than before, so the steps are smaller', () => {
    expect(RUN_PHASES.length).toBeGreaterThanOrEqual(12);
  });
});

describe('only a real completion reaches 100', () => {
  it('caps a running bar at 99 however long it takes', () => {
    const t = new RunProgressTracker(T0);
    t.observe('Survey Plan', undefined, 0, T0);
    expect(t.snapshot(at(10 * 60 * 60)).percent).toBeLessThanOrEqual(99);
  });

  it('reaches exactly 100 on completion', () => {
    const t = new RunProgressTracker(T0);
    t.observe('GIS', undefined, 0, T0);
    expect(t.finish('complete', at(60)).percent).toBe(100);
  });

  it('keeps the percentage a stopped run actually reached', () => {
    const t = new RunProgressTracker(T0);
    t.observe('Plats', undefined, 0, T0);
    const before = t.snapshot(at(200)).percent;
    const after = t.finish('cancelled', at(200)).percent;
    expect(after).toBe(before);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(100);
  });
});

describe('the estimate of time left', () => {
  it('shrinks as the run advances', () => {
    const early = estimateRemainingSec(1, 0);
    const late = estimateRemainingSec(10, 0.5);
    expect(late).toBeLessThan(early);
  });

  it('is roughly the whole run at the start', () => {
    expect(estimateRemainingSec(0, 0)).toBeCloseTo(EXPECTED_TOTAL_SEC, -1);
  });

  it('is reported on the snapshot, so a caller can say "about N minutes left"', () => {
    const t = new RunProgressTracker(T0);
    const s = t.observe('GIS', undefined, 0, T0);
    expect(s.etaSec).toBeGreaterThan(0);
    expect(t.finish('complete', at(60)).etaSec).toBeNull();
  });
});

/** A phase name the ladder recognises for the given rung, for the linearity walk. */
function nameFor(id: string): string {
  const byId: Record<string, string> = {
    precheck: 'Validation', property: 'GIS', discovery: 'discovery',
    clerk_search: 'Clerk', retrieval: 'Plats', purchase: 'purchase',
    context: 'FEMA', imagery: 'Screenshots', ocr: 'OCR',
    extraction: 'Deed Analysis', reconciliation: 'Stage 3.5',
    validation: 'Adjacent', reporting: 'Survey Plan',
  };
  const n = byId[id];
  if (!n) throw new Error(`no known name for rung ${id} — the test's map is stale`);
  return n;
}
