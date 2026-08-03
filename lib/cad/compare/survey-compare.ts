// lib/cad/compare/survey-compare.ts — CAD_AUDIT Slice S9a.
//
// Compare two surveys of the same parcel, call by call.
//
// ── THE ONE IDEA THIS FILE EXISTS FOR ───────────────────────────────────────────────────────────
// Two surveys of the same land, written forty years apart, will disagree about every single bearing
// — and usually agree perfectly. They are written on different BASES OF BEARINGS: one held magnetic
// north in 1952, one held grid north in 1998, one held a called line in an adjoining deed. A naive
// diff reports "18 discrepancies" and sends a surveyor out to chase eighteen problems that do not
// exist.
//
// So the comparison estimates the constant rotation between the two first, reports it as a BASIS
// DIFFERENCE rather than an error, and only then reports what is left. What is left is the real
// disagreement. This is the same insight `lib/research/rotation.service.ts` is built on — a rotation
// is a change of frame, not a discrepancy — applied to two records instead of a record and a field
// tie.
//
// ── WHY THE MEDIAN ──────────────────────────────────────────────────────────────────────────────
// The offset is the MEDIAN of the per-call bearing deltas, never the mean. One gross error — a
// transposed digit, a call misread by 10° — drags a mean far enough to turn every other call into a
// false discrepancy while hiding the real one. The median ignores it, which is the entire point: a
// robust estimator here is not a refinement, it is the difference between a useful report and a
// misleading one.
//
// ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────────────────────────
// It does not pair calls across surveys with different call counts and hope. It does not treat a
// missing bearing as zero. It does not silently truncate. Every call it could not compare is
// returned with a reason, because a comparison that quietly drops the hard half reads as agreement.

/** One call from a record, as a bearing azimuth in decimal degrees and a distance in feet. */
export interface CompareCall {
  /** Azimuth 0–360, clockwise from north. `null` when the record does not give one. */
  bearing: number | null;
  /** Distance in US survey feet. `null` when the record does not give one. */
  distance: number | null;
  /** Free text for the report, e.g. "THENCE N 45°30'15" E, 234.56 feet". */
  label?: string | null;
}

export interface CompareOptions {
  /** Residual bearing difference, in SECONDS, beyond which a call is flagged. Default 60" (1'). */
  bearingToleranceSeconds?: number;
  /** Distance difference, in feet, beyond which a call is flagged. Default 0.1 ft. */
  distanceToleranceFeet?: number;
}

export interface CallComparison {
  index: number;
  /** Raw bearing difference in degrees, before the basis offset is removed. */
  rawBearingDeltaDeg: number | null;
  /** Bearing difference AFTER removing the common basis offset — the real disagreement. */
  residualBearingDeltaDeg: number | null;
  residualBearingSeconds: number | null;
  distanceDeltaFeet: number | null;
  /** True when either tolerance is exceeded. */
  flagged: boolean;
  reason: string | null;
}

export interface SurveyComparison {
  /** Constant rotation between the two records, in degrees. Null when it could not be estimated. */
  basisOffsetDeg: number | null;
  /** Plain-language statement of what the offset means. Always populated. */
  basisStatement: string;
  /** True when the two traverses appear to run in opposite directions around the parcel. */
  reversed: boolean;
  comparisons: CallComparison[];
  /** Calls that could not be compared at all, and why. Never silently dropped. */
  uncomparable: Array<{ index: number; why: string }>;
  flaggedCount: number;
  /** Set when the two records do not even have the same number of calls. */
  countMismatch: { a: number; b: number } | null;
}

const SECONDS_PER_DEGREE = 3600;

/** Wrap a difference into (-180, 180]. Without this, 359° vs 1° reads as a 358° disagreement. */
export function normalizeDelta(deg: number): number {
  const d = ((deg + 180) % 360 + 360) % 360 - 180;
  // -180 and 180 are the same angle; prefer the positive so output is stable.
  return d === -180 ? 180 : d;
}

