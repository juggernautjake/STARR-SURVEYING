// Somewhere to put the answer when it arrives.
//
// S8 and R19 have both been blocked on "a plat whose answers are already known" since they were
// written, and §4 calls it the single highest-value item on the owner's list. There was nowhere to
// put one — no fixture shape, no comparison, no report. That is the S-9 lesson repeating: a blocker
// with no form behind it survives the decision, and the owner could hand over a plat tomorrow and
// the measurement still would not exist.
//
// The tests that matter here are the ones about what the harness REFUSES to say, and about the
// comparisons that would be wrong if done naively — because a lenient harness is worse than no
// harness: it turns an open question into a reassurance.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  measureAgainstGolden, bearingDeltaSec, BEARING_TOLERANCE_SEC,
  type GoldenPlat, type ExtractedCall,
} from '../services/golden-plat.js';

const plat = (calls: GoldenPlat['calls']): GoldenPlat => ({
  source: { county: 'Bell', instrument: '2020032310', recordedYear: 2020 },
  establishedBy: 'owner', establishedAt: '2026-08-03', basis: 'read_from_document',
  calls,
});

const got = (calls: ExtractedCall[]) => calls;

describe('with no golden plat, it refuses to score', () => {
  it('says NOT MEASURED rather than 100%', () => {
    // An empty denominator producing a perfect score is how a measurement becomes a reassurance.
    const r = measureAgainstGolden([]);
    expect(r.measured).toBe(false);
    expect(r.statement).toContain('NOT MEASURED');
  });

  it('says it is not a zero either', () => {
    const r = measureAgainstGolden([]);
    expect(r.statement).toContain('not a score of zero');
    expect(r.statement).toContain('certainly not a pass');
  });

  it('says WHY the gap matters, not just that it exists', () => {
    expect(measureAgainstGolden([]).statement)
      .toContain('proves the arithmetic and nothing about the reading');
  });
});

describe('a bearing is compared as an angle, not as a string', () => {
  // Three spellings of one bearing. A harness that called these different answers would be
  // measuring our formatting rather than our reading.
  it('accepts the same bearing written differently', () => {
    const p = plat([{ index: 0, bearing: 'N 45°30\'00" E', distance: 100 }]);
    for (const spelling of ['N 45-30-00 E', 'N 45 30 00 E', 'N45°30\'00"E']) {
      const r = measureAgainstGolden([{ golden: p, extracted: got([{ index: 0, bearing: spelling, distance: 100 }]) }]);
      expect(r.comparisons[0]!.bearing.verdict, spelling).toBe('correct');
    }
  });

  it('catches a misread minutes digit', () => {
    // 45°30' read as 45°80' is 30 minutes out — sixty times the tolerance.
    const p = plat([{ index: 0, bearing: 'N 45°30\'00" E', distance: 100 }]);
    const r = measureAgainstGolden([{ golden: p, extracted: got([{ index: 0, bearing: 'N 46°00\'00" E', distance: 100 }]) }]);
    expect(r.comparisons[0]!.bearing.verdict).toBe('wrong');
  });

  it('catches a flipped quadrant, which a numeric comparison alone would miss', () => {
    const p = plat([{ index: 0, bearing: 'N 45°00\'00" E', distance: 100 }]);
    const r = measureAgainstGolden([{ golden: p, extracted: got([{ index: 0, bearing: 'N 45°00\'00" W', distance: 100 }]) }]);
    expect(r.comparisons[0]!.bearing.verdict).toBe('wrong');
  });

  it('measures the angle the short way round', () => {
    expect(bearingDeltaSec('N 1°00\'00" E', 'N 1°00\'00" W')).toBeCloseTo(2 * 3600, 0);
  });

  it('keeps the tolerance far below a misread digit', () => {
    // The tolerance exists for rounding in the golden record, not to forgive an error.
    expect(BEARING_TOLERANCE_SEC).toBeLessThan(60);
  });

  it('scores an unparseable output as WRONG, not missing', () => {
    // We produced something and it is not a bearing — a different failure from producing nothing.
    const p = plat([{ index: 0, bearing: 'N 45°00\'00" E', distance: 100 }]);
    const r = measureAgainstGolden([{ golden: p, extracted: got([{ index: 0, bearing: 'illegible', distance: 100 }]) }]);
    expect(r.comparisons[0]!.bearing.verdict).toBe('wrong');
  });
});

describe('a distance read correctly in another unit is a correct reading', () => {
  it('normalises before comparing', () => {
    // 1,900 varas and 5,277.78 ft are the same call. Comparing the raw numbers would score a
    // perfect reading as a 178% error — and would have quietly made the vara pipeline look broken.
    const p = plat([{ index: 0, bearing: 'N 0°00\'00" E', distance: 1900, unit: 'varas' }]);
    const r = measureAgainstGolden([{
      golden: p,
      extracted: got([{ index: 0, bearing: 'N 0°00\'00" E', distance: 1900 * (25 / 9), unit: 'us_survey_feet' }]),
    }]);
    expect(r.comparisons[0]!.distance.verdict).toBe('correct');
  });

  it('still catches a transposed digit', () => {
    const p = plat([{ index: 0, bearing: 'N 0°00\'00" E', distance: 247.5 }]);
    const r = measureAgainstGolden([{ golden: p, extracted: got([{ index: 0, bearing: 'N 0°00\'00" E', distance: 274.5 }]) }]);
    expect(r.comparisons[0]!.distance.verdict).toBe('wrong');
  });

  it('has an absolute floor so a short call is not judged on a hair', () => {
    const p = plat([{ index: 0, bearing: 'N 0°00\'00" E', distance: 3 }]);
    const r = measureAgainstGolden([{ golden: p, extracted: got([{ index: 0, bearing: 'N 0°00\'00" E', distance: 3.01 }]) }]);
    expect(r.comparisons[0]!.distance.verdict).toBe('correct');
  });
});

