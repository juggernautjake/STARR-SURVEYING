// CAD_AUDIT Slice S14 — several records of the same land, agreed into one starting drawing.
//
// The owner's ask: "gather the distances and bearings/azimuths and points of interest from the
// survey drawings or calls and deeds and any document that we can find that has them and compare
// them to make sure they are in agreement and then we can use that to make our initial drawing."
//
// S9 compares TWO readings and reports. This agrees N and emits the figure — and the whole risk is
// that a drawing built this way looks equally authoritative whether four records agreed on a line or
// two contradicted each other and something picked one. So the tests below are mostly about what it
// REFUSES to smooth over.

import { describe, it, expect } from 'vitest';
import { reconcileSurveys, pointsFromReconciled, type ReconcileSource } from '@/lib/cad/compare/survey-reconcile';

const call = (bearing: number | null, distance: number | null) => ({ bearing, distance });

const src = (label: string, calls: Array<{ bearing: number | null; distance: number | null }>): ReconcileSource =>
  ({ label, calls });

describe('when the records agree', () => {
  const deed = src('1952 deed', [call(90, 100), call(180, 200)]);
  const plat = src('Plat Cab. B', [call(90, 100), call(180, 200)]);

  it('reports consensus and produces the figure', () => {
    const r = reconcileSurveys([deed, plat]);
    expect(r.disputedCalls).toBe(0);
    expect(r.consensusCalls).toBe(2);
    expect(r.fullyAgreed).toBe(true);
    expect(r.calls[0].bearing).toBe(90);
    expect(r.calls[0].distance).toBe(100);
  });

  it('tolerates a difference inside tolerance without calling it a dispute', () => {
    // A second of arc between two records is not a disagreement; flagging it would bury the real
    // ones under noise.
    const r = reconcileSurveys([deed, src('survey', [call(90.0002, 100.05), call(180, 200)])]);
    expect(r.disputedCalls).toBe(0);
  });
});

describe('when the records disagree — the case this exists for', () => {
  it('marks the call disputed instead of silently averaging', () => {
    // Two records, ten feet apart on one course. A drawing that just splits the difference presents
    // a line neither record describes, and looks exactly as confident as an agreed one.
    const r = reconcileSurveys([
      src('deed', [call(90, 100), call(180, 200)]),
      src('plat', [call(90, 110), call(180, 200)]),
    ]);
    expect(r.calls[0].distanceAgreement).toBe('disputed');
    expect(r.disputedCalls).toBe(1);
    expect(r.fullyAgreed).toBe(false);
    expect(r.calls[0].note).toMatch(/distance disputed/i);
  });

  it('keeps every competing value so the dispute can show its working', () => {
    const r = reconcileSurveys([
      src('deed', [call(90, 100)]),
      src('plat', [call(90, 110)]),
      src('survey', [call(90, 100)]),
    ]);
    expect(r.calls[0].distances.map((d) => `${d.source}:${d.value}`))
      .toEqual(['deed:100', 'plat:110', 'survey:100']);
    expect(r.calls[0].distanceSpreadFeet).toBe(10);
  });

  it('uses the median, so one transposed digit does not move the answer', () => {
    // 234.56 read as 243.56 in one record of three. A mean lands at 237.56 — a value no record
    // states — and quietly corrupts a course the other two agree on exactly.
    const r = reconcileSurveys([
      src('a', [call(0, 234.56)]),
      src('b', [call(0, 243.56)]),
      src('c', [call(0, 234.56)]),
    ]);
    expect(r.calls[0].distance).toBe(234.56);
  });

  it('still reports a value on a disputed call, so a figure can be drawn at all', () => {
    // Refusing to emit anything would leave the surveyor with nothing to start from, which is worse
    // than a marked-up figure. The marking is what makes it honest.
    const r = reconcileSurveys([src('a', [call(90, 100)]), src('b', [call(90, 140)])]);
    expect(r.calls[0].distance).not.toBeNull();
    expect(r.calls[0].distanceAgreement).toBe('disputed');
  });
});