/** Median of a list. Returns null for an empty list rather than 0 — 0 is a meaningful offset. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function compareSurveys(
  a: CompareCall[],
  b: CompareCall[],
  opts: CompareOptions = {},
): SurveyComparison {
  const bearingTolSec = opts.bearingToleranceSeconds ?? 60;
  const distTolFt = opts.distanceToleranceFeet ?? 0.1;

  const uncomparable: Array<{ index: number; why: string }> = [];
  const countMismatch = a.length !== b.length ? { a: a.length, b: b.length } : null;

  // Compare the calls that exist in both. The surplus is REPORTED, not dropped — differing call
  // counts usually mean one record splits a line the other runs through, and that is exactly the
  // kind of thing the surveyor needs told rather than hidden.
  const n = Math.min(a.length, b.length);
  for (let i = n; i < Math.max(a.length, b.length); i++) {
    uncomparable.push({
      index: i,
      why: a.length > b.length
        ? 'present in the first survey only — the records describe a different number of courses'
        : 'present in the second survey only — the records describe a different number of courses',
    });
  }

  // ── Pass 1: raw deltas, which is all we can know before the basis is estimated ────────────────
  const rawDeltas: Array<number | null> = [];
  for (let i = 0; i < n; i++) {
    const ba = a[i].bearing;
    const bb = b[i].bearing;
    if (ba === null || bb === null) {
      // A null bearing is NOT zero. Treating it as one would invent a due-north call and poison the
      // median that every other call's residual depends on.
      rawDeltas.push(null);
      uncomparable.push({
        index: i,
        why: ba === null && bb === null
          ? 'neither record gives a bearing for this course'
          : `only ${ba === null ? 'the second' : 'the first'} record gives a bearing for this course`,
      });
      continue;
    }
    rawDeltas.push(normalizeDelta(bb - ba));
  }

  const usable = rawDeltas.filter((d): d is number => d !== null);

  // ── Reversal check, before the offset means anything ──────────────────────────────────────────
  // One deed written clockwise and the other counter-clockwise gives deltas clustered near ±180.
  // Averaging those produces nonsense, so it is detected and reported instead of computed through.
  const nearOneEighty = usable.filter((d) => Math.abs(d) > 150).length;
  const reversed = usable.length > 0 && nearOneEighty > usable.length / 2;

  const basisOffsetDeg = reversed ? null : median(usable);

  let basisStatement: string;
  if (reversed) {
    basisStatement =
      'The two records appear to run in OPPOSITE directions around the parcel — most courses differ '
      + 'by roughly 180°. Reverse one traverse before comparing; the bearings below are not '
      + 'meaningful until you do.';
  } else if (basisOffsetDeg === null) {
    basisStatement = 'No course could be compared, so no basis difference could be estimated.';
  } else if (Math.abs(basisOffsetDeg) * SECONDS_PER_DEGREE <= bearingTolSec) {
    basisStatement = 'The two records appear to share a basis of bearings.';
  } else {
    const dir = basisOffsetDeg > 0 ? 'clockwise' : 'counter-clockwise';
    basisStatement =
      `The second record is rotated ${Math.abs(basisOffsetDeg).toFixed(4)}° ${dir} from the first. `
      + 'That is a DIFFERENT BASIS OF BEARINGS, not an error — the differences below are what remain '
      + 'after removing it.';
  }

  // ── Pass 2: residuals ─────────────────────────────────────────────────────────────────────────
  const comparisons: CallComparison[] = [];
  let flaggedCount = 0;

  for (let i = 0; i < n; i++) {
    const raw = rawDeltas[i];
    const residual = raw === null || basisOffsetDeg === null
      ? null
      : normalizeDelta(raw - basisOffsetDeg);
    const residualSeconds = residual === null ? null : residual * SECONDS_PER_DEGREE;

    const da = a[i].distance;
    const db = b[i].distance;
    const distanceDelta = da === null || db === null ? null : db - da;
    if ((da === null || db === null) && !(a[i].bearing === null || b[i].bearing === null)) {
      uncomparable.push({
        index: i,
        why: da === null && db === null
          ? 'neither record gives a distance for this course'
          : `only ${da === null ? 'the second' : 'the first'} record gives a distance for this course`,
      });
    }

    const bearingBad = residualSeconds !== null && Math.abs(residualSeconds) > bearingTolSec;
    const distanceBad = distanceDelta !== null && Math.abs(distanceDelta) > distTolFt;
    const flagged = Boolean(bearingBad || distanceBad);
    if (flagged) flaggedCount++;

    comparisons.push({
      index: i,
      rawBearingDeltaDeg: raw,
      residualBearingDeltaDeg: residual,
      residualBearingSeconds: residualSeconds,
      distanceDeltaFeet: distanceDelta,
      flagged,
      reason: flagged
        ? [
          bearingBad ? `bearing differs by ${Math.round(residualSeconds as number)}" after basis` : null,
          distanceBad ? `distance differs by ${(distanceDelta as number).toFixed(2)} ft` : null,
        ].filter(Boolean).join('; ')
        : null,
    });
  }

  return {
    basisOffsetDeg,
    basisStatement,
    reversed,
    comparisons,
    uncomparable,
    flaggedCount,
    countMismatch,
  };
}
