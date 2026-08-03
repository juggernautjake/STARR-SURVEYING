// worker/src/services/closure-diagnosis.ts — the deed checking our reading of it.
//
// Closure is computed all over this codebase and reported as a number — `closure=1:21670` in a log,
// `closureRatio` in a manifest. Nothing has ever ASKED WHAT IT MEANS.
//
// It means a great deal, and it is the only check available on an OCR'd metes-and-bounds description
// that needs no second document, no field visit and no known answer. A boundary is a closed figure:
// walk the calls and you must arrive back where you started. If you do not, either the deed is wrong
// or **we read it wrong**, and the size and DIRECTION of the miss say which call to look at.
//
// ── WHAT THE DIRECTION OF THE MISS TELLS YOU ────────────────────────────────────────────────────
//
// This is standard traverse-adjustment practice, and it works because the two kinds of error displace
// the figure differently:
//
//   A DISTANCE misread on a course displaces the whole figure ALONG that course. So a misclosure
//   vector nearly PARALLEL to some course points at that course's length.
//
//   A BEARING misread on a course swings everything after it, displacing PERPENDICULAR to it. So a
//   misclosure nearly at right angles to a course points at that course's direction.
//
// For OCR that is unusually actionable, because the two failure modes look different in the source
// too: a distance is a number the model may transpose (`247.50` → `274.50`), while a bearing is a
// quadrant letter and three groups it may misread separately.
//
// ── AND THE CRUCIAL LIMIT ───────────────────────────────────────────────────────────────────────
//
// **A bad closure is not proof that we misread anything.** Old deeds close badly on their own —
// compass-and-chain work from the 1880s closing at 1:500 is normal and is a fact about the survey,
// not about our OCR. A 1990s deed closing at 1:500 is not.
//
// So this reports a SUSPICION with its reasoning and never a verdict, and it says out loud when the
// era of the document makes a poor closure unremarkable. Telling a surveyor we misread a deed that
// simply does not close would send them to re-read a document that is already correct.
//
// It also only works for ONE blunder. Two errors interact and the direction argument stops holding,
// which is stated rather than silently producing a confident wrong finger-point.

import { normaliseAzimuth, type Leg, type TraverseResult } from './survey-geometry.js';
// One set of closure numbers for the whole platform — see GOOD_CLOSURE below for why this import
// exists at all.
import { DEFAULT_CLOSURE_THRESHOLDS, READING_SUSPECT_RATIO } from '../lib/closure-tolerance.js';

/** Precision at or above which a description is reading cleanly.
 *
 *  Re-exported from `lib/closure-tolerance.ts` rather than declared here. That module opens by
 *  calling itself *"the single source of truth for 'is this closure acceptable?'"* and listing the
 *  modules that import from it — and it had **no importers at all**, which is how this file came to
 *  declare its own numbers in the first place and how `validation.ts` came to hold a third set
 *  inline. Three answers to one question, in a platform whose whole subject is boundaries.
 *
 *  A surveyor reading two of our screens should not be told two different things about the same
 *  closure. */
export const GOOD_CLOSURE = DEFAULT_CLOSURE_THRESHOLDS.excellent;
/** Below this, something is wrong with the description or with our reading of it. */
export const POOR_CLOSURE = READING_SUSPECT_RATIO;
/** Modern surveys are expected to beat this; older ones frequently do not. */
export const MODERN_ERA_YEAR = 1960;

export type ClosureQuality = 'excellent' | 'acceptable' | 'poor' | 'unusable' | 'unknown';

export interface SuspectCall {
  /** Index into the traverse's legs. */
  index: number;
  /** Which part of the call the geometry points at. */
  field: 'distance' | 'bearing';
  /** How well the misclosure lines up with this explanation, 0–1. */
  alignment: number;
  /** The correction that would close the figure, if this call is the culprit. */
  impliedCorrection: string;
  statement: string;
}

export interface ClosureDiagnosis {
  quality: ClosureQuality;
  precision: number | null;
  /** True when the closure is good enough that the reading is probably right. */
  readingLooksSound: boolean;
  /** Ranked explanations. Empty when closure is fine or when nothing lines up. */
  suspects: SuspectCall[];
  statement: string;
  nextStep: string;
}