describe('FOUND vs SET is never treated as a labelling slip', () => {
  const p = plat([{ index: 0, bearing: 'N 0°00\'00" E', distance: 100, monument: 'a 1/2 inch iron rod found' }]);

  it('matches on kind AND status', () => {
    const r = measureAgainstGolden([{
      golden: p,
      extracted: got([{ index: 0, bearing: 'N 0°00\'00" E', distance: 100, monument: 'found 1/2" iron rod' }]),
    }]);
    expect(r.comparisons[0]!.monument.verdict).toBe('correct');
  });

  it('calls a set rod read as found WRONG, and flags it separately', () => {
    // A found monument controls the corner; a set one is the previous surveyor's opinion. Confusing
    // them moves a boundary, so it is counted apart from the totals rather than diluted into them.
    const r = measureAgainstGolden([{
      golden: p,
      extracted: got([{ index: 0, bearing: 'N 0°00\'00" E', distance: 100, monument: 'a 1/2 inch iron rod set' }]),
    }]);
    expect(r.comparisons[0]!.monument.verdict).toBe('wrong');
    expect(r.comparisons[0]!.monument.statusConfused).toBe(true);
    expect(r.statusConfusions).toBe(1);
    expect(r.statement).toContain('moves a boundary');
  });

  it('does not flag a status confusion when the KIND is also wrong', () => {
    // Two different errors; conflating them would inflate the count that is supposed to be alarming.
    const r = measureAgainstGolden([{
      golden: p,
      extracted: got([{ index: 0, bearing: 'N 0°00\'00" E', distance: 100, monument: 'a concrete monument set' }]),
    }]);
    expect(r.comparisons[0]!.monument.statusConfused).toBe(false);
  });
});

describe('recall and precision are different questions', () => {
  const p = plat([
    { index: 0, bearing: 'N 0°00\'00" E', distance: 100 },
    { index: 1, bearing: 'N 90°00\'00" E', distance: 100 },
  ]);

  it('a pipeline that drops half the calls does not score 100%', () => {
    // Perfect on what it produced, half on what the plat states. Reporting only the first would be
    // flattering nonsense.
    const r = measureAgainstGolden([{ golden: p, extracted: got([{ index: 0, bearing: 'N 0°00\'00" E', distance: 100 }]) }]);
    expect(r.produced.bearings).toBe(100);
    expect(r.readCorrectly.bearings).toBe(50);
  });

  it('reports both numbers in the statement', () => {
    const r = measureAgainstGolden([{ golden: p, extracted: got([{ index: 0, bearing: 'N 0°00\'00" E', distance: 100 }]) }]);
    expect(r.statement).toContain('read /');
    expect(r.statement).toContain('correct when produced');
  });

  it('names the source and how its truth was established', () => {
    // "Read off the plat by an RPLS" and "typed from a vendor export" are different authorities.
    const r = measureAgainstGolden([{ golden: p, extracted: got([]) }]);
    expect(r.statement).toContain('Bell/2020032310 (read_from_document)');
  });
});

describe('the harness is self-activating', () => {
  // A harness that needs code changed before it can be used is another form of blocker. Anything
  // dropped into `golden-plats/` is picked up here — so the day the owner supplies a plat, the
  // measurement runs, without this file or any other being edited.
  //
  // This is also what makes the module REACHABLE rather than an orphan waiting for data, which is
  // the shape `research-modules-are-reachable.test.ts` exists to prevent.
  const dir = path.join(process.cwd(), 'src/__tests__/golden-plats');

  const loaded = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as GoldenPlat)
    : [];

  it('picks up whatever plats exist, and says so either way', () => {
    const report = measureAgainstGolden(loaded.map((g) => ({ golden: g, extracted: [] })));
    if (loaded.length === 0) {
      // The honest state today. NOT an assertion that extraction is fine.
      expect(report.measured).toBe(false);
      expect(report.statement).toContain('NOT MEASURED');
    } else {
      expect(report.measured).toBe(true);
      expect(report.plats).toBe(loaded.length);
    }
  });

  it('every supplied plat carries its provenance', () => {
    // A golden record nobody signed is an assertion, not a standard.
    for (const g of loaded) {
      expect(g.source?.county, 'county').toBeTruthy();
      expect(g.source?.instrument, 'instrument').toBeTruthy();
      expect(g.establishedBy, 'establishedBy').toBeTruthy();
      expect(['read_from_document', 'field_verified', 'vendor_export']).toContain(g.basis);
      expect(Array.isArray(g.calls) && g.calls.length > 0, 'calls').toBe(true);
    }
  });

  it('the drop-in directory and its instructions exist', () => {
    // The instructions ARE the interface for whoever supplies the plat.
    expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true);
  });
});
