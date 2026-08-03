// worker/src/services/survey-reading.ts — the bridge, and the reason Phase I existed at all.
//
// Phase I built nine slices of survey geometry: bearings and traverse (S0), monuments (S1),
// corner-to-corner inverses (S2), units incl. varas (S3), rotation onto the grid (S4), curves (S5),
// the drawing (S6), and closure as evidence about our reading (S9). Each shipped with tests. NONE OF
// THEM HAD A SINGLE PRODUCTION CALLER — every import of every one of those modules came from another
// module in the same folder, or from its own test file. The whole stack was an island.
//
// So the owner's actual ask — *"we need to extract everything of significance from every file we
// pull"* — was not being served by any of it. A document processed by this platform got the same
// treatment it got before Phase I started. The slices were real; the connection was missing.
//
// This is that connection. It takes what the extraction pipeline already produces
// (`ExtractedBoundaryData`, the shape Stage 3 writes) and runs the survey stack over it, once, at
// Stage 4 — where a boundary has just been read and has not yet been reported on.
//
// ── THE TWO PLACES THIS BRIDGE CAN LIE ──────────────────────────────────────────────────────────
//
// A bridge between two type systems is where meaning quietly changes, and there are exactly two
// spots here where it could:
//
//   1. **`'feet'` is not a unit.** The pipeline's `BoundaryCall` says `unit: 'feet'`; the survey
//      stack distinguishes `us_survey_feet` from `international_feet`, which differ in the 7th
//      figure. In a Texas land description bare "feet" means the US survey foot — that is the foot
//      the Texas State Plane zones are defined in — so that is the mapping, and it is written down
//      here rather than left to whoever reads the code next.
//
//   2. **A curve with no chord stops the traverse.** The traverse walks chords, because the chord is
//      the straight line between the two corners a crew actually occupies. A curve call that recites
//      radius and delta but no chord would be UNUSABLE — and one unusable call makes every corner
//      after it unplaced, which discards the whole figure over a value that is derivable. So the
//      chord is derived (chord = 2R·sin(Δ/2), bearing = inbound ± Δ/2 by direction) and every
//      derived call is listed in `derivedChords`, because a corner positioned from a value we
//      computed is not the same evidence as one the deed recited.
//
// Everything else is a straight pass-through. Where a value cannot be produced, it is reported as
// absent rather than defaulted — the failure mode this repo has hit most often is an unknown
// rendered as an answer.

import {
  traverse, inverse, parseBearing, normaliseAzimuth, azimuthToBearing,
  type TraverseInput, type TraverseResult, type Point,
} from './survey-geometry.js';
import { parseMonument, summariseMonuments, type Monument, type MonumentSummary } from './monuments.js';
import { checkCurve, checkTangency, type CurveCheck } from './curve-check.js';
import { diagnoseClosure, type ClosureDiagnosis } from './closure-diagnosis.js';
import { drawBoundary, type DrawingResult } from './survey-drawing.js';
import { convertLength, unitLabel, type LengthUnit } from './survey-units.js';
import type { BoundaryCall, DocumentResult, ExtractedBoundaryData } from '../types/index.js';

/** The recorded year to judge a closure by — but only when the run cannot be wrong about it.
 *
 *  `diagnoseClosure` uses the year to decide whether a poor closure is the ORIGINAL survey's or
 *  ours, and it changes the conclusion completely: 1:800 is unremarkable on an 1885 compass-and-chain
 *  survey and alarming on a 2015 one. So the year has to be the year of the document THE CALLS CAME
 *  FROM, and the extraction does not record which document that was — `ExtractedBoundaryData` carries
 *  no source attribution.
 *
 *  Picking the oldest document in the bundle would excuse a real OCR error whenever an 1890 deed
 *  happened to be retrieved alongside a 2015 replat; picking the newest would accuse the platform of
 *  misreading a description that simply never closed. Both are worse than the honest answer, which
 *  `diagnoseClosure` already handles: with no year it says the date is unknown and that the two cases
 *  cannot be told apart.
 *
 *  So this returns a year only when every dated document in the run agrees on one, and null
 *  otherwise. Narrow on purpose. */
