// lib/cad/compare/survey-reconcile.ts — CAD_AUDIT Slice S14.
//
// Several records of the same land, agreed call by call, into one starting drawing.
//
// ── WHAT S9 ALREADY DOES, AND WHERE THIS STARTS ─────────────────────────────────────────────────
// `compareSurveys` takes TWO readings and *reports* the difference, leading with the basis rotation
// so a change of frame is not presented as eighteen errors. S14 is the step past that: take **N**
// sources — a deed, the plat, a prior survey, an adjoiner's description — agree them, and emit the
// figure to start drawing from, with every call carrying which sources agreed and which did not.
//
// ── THE RULE INHERITED FROM S8a, AND IT GOVERNS EVERYTHING HERE ─────────────────────────────────
// An unknown is never rendered as an answer. A drawing is the easiest place in this product to break
// that, because a clean line looks equally authoritative whether four records agreed on it or two
// contradicted each other and something picked one.
//
// So a reconciled call is never a silent average. Where the sources agree, the agreed value carries
// `consensus`. Where they disagree beyond tolerance, **the disagreement is the output**: a value is
// still chosen so a figure can be drawn at all, but it is marked `disputed`, the competing values
// are kept, and the caller is expected to show that. A surveyor who cannot see which calls were
// contested has been handed a worse document than the deeds they started with.
//
// ── WHY THE MEDIAN, AND NOT THE MEAN ────────────────────────────────────────────────────────────
// Same reasoning S9a records for the basis offset, and it matters more here because there can be
// more than two sources. One transposed digit in one deed — 234.56 read as 243.56 — moves a mean by
// several feet and quietly corrupts a call every other record agreed on. The median ignores it and
// the outlier still shows up in the spread.

import { normalizeDelta, median, type CompareCall } from './survey-compare';

export interface ReconcileSource {
  /** How this record is named in the report: "1952 deed", "Plat Cab. B Sl. 214", "Smith survey". */
  label: string;
  calls: readonly CompareCall[];
  /** Rotation in degrees to bring this source onto the common basis, if already known. When absent,
   *  the source is used as given — this module does NOT re-derive the basis; `compareSurveys` owns
   *  that, and doing it twice in two places is how the two come to disagree. */
  basisOffsetDeg?: number;
}

export interface ReconcileOptions {
  bearingToleranceSeconds?: number;
  distanceToleranceFeet?: number;
}

export type CallAgreement =
  /** Every source that stated this call agrees within tolerance. */
  | 'consensus'
  /** Sources disagree beyond tolerance. A value is chosen so a figure exists; it is not settled. */
  | 'disputed'
  /** Only one source stated this call. Not agreement — nothing corroborated it. */
  | 'single-source'
  /** No source gave a usable value. */
  | 'missing';

export interface ReconciledCall {
  index: number;
  bearing: number | null;
  distance: number | null;
  bearingAgreement: CallAgreement;
  distanceAgreement: CallAgreement;
  /** Every stated value, by source, so a disputed call can show its working. */
  bearings: Array<{ source: string; value: number }>;
  distances: Array<{ source: string; value: number }>;
  /** Widest disagreement, in seconds / feet. Null when fewer than two sources stated it. */
  bearingSpreadSeconds: number | null;
  distanceSpreadFeet: number | null;
  /** One line naming what happened to this call. */
  note: string;
}

export interface Reconciliation {
  calls: ReconciledCall[];
  sourceLabels: string[];
  /** Sources whose call COUNT differs from the reconciled length. Named, never truncated silently —
   *  usually one record splits a line another runs straight through, which is exactly what a
   *  surveyor needs told. */
  differingCallCounts: Array<{ source: string; count: number }>;
  consensusCalls: number;
  disputedCalls: number;
  singleSourceCalls: number;
  /** True when nothing was contested. The one condition under which the figure may be presented
   *  without qualification. */
  fullyAgreed: boolean;
  summary: string;
}

const DEFAULT_BEARING_TOL_SEC = 60;
const DEFAULT_DISTANCE_TOL_FT = 0.1;

