// worker/src/services/golden-plat.ts — somewhere to put the answer when it arrives.
//
// Two items in the research plan have been blocked on the same thing since they were written:
//
//   Phase I / S8   whether the model reads a *marginal* 14 px bearing correctly or confidently wrong
//   R19            the located-vs-invented precision/recall measurement
//
// Both say "needs a plat whose answers are already known", and §4 item 0a calls it "the single
// highest-value thing on this list". Every piece of survey geometry in this platform is tested
// against SYNTHETIC figures, which proves the arithmetic and nothing whatever about the READING.
//
// And there was nowhere to put one. No fixture shape, no comparison, no report. That is the S-9
// lesson repeating: a blocker with no form behind it survives the decision — the owner could hand
// over a plat tomorrow and the measurement still would not exist. This is the form.
//
// ── WHY COMPARISON IS THE WHOLE PROBLEM ─────────────────────────────────────────────────────────
//
// `infra/canary.ts` already worked this out for adapter data and its reasoning transfers exactly:
// byte-equality fails every time a county reformats something, and an alarm that cries wolf is one
// nobody reads; too loose and it passes while the data drifts. So nothing here is compared as a
// string.
//
//   bearings    as ANGLES, within a tolerance in seconds. `N45°30'00"E`, `N 45-30-00 E` and
//               `N 45.5 E` are one bearing written three ways, and a harness that called those
//               three different answers would measure our formatting, not our reading.
//   distances   as measures, unit-normalised first — a call read correctly in varas and reported in
//               feet is a CORRECT reading, and comparing the numbers raw would score it wrong.
//   monuments   on kind AND status together, because FOUND vs SET is the distinction the whole of
//               boundary retracement rests on. A found rod scored as a match for a set one is the
//               single most expensive false pass this harness could produce.
//
// ── AND WHAT IT MUST REFUSE TO SAY ──────────────────────────────────────────────────────────────
//
// With no golden plats loaded, this reports **not measured**. Never 100%, never "passing". An empty
// denominator producing a perfect score is how a measurement becomes a reassurance, and the entire
// reason S8 is still open is that arithmetic cannot answer it — so a harness that answered it
// without data would be worse than the gap.

import { parseBearing } from './survey-geometry.js';
import { convertLength, type LengthUnit } from './survey-units.js';
import { parseMonument, type MonumentKind, type MonumentStatus } from './monuments.js';

/** How close a bearing must be to count as read correctly.
 *
 *  30 seconds — half a minute of arc. Tighter than any plausible OCR success and far looser than a
 *  misread digit: `N 45°30' E` misread as `N 45°80' E` is 30 minutes off, sixty times this. The
 *  tolerance exists for rounding in the golden record itself (a plat quoting whole minutes), not to
 *  forgive a misread. */
export const BEARING_TOLERANCE_SEC = 30;

/** Relative tolerance on a distance, plus an absolute floor for short calls. */
export const DISTANCE_TOLERANCE_REL = 0.001;   // 0.1%
export const DISTANCE_TOLERANCE_FT = 0.02;

/** One call as the plat actually reads, entered by a person who has the document in front of them. */
export interface GoldenCall {
  /** 0-based, in traverse order. */
  index: number;
  /** As written on the plat. Format does not matter — it is parsed, not compared. */
  bearing: string | null;
  distance: number | null;
  /** The unit the PLAT uses. Omitted means US survey feet. */
  unit?: LengthUnit;
  /** Monument text at the corner this call arrives at, verbatim. */
  monument?: string | null;
}

export interface GoldenPlat {
  /** Enough to find the document again — this is evidence, and evidence needs provenance. */
  source: { county: string; instrument: string; recordedYear?: number | null };
  /** Who entered the truth and when. A golden record nobody signed is an assertion, not a standard. */
  establishedBy: string;
  establishedAt: string;
  /** How the truth was established. "Read off the plat by an RPLS" and "typed from a CAD export"
   *  are different levels of authority and the report says which. */
  basis: 'read_from_document' | 'field_verified' | 'vendor_export';
  calls: GoldenCall[];
  notes?: string;
}

/** What the pipeline produced for the same document. */
export interface ExtractedCall {
  index: number;
  bearing: string | null;
  distance: number | null;
  unit?: LengthUnit;
  monument?: string | null;
}