describe('what it refuses to overstate', () => {
  it('does not call a single record agreement', () => {
    // One record cannot corroborate itself. `fullyAgreed` means "the records agree", and with one
    // record there is nothing to agree with.
    const r = reconcileSurveys([src('only deed', [call(90, 100)])]);
    expect(r.fullyAgreed).toBe(false);
    expect(r.singleSourceCalls).toBe(1);
    expect(r.calls[0].note).toMatch(/uncorroborated/i);
  });

  it('does not call an uncorroborated call agreed, even alongside agreed ones', () => {
    const r = reconcileSurveys([
      src('deed', [call(90, 100), call(180, 200)]),
      src('plat', [call(90, 100)]),          // second course absent
    ]);
    expect(r.calls[0].bearingAgreement).toBe('consensus');
    expect(r.calls[1].bearingAgreement).toBe('single-source');
    expect(r.fullyAgreed).toBe(false);
  });

  it('names records that describe a different number of courses, and keeps the longest', () => {
    // Usually one record splits a line another runs straight through. Truncating to the shortest
    // would silently drop boundary.
    const r = reconcileSurveys([
      src('deed', [call(90, 100), call(180, 200), call(270, 100)]),
      src('plat', [call(90, 100), call(180, 200)]),
    ]);
    expect(r.calls).toHaveLength(3);
    expect(r.differingCallCounts).toEqual([{ source: 'plat', count: 2 }]);
    expect(r.fullyAgreed).toBe(false);
    expect(r.summary).toMatch(/different number of courses/i);
  });

  it('never reads a missing bearing as due north', () => {
    // 0 is a real azimuth, so absence must not become a call. This is the refusal S9a pins too.
    const r = reconcileSurveys([src('a', [call(null, 100)]), src('b', [call(null, 100)])]);
    expect(r.calls[0].bearing).toBeNull();
    expect(r.calls[0].bearingAgreement).toBe('missing');
  });

  it('treats a stated bearing of 0 as a real value', () => {
    const r = reconcileSurveys([src('a', [call(0, 100)]), src('b', [call(0, 100)])]);
    expect(r.calls[0].bearing).toBe(0);
    expect(r.calls[0].bearingAgreement).toBe('consensus');
  });

  it('handles no records at all without pretending', () => {
    const r = reconcileSurveys([]);
    expect(r.calls).toEqual([]);
    expect(r.fullyAgreed).toBe(false);
    expect(r.summary).toMatch(/nothing to reconcile/i);
  });
});

describe('bearings that straddle north', () => {
  it('does not invent a southward call from two northward ones', () => {
    // The seam bug: a naive median of [359, 1] is 180 — due south — from two records that both
    // point within a degree of north.
    const r = reconcileSurveys([src('a', [call(359, 100)]), src('b', [call(1, 100)])]);
    const b = r.calls[0].bearing;
    expect(b === null ? -1 : Math.min(b, 360 - b)).toBeLessThan(2);
  });

  it('measures the spread the short way round', () => {
    const r = reconcileSurveys([src('a', [call(359, 100)]), src('b', [call(1, 100)])]);
    expect(r.calls[0].bearingSpreadSeconds).toBeCloseTo(2 * 3600, 0);
  });
});

describe('applying a known basis offset', () => {
  it('rotates a source onto the common basis before comparing', () => {
    // A 1952 deed on magnetic north against a 1998 survey on grid north. Without the offset every
    // call reads as disputed; with it they agree, which is the whole point of leading with basis.
    const r = reconcileSurveys([
      { label: 'grid survey', calls: [call(90, 100), call(180, 200)] },
      { label: '1952 deed', calls: [call(84, 100), call(174, 200)], basisOffsetDeg: 6 },
    ]);
    expect(r.disputedCalls).toBe(0);
    expect(r.calls[0].bearing).toBe(90);
  });
});

describe('walking the reconciled figure', () => {
  it('produces corners from the point of beginning', () => {
    const r = reconcileSurveys([src('a', [call(90, 100)]), src('b', [call(90, 100)])]);
    const { points, usedCalls, stoppedAt } = pointsFromReconciled(r.calls);
    expect(usedCalls).toBe(1);
    expect(stoppedAt).toBeNull();
    expect(points[0]).toEqual({ x: 0, y: 0 });
    // Due east: +x, y unchanged.
    expect(points[1].x).toBeCloseTo(100, 6);
    expect(points[1].y).toBeCloseTo(0, 6);
  });

  it('uses the surveying convention — north is +y', () => {
    const r = reconcileSurveys([src('a', [call(0, 50)]), src('b', [call(0, 50)])]);
    const { points } = pointsFromReconciled(r.calls);
    expect(points[1].y).toBeCloseTo(50, 6);
    expect(points[1].x).toBeCloseTo(0, 6);
  });

  it('STOPS at an unusable call rather than skipping it', () => {
    // Skipping does not leave a gap — it produces a different, closed-looking shape. Same rule as
    // S8a: a boundary drawn from 8 of 10 calls is not a boundary with two gaps.
    const r = reconcileSurveys([
      src('a', [call(90, 100), call(null, null), call(270, 100)]),
      src('b', [call(90, 100), call(null, null), call(270, 100)]),
    ]);
    const walked = pointsFromReconciled(r.calls);
    expect(walked.usedCalls).toBe(1);
    expect(walked.stoppedAt).toBe(1);
    expect(walked.stoppedReason).toMatch(/course 2 has no bearing/i);
    expect(walked.points).toHaveLength(2);
  });
});