/** Widest gap between any two values, using the wrapped difference so 359° and 1° are 2° apart. */
function bearingSpreadSeconds(values: number[]): number | null {
  if (values.length < 2) return null;
  let worst = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      worst = Math.max(worst, Math.abs(normalizeDelta(values[i] - values[j])));
    }
  }
  return worst * 3600;
}

/** The representative bearing. Median of the values, taken on the UNWRAPPED set only when they do
 *  not straddle north; when they do, everything is rotated away from the seam, the median is taken,
 *  and the result is rotated back. A median of [359, 1] is otherwise 180 — a call pointing due
 *  south, invented out of two that both point north. */
function medianBearing(values: number[]): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  const anchor = values[0];
  const rotated = values.map((v) => normalizeDelta(v - anchor));
  const m = median(rotated);
  if (m === null) return null;
  return ((anchor + m) % 360 + 360) % 360;
}

/**
 * Agree N records into one figure.
 *
 * Sources are compared call-by-call **by index**, which assumes they describe the same courses in
 * the same order. That is what `differingCallCounts` exists to surface: when a record splits a line
 * the others run through, the indices stop lining up and the reconciliation says so rather than
 * quietly pairing call 4 of one deed against call 5 of another.
 */
export function reconcileSurveys(
  sources: readonly ReconcileSource[],
  options: ReconcileOptions = {},
): Reconciliation {
  const bearingTolSec = options.bearingToleranceSeconds ?? DEFAULT_BEARING_TOL_SEC;
  const distanceTolFt = options.distanceToleranceFeet ?? DEFAULT_DISTANCE_TOL_FT;
  const sourceLabels = sources.map((s) => s.label);

  if (sources.length === 0) {
    return {
      calls: [], sourceLabels: [], differingCallCounts: [],
      consensusCalls: 0, disputedCalls: 0, singleSourceCalls: 0, fullyAgreed: false,
      summary: 'No records were supplied, so there is nothing to reconcile.',
    };
  }

  // The reconciled figure is as long as the LONGEST record. Truncating to the shortest would drop
  // courses that a record genuinely describes, which is a silent loss of boundary.
  const length = Math.max(...sources.map((s) => s.calls.length));
  const differingCallCounts = sources
    .filter((s) => s.calls.length !== length)
    .map((s) => ({ source: s.label, count: s.calls.length }));

  const calls: ReconciledCall[] = [];
  for (let i = 0; i < length; i++) {
    const bearings: Array<{ source: string; value: number }> = [];
    const distances: Array<{ source: string; value: number }> = [];

    for (const s of sources) {
      const call = s.calls[i];
      if (!call) continue;
      // A missing bearing is never read as 0 — that would invent a due-north call, the same refusal
      // S9a pins. `typeof` rather than truthiness, because 0 IS a real azimuth.
      if (typeof call.bearing === 'number' && Number.isFinite(call.bearing)) {
        const offset = s.basisOffsetDeg ?? 0;
        bearings.push({ source: s.label, value: ((call.bearing + offset) % 360 + 360) % 360 });
      }
      if (typeof call.distance === 'number' && Number.isFinite(call.distance)) {
        distances.push({ source: s.label, value: call.distance });
      }
    }

    const bSpread = bearingSpreadSeconds(bearings.map((b) => b.value));
    const dValues = distances.map((d) => d.value);
    const dSpread = dValues.length < 2 ? null : Math.max(...dValues) - Math.min(...dValues);

    const bearingAgreement: CallAgreement =
      bearings.length === 0 ? 'missing'
        : bearings.length === 1 ? 'single-source'
          : (bSpread ?? 0) <= bearingTolSec ? 'consensus' : 'disputed';
    const distanceAgreement: CallAgreement =
      distances.length === 0 ? 'missing'
        : distances.length === 1 ? 'single-source'
          : (dSpread ?? 0) <= distanceTolFt ? 'consensus' : 'disputed';

    const bearing = medianBearing(bearings.map((b) => b.value));
    const distance = dValues.length === 0 ? null : median(dValues);

    const parts: string[] = [];
    if (bearingAgreement === 'disputed') {
      parts.push(`bearing disputed across ${bearings.length} records (widest ${Math.round(bSpread ?? 0)}″)`);
    } else if (bearingAgreement === 'single-source') {
      parts.push(`bearing from ${bearings[0].source} only — uncorroborated`);
    } else if (bearingAgreement === 'missing') {
      parts.push('no record gives a bearing');
    }
    if (distanceAgreement === 'disputed') {
      parts.push(`distance disputed across ${distances.length} records (widest ${(dSpread ?? 0).toFixed(2)} ft)`);
    } else if (distanceAgreement === 'single-source') {
      parts.push(`distance from ${distances[0].source} only — uncorroborated`);
    } else if (distanceAgreement === 'missing') {
      parts.push('no record gives a distance');
    }

    calls.push({
      index: i,
      bearing,
      distance,
      bearingAgreement,
      distanceAgreement,
      bearings,
      distances,
      bearingSpreadSeconds: bSpread,
      distanceSpreadFeet: dSpread,
      note: parts.length === 0 ? 'All records agree.' : parts.join('; '),
    });
  }

  const isDisputed = (c: ReconciledCall) => c.bearingAgreement === 'disputed' || c.distanceAgreement === 'disputed';
  const isConsensus = (c: ReconciledCall) => c.bearingAgreement === 'consensus' && c.distanceAgreement === 'consensus';
  const isSingle = (c: ReconciledCall) =>
    !isDisputed(c) && (c.bearingAgreement === 'single-source' || c.distanceAgreement === 'single-source');

  const disputedCalls = calls.filter(isDisputed).length;
  const consensusCalls = calls.filter(isConsensus).length;
  const singleSourceCalls = calls.filter(isSingle).length;

  // `fullyAgreed` requires real corroboration: a figure every call of which came from ONE record is
  // not agreed, it is merely uncontradicted, and presenting it as agreed would be the exact
  // overstatement this module exists to prevent.
  const fullyAgreed = sources.length > 1
    && calls.length > 0
    && disputedCalls === 0
    && singleSourceCalls === 0
    && differingCallCounts.length === 0;

  const bits = [`${calls.length} course(s) from ${sources.length} record(s)`];
  if (disputedCalls > 0) bits.push(`${disputedCalls} disputed`);
  if (singleSourceCalls > 0) bits.push(`${singleSourceCalls} uncorroborated`);
  if (differingCallCounts.length > 0) {
    bits.push(`${differingCallCounts.length} record(s) describe a different number of courses`);
  }
  if (disputedCalls === 0 && singleSourceCalls === 0 && differingCallCounts.length === 0) {
    bits.push('every record agrees');
  }

  return {
    calls,
    sourceLabels,
    differingCallCounts,
    consensusCalls,
    disputedCalls,
    singleSourceCalls,
    fullyAgreed,
    summary: `${bits.join(' · ')}.`,
  };
}