export function unambiguousRecordedYear(docs: Pick<DocumentResult, 'ref'>[]): number | null {
  const years = new Set<number>();
  for (const d of docs) {
    const raw = d.ref?.recordingDate;
    if (!raw) continue;
    const m = /\b(1[6-9]\d{2}|20\d{2})\b/.exec(raw);
    if (m) years.add(Number(m[1]));
  }
  return years.size === 1 ? [...years][0]! : null;
}

/** A monument, and where it is relative to the others.
 *
 *  This is S2's answer to *"where boundary markers are in relation to each other exactly"*. A deed
 *  only ever describes CONSECUTIVE corners; the distance from the rod in hand to the one three
 *  corners away is not written anywhere, and is what a crew needs to know before walking. */
export interface LocatedMonument {
  /** The call whose `toPoint` described it. */
  callIndex: number;
  monument: Monument;
  /** Local plane coordinates, in US survey feet, relative to the point of beginning at (0,0). */
  at: Point;
}

export interface MonumentPair {
  fromCallIndex: number;
  toCallIndex: number;
  bearing: string;
  azimuthDeg: number;
  /** US survey feet. */
  distance: number;
  statement: string;
}

export interface DerivedChord {
  callIndex: number;
  /** Which parts had to be computed for the corner to be placed at all. */
  derived: Array<'chordDistance' | 'chordBearing'>;
  statement: string;
}

export interface SurveyReading {
  /** Null when the description is not a traversable one (lot-and-block, reference-only). */
  traverse: TraverseResult | null;
  closure: ClosureDiagnosis | null;
  monuments: Monument[];
  monumentSummary: MonumentSummary;
  /** Monuments placed on the figure. Shorter than `monuments` when corners could not be placed. */
  located: LocatedMonument[];
  /** Every pair of located monuments, both ways round the figure. */
  pairs: MonumentPair[];
  curves: Array<{ callIndex: number; check: CurveCheck; tangency: string | null }>;
  derivedChords: DerivedChord[];
  /** Units the deed actually recites, and what they are in US survey feet. */
  unitsUsed: Array<{ unit: LengthUnit; label: string; calls: number; inFeet: string }>;
  drawing: DrawingResult | null;
  /** One paragraph a surveyor can read without opening anything else. */
  statement: string;
  /** Why no traverse, when there is none. Never silently empty. */
  notTraversable: string | null;
}

/** Bare "feet" in a Texas land description means the US SURVEY foot.
 *
 *  Not a stylistic choice: the Texas State Plane zones are defined in US survey feet, and a
 *  description read in international feet drifts about 0.01 ft per mile against the grid it will be
 *  compared to. The pipeline's extraction type cannot express the difference, so the assumption is
 *  made once, here, in the open. */
const UNIT_MAP: Record<NonNullable<BoundaryCall['distance']>['unit'], LengthUnit> = {
  feet: 'us_survey_feet',
  varas: 'varas',
  chains: 'chains',
  meters: 'meters',
  rods: 'rods',
  links: 'links',
};

/** Chord length of a circular curve: 2R·sin(Δ/2). */
export function chordFromRadiusDelta(radius: number, deltaDeg: number): number {
  return 2 * radius * Math.sin((deltaDeg * Math.PI) / 360);
}

/** Chord bearing from the bearing entering the curve.
 *
 *  The chord deflects from the inbound tangent by HALF the central angle — right for a curve to the
 *  right, left for one to the left. Getting the sign backwards puts the next corner on the wrong
 *  side of the line by twice the offset, so the direction is required rather than assumed. */
export function chordBearingFromTangent(
  inboundAzimuthDeg: number, deltaDeg: number, direction: 'left' | 'right',
): number {
  const half = deltaDeg / 2;
  return normaliseAzimuth(inboundAzimuthDeg + (direction === 'right' ? half : -half));
}

/** Turn one extracted call into something the traverse can walk.
 *
 *  Returns the input plus a note when a chord had to be derived. `inboundAzimuth` is the azimuth of
 *  the previous leg, needed only for a curve whose chord bearing is missing. */