export function classifyClosure(precision: number | null): ClosureQuality {
  if (precision === null) return 'unknown';
  if (precision >= GOOD_CLOSURE) return 'excellent';
  if (precision >= DEFAULT_CLOSURE_THRESHOLDS.acceptable) return 'acceptable';
  if (precision >= POOR_CLOSURE) return 'poor';
  return 'unusable';
}

/** Diagnose a traverse's closure as evidence about our READING of the document.
 *
 *  `recordedYear` is optional and changes the conclusion rather than decorating it: the same 1:800
 *  closure is unremarkable on an 1885 deed and alarming on a 2015 one. */
export function diagnoseClosure(t: TraverseResult, recordedYear?: number | null): ClosureDiagnosis {
  if (t.unusable.length > 0) {
    return {
      quality: 'unknown', precision: null, readingLooksSound: false, suspects: [],
      statement:
        `Closure cannot be used to check the reading: ${t.unusable.length} call(s) could not be placed at ` +
        `all, so the figure is incomplete and its misclosure measures our gap rather than our accuracy.`,
      nextStep: 'Re-read the unplaced calls first; closure becomes a usable check once every call is placed.',
    };
  }

  // A figure that closes EXACTLY has no misclosure to divide by, so `closurePrecision` is null — and
  // null otherwise means "unknown". Without this, a perfect closure (the strongest possible evidence
  // that every call was read correctly) is reported as no evidence at all.
  if (Number.isFinite(t.closureDistance) && t.closureDistance < 0.01 && t.perimeter > 0) {
    return {
      quality: 'excellent', precision: null, readingLooksSound: true, suspects: [],
      statement:
        `The description closes exactly (${t.closureDistance.toFixed(3)} ft over ${t.perimeter.toFixed(2)} ft). ` +
        `A figure closes that well only if every bearing and distance was read correctly — a single ` +
        `transposed digit would not survive it. That is real evidence the extraction is sound, from the ` +
        `document itself.`,
      nextStep: '',
    };
  }

  const precision = t.closurePrecision;
  const quality = classifyClosure(precision);

  if (quality === 'excellent' || quality === 'acceptable') {
    return {
      quality, precision, readingLooksSound: true, suspects: [],
      statement:
        `The description closes to about 1 in ${precision}. A figure closes that well only if every bearing ` +
        `and distance was read correctly — a single transposed digit would not survive it. That is real ` +
        `evidence the extraction is sound, from the document itself.`,
      nextStep: '',
    };
  }

  const old = typeof recordedYear === 'number' && recordedYear < MODERN_ERA_YEAR;
  const suspects = rankSuspects(t);

  const eraNote = old
    ? ` This deed is from ${recordedYear}, and compass-and-chain work of that era routinely closes at ` +
      `1:500–1:2000. A poor closure here is quite possibly the ORIGINAL SURVEY's, not ours — do not ` +
      `assume a misreading.`
    : typeof recordedYear === 'number'
      ? ` This deed is from ${recordedYear}, by which time a survey was expected to close far better than ` +
        `this, so a transcription or reading error is the more likely explanation.`
      : ' The recording date is unknown, which matters: a poor closure is normal on a 19th-century deed and ' +
        'not on a modern one, and without the date the two cannot be told apart.';

  const parts = [
    `The description closes to about 1 in ${precision ?? '?'} — ${quality === 'unusable' ? 'far worse than' : 'below'} ` +
      `what a correctly-read description gives.${eraNote}`,
  ];

  if (suspects.length > 0) {
    parts.push(`The misclosure's direction points at ${suspects[0]!.field === 'distance' ? 'a length' : 'a direction'}: ${suspects[0]!.statement}`);
    const tied = indistinguishableSuspects(suspects);
    if (tied.length > 1) {
      parts.push(
        `Calls ${tied.map((s) => s.index + 1).join(' and ')} explain it EQUALLY well — on a figure like this the ` +
          `geometry cannot tell them apart, so check all of them rather than trusting the order.`,
      );
    }
  } else {
    parts.push(
      'No single call explains the misclosure — its direction does not line up with any one course. That ' +
        'usually means more than one error, and the direction argument does not hold for two.',
    );
  }

  return {
    quality, precision, readingLooksSound: false, suspects,
    statement: parts.join(' '),
    nextStep: suspects.length > 0
      ? `Re-read call ${suspects[0]!.index + 1}'s ${suspects[0]!.field} against the document image before anything else.`
      : 'Re-read the whole description against the image; a single-call explanation does not fit.',
  };
}

