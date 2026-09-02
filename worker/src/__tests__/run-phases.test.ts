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
  RUN_MINUTES,
  clampRunMinutes,
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

describe('a REAL Bell run log, replayed', () => {
  // Taken verbatim from the owner's exported run log, 2026-09-02. The whole 25-minute run emits
  // three phase names — Validation | Phase 1 | Phase 2 — and "Phase 2" alone spans 24 of the 25
  // minutes. The sub-phase lives in the message.
  const REAL = [
    [0,    'Validation', 'Verifying address and county match...'],
    [1,    'Phase 1',    '[0s] PHASE 1 — Property Identification'],
    [80,   'Phase 2',    '[80s] 2A — Bell County Clerk search...'],
    [432,  'Phase 2',    '[432s] 2B — Plat repository + clerk plat search...'],
    [551,  'Phase 2',    '[551s] 2B½ — Fetching 11 deed/dedication instrument(s)...'],
    [1168, 'Phase 2',    '[1168s] 2C/D/E — FEMA + TxDOT + Tax (parallel)...'],
    [1178, 'Phase 2',    '[1178s] Capturing supplemental page screenshots...'],
    [1407, 'Phase 2',    '[1407s] Capturing GIS viewer screenshots (multiple views)...'],
  ] as const;

  function replay() {
    const t = new RunProgressTracker(T0);
    const seen: Array<{ sec: number; pct: number; phase: string }> = [];
    for (const [sec, phase, msg] of REAL) {
      const s = t.observe(phase, msg, 0, at(sec));
      seen.push({ sec, pct: s.percent, phase: s.phaseId });
    }
    return seen;
  }

  it('does NOT park on one rung for the whole of Phase 2', () => {
    const seen = replay();
    const duringPhase2 = seen.filter((s) => s.sec >= 80);
    const distinct = new Set(duringPhase2.map((s) => s.phase));
    // The phase field says "Phase 2" for every one of these. The message says otherwise.
    expect(distinct.size, `only ${[...distinct]} — the bar parked`).toBeGreaterThanOrEqual(4);
  });

  it('advances monotonically the whole way down the real log', () => {
    const seen = replay();
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].pct, `${seen[i - 1].sec}s → ${seen[i].sec}s went backwards`)
        .toBeGreaterThanOrEqual(seen[i - 1].pct);
    }
  });

  it('is nowhere near 92% in the first seconds — the reported bug', () => {
    const seen = replay();
    expect(seen[0].pct).toBeLessThan(5);
    expect(seen[1].pct).toBeLessThan(10);
  });

  it('reaches the imagery rung by the time it is capturing screenshots', () => {
    const seen = replay();
    expect(seen[seen.length - 1].phase).toBe('imagery');
  });

  it('strips the [80s] prefix, or every anchored message pattern is decorative', () => {
    // Anchors and prefixes have to be considered together. Without the strip, `^2a` never matches
    // "[80s] 2A — ..." and the ladder silently falls back to the phase field for the whole run.
    expect(RUN_PHASES[resolvePhaseIndex('Phase 2', '[80s] 2A — Bell County Clerk search...')].id)
      .toBe('clerk_search');
  });
});

describe('the run length is chosen, and the bar paces itself to it', () => {
  it('offers 15 / 30 / 60 — the owner\'s figures', () => {
    expect(RUN_MINUTES.min).toBe(15);
    expect(RUN_MINUTES.default).toBe(30);
    expect(RUN_MINUTES.max).toBe(60);
  });

  it('clamps anything outside that range', () => {
    expect(clampRunMinutes(5)).toBe(15);
    expect(clampRunMinutes(90)).toBe(60);
    expect(clampRunMinutes(undefined)).toBe(30);
    expect(clampRunMinutes(NaN)).toBe(30);
    expect(clampRunMinutes(42)).toBe(42);
  });

  it('a SHORT run reaches the same milestone sooner, not at a different percentage', () => {
    // The shares are the same work; only the pace differs. A 15-minute run should be further along
    // at 5 minutes than a 60-minute run is.
    const short = new RunProgressTracker(T0, 15 * 60);
    const long = new RunProgressTracker(T0, 60 * 60);
    short.observe('Plats', undefined, 0, T0);
    long.observe('Plats', undefined, 0, T0);
    expect(short.snapshot(at(300)).percent).toBeGreaterThan(long.snapshot(at(300)).percent);
  });

  it('a LONG run does not race to its ceiling and stall', () => {
    // Built for ~28 minutes nominal; a 60-minute run must not exhaust the phase in the first third.
    const long = new RunProgressTracker(T0, 60 * 60);
    long.observe('Plats', undefined, 0, T0);
    const a = long.snapshot(at(600)).percent;
    const b = long.snapshot(at(1200)).percent;
    expect(b).toBeGreaterThan(a);
  });

  it('both lengths hit the SAME percentage at the same milestone', () => {
    // Entering a phase credits the same share regardless of pace — that is what makes the number
    // mean "how much of the work", not "how much of the clock".
    const short = new RunProgressTracker(T0, 15 * 60);
    const long = new RunProgressTracker(T0, 60 * 60);
    expect(short.observe('Adjacent', undefined, 0, T0).percent)
      .toBe(long.observe('Adjacent', undefined, 0, T0).percent);
  });

  it('scales the estimate of time left, or it promises the wrong minutes', () => {
    const short = new RunProgressTracker(T0, 15 * 60).observe('GIS', undefined, 0, T0);
    const long = new RunProgressTracker(T0, 60 * 60).observe('GIS', undefined, 0, T0);
    expect(long.etaSec!).toBeGreaterThan(short.etaSec! * 2);
  });
});

describe('the worker\'s settings agree with the bar', () => {
  it('run-settings clamps to the same 15–60 range', async () => {
    // Two numbers that must agree: the bar paces to the chosen length, so a setting outside the
    // range the bar knows about would be calibrated to a run nobody can choose.
    const { normaliseRunSettings } = await import('../research/run-settings.js');
    expect(normaliseRunSettings({ maxResearchTimeMinutes: 5 }).maxResearchTimeMinutes).toBe(RUN_MINUTES.min);
    expect(normaliseRunSettings({ maxResearchTimeMinutes: 500 }).maxResearchTimeMinutes).toBe(RUN_MINUTES.max);
  });
});