function toTraverseInput(
  call: BoundaryCall, inboundAzimuthDeg: number | null,
): { input: TraverseInput; derived: DerivedChord | null } {
  const unit = call.distance ? UNIT_MAP[call.distance.unit] : undefined;

  if (!call.curve) {
    return {
      input: {
        bearing: call.bearing?.raw ?? null,
        distance: call.distance?.value ?? null,
        toPoint: call.toPoint,
        unit,
      },
      derived: null,
    };
  }

  const c = call.curve;
  const derivedParts: DerivedChord['derived'] = [];

  let chordDistance = c.chordDistance?.value ?? null;
  if (chordDistance == null && c.radius?.value && c.delta?.decimalDegrees) {
    chordDistance = chordFromRadiusDelta(c.radius.value, c.delta.decimalDegrees);
    derivedParts.push('chordDistance');
  }

  let chordBearing = c.chordBearing?.raw ?? null;
  if (chordBearing == null && inboundAzimuthDeg != null && c.delta?.decimalDegrees && c.direction) {
    chordBearing = azimuthToBearing(
      chordBearingFromTangent(inboundAzimuthDeg, c.delta.decimalDegrees, c.direction),
    );
    derivedParts.push('chordBearing');
  }

  const derived: DerivedChord | null = derivedParts.length
    ? {
        callIndex: call.sequence,
        derived: derivedParts,
        statement:
          `Call ${call.sequence} is a curve whose ${derivedParts.join(' and ')} the record does not ` +
          `state. ${derivedParts.includes('chordDistance') ? 'The chord was computed as 2R·sin(Δ/2)' : ''}` +
          `${derivedParts.length === 2 ? ', and ' : ''}` +
          `${derivedParts.includes('chordBearing') ? 'the chord bearing from the inbound tangent deflected by Δ/2' : ''}` +
          `. The corner after it is positioned from a value WE computed, not one the deed recites — ` +
          `if the record's radius or delta is misread, this corner moves and nothing else flags it.`,
      }
    : null;

  return {
    input: {
      bearing: null,
      distance: null,
      toPoint: call.toPoint,
      chordBearing,
      chordDistance,
      unit: c.chordDistance || c.radius ? (unit ?? 'us_survey_feet') : unit,
    },
    derived,
  };
}

/** Read a boundary as a survey: geometry, monuments, curves, closure, and a drawing.
 *
 *  `recordedYear` changes what a poor closure MEANS and is passed through rather than ignored. */