export type FieldVerdict = 'correct' | 'wrong' | 'missing' | 'not_in_golden';

export interface CallComparison {
  index: number;
  bearing: { verdict: FieldVerdict; expected: string | null; got: string | null; deltaSec?: number };
  distance: { verdict: FieldVerdict; expected: number | null; got: number | null; deltaFt?: number };
  monument: {
    verdict: FieldVerdict;
    expected: { kind: MonumentKind; status: MonumentStatus } | null;
    got: { kind: MonumentKind; status: MonumentStatus } | null;
    /** True when kind matched but FOUND/SET did not — called out separately because it is the
     *  error that moves a boundary rather than mislabelling one. */
    statusConfused: boolean;
  };
}

export interface GoldenReport {
  measured: boolean;
  plats: number;
  calls: number;
  /** Of the values the plat states, how many did we read correctly? (recall) */
  readCorrectly: { bearings: number; distances: number; monuments: number };
  /** Of the values we produced, how many were right? (precision) — different question, and a
   *  pipeline that invents calls scores well on one and badly on the other. */
  produced: { bearings: number; distances: number; monuments: number };
  /** Monuments where the kind was right and FOUND/SET was not. Never folded into the totals. */
  statusConfusions: number;
  comparisons: CallComparison[];
  statement: string;
}

const SEC = 3600;

/** Angular difference in seconds, the short way round. */
export function bearingDeltaSec(a: string | null, b: string | null): number | null {
  const pa = parseBearing(a);
  const pb = parseBearing(b);
  if (!pa || !pb) return null;
  let d = Math.abs(pa.azimuthDeg - pb.azimuthDeg) % 360;
  if (d > 180) d = 360 - d;
  return d * SEC;
}

function toFeet(value: number, unit?: LengthUnit): number {
  return convertLength(value, unit ?? 'us_survey_feet', 'us_survey_feet').value;
}

function compareOne(golden: GoldenCall, got: ExtractedCall | undefined): CallComparison {
  // ── Bearing ──
  const bExpected = golden.bearing;
  const bGot = got?.bearing ?? null;
  let bearing: CallComparison['bearing'];
  if (bExpected === null) {
    bearing = { verdict: bGot === null ? 'correct' : 'not_in_golden', expected: null, got: bGot };
  } else if (bGot === null) {
    bearing = { verdict: 'missing', expected: bExpected, got: null };
  } else {
    const delta = bearingDeltaSec(bExpected, bGot);
    // A bearing we cannot parse is WRONG, not missing: we produced something and it is not a
    // bearing, which is a different failure from producing nothing.
    bearing = delta === null
      ? { verdict: 'wrong', expected: bExpected, got: bGot }
      : { verdict: delta <= BEARING_TOLERANCE_SEC ? 'correct' : 'wrong', expected: bExpected, got: bGot, deltaSec: delta };
  }

  // ── Distance ──
  const dExpected = golden.distance;
  const dGot = got?.distance ?? null;
  let distance: CallComparison['distance'];
  if (dExpected === null) {
    distance = { verdict: dGot === null ? 'correct' : 'not_in_golden', expected: null, got: dGot };
  } else if (dGot === null) {
    distance = { verdict: 'missing', expected: dExpected, got: null };
  } else {
    // Both normalised before comparing. A call read correctly in varas and reported in feet is a
    // CORRECT reading; comparing the raw numbers would score it as a 178% error.
    const ef = toFeet(dExpected, golden.unit);
    const gf = toFeet(dGot, got?.unit);
    const deltaFt = Math.abs(ef - gf);
    const tol = Math.max(DISTANCE_TOLERANCE_FT, ef * DISTANCE_TOLERANCE_REL);
    distance = { verdict: deltaFt <= tol ? 'correct' : 'wrong', expected: dExpected, got: dGot, deltaFt };
  }

  // ── Monument ──
  const mExpectedRaw = golden.monument ?? null;
  const mGotRaw = got?.monument ?? null;
  const me = parseMonument(mExpectedRaw);
  const mg = parseMonument(mGotRaw);
  const expected = me ? { kind: me.kind, status: me.status } : null;
  const gotMon = mg ? { kind: mg.kind, status: mg.status } : null;

  let verdict: FieldVerdict;
  let statusConfused = false;
  if (!expected) {
    verdict = gotMon ? 'not_in_golden' : 'correct';
  } else if (!gotMon) {
    verdict = 'missing';
  } else if (expected.kind === gotMon.kind && expected.status === gotMon.status) {
    verdict = 'correct';
  } else {
    verdict = 'wrong';
    statusConfused = expected.kind === gotMon.kind && expected.status !== gotMon.status;
  }

  return { index: golden.index, bearing, distance, monument: { verdict, expected, got: gotMon, statusConfused } };
}