/**
 * Walk the reconciled calls into corner coordinates, starting at the point of beginning `(0,0)`.
 *
 * Stops at the first call missing a bearing or a distance and reports how far it got, rather than
 * skipping it. Skipping a call does not leave a gap in the figure — it produces a **different,
 * closed-looking shape**, which is the S8a rule that a boundary drawn from 8 of 10 calls is not a
 * boundary with two gaps.
 */
export function pointsFromReconciled(calls: readonly ReconciledCall[]): {
  points: Array<{ x: number; y: number }>;
  usedCalls: number;
  stoppedAt: number | null;
  stoppedReason: string | null;
} {
  const points: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (c.bearing === null || c.distance === null) {
      return {
        points,
        usedCalls: i,
        stoppedAt: i,
        stoppedReason: c.bearing === null
          ? `course ${i + 1} has no bearing in any record`
          : `course ${i + 1} has no distance in any record`,
      };
    }
    // Surveying convention: azimuth clockwise from north, so north is +y and east is +x.
    const rad = (c.bearing * Math.PI) / 180;
    const last = points[points.length - 1];
    points.push({
      x: last.x + c.distance * Math.sin(rad),
      y: last.y + c.distance * Math.cos(rad),
    });
  }
  return { points, usedCalls: calls.length, stoppedAt: null, stoppedReason: null };
}