export function readSurvey(
  data: ExtractedBoundaryData | null,
  opts: { recordedYear?: number | null; title?: string } = {},
): SurveyReading {
  const empty = (why: string): SurveyReading => ({
    traverse: null, closure: null, monuments: [], monumentSummary: summariseMonuments([]),
    located: [], pairs: [], curves: [], derivedChords: [], unitsUsed: [], drawing: null,
    statement: why, notTraversable: why,
  });

  if (!data) return empty('No boundary description was extracted, so there is nothing to read as a survey.');
  if (data.calls.length === 0) {
    return empty(
      `The description is ${data.type.replace(/_/g, ' ')} and recites no courses, so there is no ` +
      `traverse to walk. A lot-and-block description locates a property by reference to a recorded ` +
      `plat; the geometry lives on that plat, which has to be retrieved separately.`,
    );
  }

  // ── Monuments, from the text the calls already carried ────────────────────────────────────────
  // These come from `toPoint`, which travelled the whole platform as a string before S1.
  const parsed = data.calls.map((c) => ({ call: c, monument: parseMonument(c.toPoint) }));
  const monuments = parsed.map((p) => p.monument).filter((m): m is Monument => m !== null);
  const monumentSummary = summariseMonuments(monuments);

  // ── The traverse ──────────────────────────────────────────────────────────────────────────────
  const inputs: TraverseInput[] = [];
  const derivedChords: DerivedChord[] = [];
  let inboundAzimuth: number | null = null;

  for (const call of data.calls) {
    const { input, derived } = toTraverseInput(call, inboundAzimuth);
    inputs.push(input);
    if (derived) derivedChords.push(derived);
    // The next curve's tangent is this call's direction — the chord's, when this call was a curve.
    const b = parseBearing(input.bearing ?? input.chordBearing ?? null);
    if (b) inboundAzimuth = b.azimuthDeg;
  }

  const t = traverse(inputs);
  const closure = diagnoseClosure(t, opts.recordedYear ?? null);

  // ── Curves, checked against themselves ────────────────────────────────────────────────────────
  const curves: SurveyReading['curves'] = [];
  data.calls.forEach((call, i) => {
    if (!call.curve) return;
    const prev = i > 0 ? data.calls[i - 1] : undefined;
    const inboundBearing = prev?.bearing?.raw ?? prev?.curve?.chordBearing?.raw ?? null;
    const input = {
      radius: call.curve.radius?.value ?? null,
      deltaDeg: call.curve.delta?.decimalDegrees ?? null,
      arcLength: call.curve.arcLength?.value ?? null,
      chordDistance: call.curve.chordDistance?.value ?? null,
      chordBearing: call.curve.chordBearing?.raw ?? null,
      direction: call.curve.direction ?? null,
      inboundBearing,
    };
    curves.push({ callIndex: call.sequence, check: checkCurve(input), tangency: checkTangency(input) });
  });

  // ── Where the monuments are, relative to each other (S2) ──────────────────────────────────────
  //
  // A leg's `to` point is the corner the call ARRIVES at, which is the corner its `toPoint` text
  // describes. Legs whose call was unusable are absent, so a monument on an unplaced corner is
  // simply not located rather than being attached to the wrong point.
  const legByIndex = new Map(t.legs.map((l) => [l.index, l]));
  const located: LocatedMonument[] = [];
  parsed.forEach((p) => {
    if (!p.monument) return;
    const leg = legByIndex.get(p.call.sequence);
    if (!leg) return;
    located.push({ callIndex: p.call.sequence, monument: p.monument, at: leg.to });
  });

  const pairs: MonumentPair[] = [];
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length; j++) {
      const a = located[i]!;
      const b = located[j]!;
      const inv = inverse(a.at, b.at);
      pairs.push({
        fromCallIndex: a.callIndex, toCallIndex: b.callIndex,
        bearing: inv.bearing, azimuthDeg: inv.azimuthDeg, distance: inv.distance,
        statement:
          `From the ${a.monument.kind.replace(/_/g, ' ')} at call ${a.callIndex + 1} to the ` +
          `${b.monument.kind.replace(/_/g, ' ')} at call ${b.callIndex + 1}: ${inv.bearing}, ` +
          `${inv.distance.toFixed(2)} ft. This is computed from the record's own courses — the deed ` +
          `never states it, because a deed only describes consecutive corners.`,
      });
    }
  }

  // ── Units the deed recites ────────────────────────────────────────────────────────────────────
  const unitCounts = new Map<LengthUnit, number>();
  for (const leg of t.legs) unitCounts.set(leg.unit, (unitCounts.get(leg.unit) ?? 0) + 1);
  const unitsUsed = [...unitCounts.entries()].map(([unit, calls]) => ({
    unit, calls, label: unitLabel(unit),
    inFeet: `1 ${unitLabel(unit)} = ${convertLength(1, unit, 'us_survey_feet').value.toFixed(6)} US survey ft`,
  }));

  const drawing = drawBoundary(t, {
    title: opts.title,
    recordedYear: opts.recordedYear ?? null,
  });

  // ── One paragraph ─────────────────────────────────────────────────────────────────────────────
  const parts: string[] = [t.statement, closure.statement];
  if (monuments.length > 0) parts.push(monumentSummary.statement);
  if (located.length < monuments.length) {
    parts.push(
      `${monuments.length - located.length} of ${monuments.length} monuments could not be placed on ` +
      `the figure, because the calls that describe them could not be walked. They are still listed, ` +
      `but their positions relative to the others are NOT known.`,
    );
  }
  const badCurves = curves.filter((c) => c.check.verdict === 'inconsistent');
  if (badCurves.length > 0) {
    parts.push(`${badCurves.length} curve(s) do not check out against their own stated values: ` +
      badCurves.map((c) => `call ${c.callIndex + 1}`).join(', ') + '.');
  }
  if (derivedChords.length > 0) {
    parts.push(`${derivedChords.length} corner(s) are positioned from a chord WE derived rather than ` +
      `one the record states.`);
  }
  const nonFeet = unitsUsed.filter((u) => u.unit !== 'us_survey_feet');
  if (nonFeet.length > 0) {
    parts.push(`The description recites ${nonFeet.map((u) => u.label).join(' and ')}; every distance ` +
      `above is converted to US survey feet (${nonFeet.map((u) => u.inFeet).join('; ')}).`);
  }

  return {
    traverse: t, closure, monuments, monumentSummary, located, pairs, curves, derivedChords,
    unitsUsed, drawing, statement: parts.join(' '), notTraversable: null,
  };
}