/** Measure a pipeline's reading of one or more golden plats.
 *
 *  With no plats, this reports `measured: false` and says so — see the header. */
export function measureAgainstGolden(
  pairs: Array<{ golden: GoldenPlat; extracted: ExtractedCall[] }>,
): GoldenReport {
  if (pairs.length === 0) {
    return {
      measured: false, plats: 0, calls: 0,
      readCorrectly: { bearings: 0, distances: 0, monuments: 0 },
      produced: { bearings: 0, distances: 0, monuments: 0 },
      statusConfusions: 0, comparisons: [],
      statement:
        'NOT MEASURED — no golden plat has been supplied. This is not a score of zero and it is ' +
        'certainly not a pass: extraction accuracy against a real document has never been checked, ' +
        'and every survey figure in this platform is validated against synthetic geometry only, ' +
        'which proves the arithmetic and nothing about the reading.',
    };
  }

  const comparisons: CallComparison[] = [];
  for (const { golden, extracted } of pairs) {
    const byIndex = new Map(extracted.map((c) => [c.index, c]));
    for (const g of golden.calls) comparisons.push(compareOne(g, byIndex.get(g.index)));
  }

  const count = (
    pick: (c: CallComparison) => FieldVerdict,
    of: (v: FieldVerdict) => boolean,
  ) => comparisons.filter((c) => of(pick(c))).length;

  // Recall: of what the plat states, how much did we read? Precision: of what we produced, how much
  // was right? A pipeline that drops half the calls and gets the rest perfect scores 100% precision
  // and 50% recall, and reporting only the first would be flattering nonsense.
  const recallDenom = (pick: (c: CallComparison) => FieldVerdict) =>
    comparisons.filter((c) => pick(c) !== 'not_in_golden').length;
  const precisionDenom = (pick: (c: CallComparison) => FieldVerdict) =>
    comparisons.filter((c) => pick(c) !== 'missing').length;

  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

  const bV = (c: CallComparison) => c.bearing.verdict;
  const dV = (c: CallComparison) => c.distance.verdict;
  const mV = (c: CallComparison) => c.monument.verdict;

  const readCorrectly = {
    bearings: pct(count(bV, (v) => v === 'correct'), recallDenom(bV)),
    distances: pct(count(dV, (v) => v === 'correct'), recallDenom(dV)),
    monuments: pct(count(mV, (v) => v === 'correct'), recallDenom(mV)),
  };
  const produced = {
    bearings: pct(count(bV, (v) => v === 'correct'), precisionDenom(bV)),
    distances: pct(count(dV, (v) => v === 'correct'), precisionDenom(dV)),
    monuments: pct(count(mV, (v) => v === 'correct'), precisionDenom(mV)),
  };
  const statusConfusions = comparisons.filter((c) => c.monument.statusConfused).length;

  const parts = [
    `Measured against ${pairs.length} golden plat(s), ${comparisons.length} call(s): ` +
    `bearings ${readCorrectly.bearings}% read / ${produced.bearings}% correct when produced; ` +
    `distances ${readCorrectly.distances}% / ${produced.distances}%; ` +
    `monuments ${readCorrectly.monuments}% / ${produced.monuments}%.`,
  ];
  if (statusConfusions > 0) {
    parts.push(
      `${statusConfusions} monument(s) had the right kind and the WRONG found/set status. That is ` +
      `not a labelling slip — a found monument controls the corner and a set one is the previous ` +
      `surveyor's opinion, so confusing them moves a boundary. Counted separately and never folded ` +
      `into the totals above.`,
    );
  }
  const sources = pairs.map((p) => `${p.golden.source.county}/${p.golden.source.instrument} (${p.golden.basis})`);
  parts.push(`Sources: ${sources.join('; ')}.`);

  return {
    measured: true, plats: pairs.length, calls: comparisons.length,
    readCorrectly, produced, statusConfusions, comparisons,
    statement: parts.join(' '),
  };
}