/** Which call, if any, would explain the misclosure on its own.
 *
 *  A distance error displaces the figure ALONG its course; a bearing error displaces PERPENDICULAR to
 *  it. So the misclosure vector is compared against every course in both senses, and the best
 *  alignments are returned in order. */
export function rankSuspects(t: TraverseResult): SuspectCall[] {
  if (t.legs.length === 0 || !Number.isFinite(t.closureDistance) || t.closureDistance < 1e-9) return [];

  const first = t.points[0]!;
  const last = t.points[t.points.length - 1]!;
  // The correction that would close it: from the last point back to the first.
  const dn = first.n - last.n;
  const de = first.e - last.e;
  const missAz = normaliseAzimuth((Math.atan2(de, dn) * 180) / Math.PI);
  const missLen = t.closureDistance;

  const out: SuspectCall[] = [];

  for (const leg of t.legs) {
    let delta = Math.abs(normaliseAzimuth(missAz - leg.bearing.azimuthDeg));
    if (delta > 180) delta = 360 - delta;

    // Parallel (0° or 180°) ⇒ a distance error on this course.
    const parallelness = 1 - Math.min(delta, 180 - delta) / 90;
    // Perpendicular (90°) ⇒ a bearing error on this course.
    const perpendicularness = 1 - Math.abs(delta - 90) / 90;

    if (parallelness > 0.9) {
      const sign = delta < 90 ? '+' : '−';
      out.push({
        index: leg.index, field: 'distance', alignment: parallelness,
        impliedCorrection: `${sign}${missLen.toFixed(2)} ft on a stated ${leg.distance.toFixed(2)} ft`,
        statement:
          `the misclosure runs almost exactly along call ${leg.index + 1} (${leg.bearing.raw}), which is what a ` +
          `misread LENGTH does. Closing the figure would take ${sign}${missLen.toFixed(2)} ft on its stated ` +
          `${leg.distance.toFixed(2)} ft — check for a transposed digit.`,
      });
    } else if (perpendicularness > 0.9) {
      // A bearing error θ on a course of length L displaces ≈ L·θ.
      const impliedDeg = (missLen / Math.max(leg.distance, 1e-6)) * (180 / Math.PI);
      out.push({
        index: leg.index, field: 'bearing', alignment: perpendicularness,
        impliedCorrection: `${impliedDeg.toFixed(2)}° on ${leg.bearing.raw}`,
        statement:
          `the misclosure runs almost square to call ${leg.index + 1} (${leg.bearing.raw}), which is what a ` +
          `misread DIRECTION does. About ${impliedDeg.toFixed(2)}° would close it — check the quadrant letters ` +
          `and the degrees/minutes groups, which OCR reads separately.`,
      });
    }
  }

  // Ranked by how well each explanation fits, then preferring DISTANCE on a tie.
  //
  // Both can score 1.0 at once — on a rectangle an east-west misclosure is exactly parallel to two
  // courses and exactly perpendicular to the other two — so the tie is common rather than exotic.
  // Distance wins it because a distance is a single number the OCR may transpose, while a bearing is
  // a quadrant letter plus degree/minute/second groups it would have to misread in a way that
  // happens to stay a valid bearing. The simpler explanation is also the likelier one here.
  return out.sort((a, b) =>
    b.alignment - a.alignment ||
    (a.field === 'distance' ? -1 : 0) - (b.field === 'distance' ? -1 : 0));
}

/** Do several suspects explain the misclosure equally well?
 *
 *  On a rectangle, a length error on either east-west course produces an identical misclosure — the
 *  geometry cannot tell them apart, and pretending otherwise sends a reviewer to one of two documents
 *  with 50% odds. Saying "these two, and the geometry cannot choose" is worth more than a confident
 *  coin-flip. */
export function indistinguishableSuspects(suspects: SuspectCall[]): SuspectCall[] {
  if (suspects.length < 2) return [];
  const best = suspects[0]!;
  return suspects.filter((s) => s.field === best.field && Math.abs(s.alignment - best.alignment) < 0.01);
}
