// lib/cad/import/from-survey-reading.ts — CAD_AUDIT Slice S8a.
//
// The join between the two halves of this platform. The research worker reads a deed or plat and
// produces a `SurveyReading`: a walked traverse with a coordinate per corner, the monuments it found,
// the watercourses/roads/easements the sheet also shows, and a confidence per finding. Until now
// nothing in CAD could consume any of it — a surveyor re-typed the calls by hand into a drawing the
// research side had already computed.
//
// ── THIS FILE IS PURE, AND STRUCTURALLY TYPED ON PURPOSE ────────────────────────────────────────
// It does NOT import from `worker/`. The two projects have separate tsconfigs and separate builds,
// and a cross-project type import is how the production build breaks while every test stays green —
// which has happened here three times (see `resolve.extensionAlias` in next.config.js). The input is
// declared as the shape it needs, so the worker's real `SurveyReading` satisfies it structurally and
// neither build learns about the other.
//
// ── THE HONESTY RULES, WHICH ARE THE WHOLE DESIGN ───────────────────────────────────────────────
// The research platform's own rule is that an unknown is never rendered as an answer, and a drawing
// is the easiest place in the entire product to break that — a closed polygon looks authoritative no
// matter what it was built from. So:
//
//   1. **Unusable calls are reported, never silently dropped.** `TraverseResult.unusable` exists
//      precisely because the worker refuses to skip a call quietly. A boundary drawn from 8 of 10
//      calls is not a boundary with two gaps; it is a different shape that looks complete. If any
//      call was unusable the result is NOT closed as a POLYGON — it comes back as an open POLYLINE,
//      because an open figure is visibly incomplete and a closed one is not.
//   2. **Coordinates are RELATIVE and say so.** The worker starts every traverse at (0,0) and states
//      that putting it on the state plane needs a measured tie. This carries `relative: true` and a
//      note on every feature, so nothing downstream can mistake a record sketch for a located survey.
//   3. **Confidence rides along.** Per-finding confidence is attached to the features it produced,
//      so a low-confidence call is still a low-confidence line after it becomes geometry.
//   4. **Monuments that could not be placed are counted, not invented.** `located` is documented as
//      shorter than `monuments` when a corner could not be placed; the difference is reported.

import type { Feature, FeatureGeometry, Point2D } from '../types';

// ── The input shape, declared structurally ──────────────────────────────────────────────────────

export interface ReadingPoint { x: number; y: number; }

export interface ReadingTraverse {
  points: ReadingPoint[];
  unusable: Array<{ index: number; reason: string }>;
  closureDistance?: number;
  closurePrecision?: number | null;
  perimeter?: number;
}

export interface ReadingMonument {
  /** Where it sits in the same relative frame as the traverse. Absent when it could not be placed. */
  x?: number;
  y?: number;
  label?: string | null;
  /** FOUND controls a corner; SET is an opinion. Kept because the distinction is load-bearing. */
  status?: string | null;
}

export interface ReadingFeature {
  kind: string;
  label?: string | null;
  widthFeet?: number | null;
}

export interface SurveyReadingLike {
  traverse: ReadingTraverse | null;
  located?: ReadingMonument[];
  monuments?: unknown[];
  features?: ReadingFeature[];
  confidence?: { score?: number; band?: string } | null;
}

// ── Output ──────────────────────────────────────────────────────────────────────────────────────

export interface DrawFromReadingResult {
  features: Feature[];
  /** Everything the drawing could NOT represent. Never empty-by-omission: if the reading carried
   *  something we did not draw, it is named here. */
  notDrawn: Array<{ what: string; why: string }>;
  /** True when every call was usable and the figure was closed as a polygon. */
  closed: boolean;
  /** Surfaced verbatim for the UI, so the drawing can state its own provenance. */
  relative: true;
  confidence: { score: number | null; band: string | null };
}

const LAYER_BOUNDARY = 'RESEARCH_BOUNDARY';
const LAYER_MONUMENTS = 'RESEARCH_MONUMENTS';

let seq = 0;
/** Deterministic within a call, which keeps snapshots stable; `Date.now()` would not. */
const nextId = (prefix: string) => `${prefix}-${++seq}`;

/** Reset the id counter. Test-only — ids are per-process and a shared counter makes assertions
 *  depend on test order. */
export function __resetIds(): void { seq = 0; }

function baseStyle(): Feature['style'] {
  // Deliberately minimal: the caller's layer styling should win. Inventing colours here would make
  // a research import look different from the rest of the drawing for no reason.
  return {} as Feature['style'];
}

function makeFeature(
  type: Feature['type'],
  geometry: FeatureGeometry,
  layerId: string,
  properties: Record<string, unknown>,
): Feature {
  return {
    id: nextId(type.toLowerCase()),
    type,
    geometry,
    layerId,
    style: baseStyle(),
    properties,
  } as Feature;
}

/**
 * Turn a research `SurveyReading` into CAD features.
 *
 * Returns what it drew AND what it could not — the second is the point. A caller that ignores
 * `notDrawn` will present an incomplete figure as a complete one, so it is a required field rather
 * than an optional diagnostic.
 */
export function featuresFromSurveyReading(reading: SurveyReadingLike): DrawFromReadingResult {
  const features: Feature[] = [];
  const notDrawn: Array<{ what: string; why: string }> = [];

  const confidence = {
    score: reading.confidence?.score ?? null,
    band: reading.confidence?.band ?? null,
  };

  const traverse = reading.traverse;
  if (!traverse || traverse.points.length < 2) {
    // A lot-and-block or reference-only description is not traversable, and the worker says so by
    // setting `traverse: null`. That is not an error and must not become an empty drawing that
    // implies we found nothing.
    notDrawn.push({
      what: 'boundary',
      why: traverse
        ? 'the traverse has fewer than two corners'
        : 'the description is not traversable (lot-and-block or reference-only)',
    });
    return { features, notDrawn, closed: false, relative: true, confidence };
  }

  const unusable = traverse.unusable ?? [];
  const vertices: Point2D[] = traverse.points.map((p) => ({ x: p.x, y: p.y }));

  // RULE 1. A closed polygon is the most authoritative-looking thing a drawing can contain, so it is
  // only produced when every call was usable. With gaps the figure stays an open POLYLINE — visibly
  // incomplete, which is the honest rendering of an incomplete record.
  const closed = unusable.length === 0;
  for (const u of unusable) {
    notDrawn.push({ what: `call ${u.index}`, why: u.reason });
  }

  features.push(makeFeature(
    closed ? 'POLYGON' : 'POLYLINE',
    { type: closed ? 'POLYGON' : 'POLYLINE', vertices } as FeatureGeometry,
    LAYER_BOUNDARY,
    {
      source: 'research',
      // RULE 2 — stated on the feature itself, not just in a report someone may not read.
      relative: true,
      positionNote: 'Relative to the point of beginning at (0,0). Not tied to the state plane.',
      closed,
      unusableCalls: unusable.length,
      closureDistance: traverse.closureDistance ?? null,
      closurePrecision: traverse.closurePrecision ?? null,
      // RULE 3.
      confidenceScore: confidence.score,
      confidenceBand: confidence.band,
    },
  ));

  // RULE 4. `located` is documented as shorter than `monuments` when a corner could not be placed.
  const located = reading.located ?? [];
  const placeable = located.filter((m) => typeof m.x === 'number' && typeof m.y === 'number');
  for (const m of placeable) {
    features.push(makeFeature(
      'POINT',
      { type: 'POINT', point: { x: m.x as number, y: m.y as number } } as FeatureGeometry,
      LAYER_MONUMENTS,
      {
        source: 'research',
        relative: true,
        label: m.label ?? null,
        // FOUND controls the corner; SET is an opinion. Losing this in the import would erase the
        // single most important distinction on a monument.
        monumentStatus: m.status ?? null,
      },
    ));
  }

  const totalMonuments = Array.isArray(reading.monuments) ? reading.monuments.length : located.length;
  if (totalMonuments > placeable.length) {
    notDrawn.push({
      what: `${totalMonuments - placeable.length} monument(s)`,
      why: 'recited in the document but could not be placed on the figure',
    });
  }

  // Watercourses, roads, rights of way and easements. The reading records THAT they exist and their
  // width, not where they run — placing them would be invention, so they are reported as not drawn
  // rather than guessed at. This is the difference between "we know there is an easement" and "here
  // is the easement", and only the first is true.
  for (const f of reading.features ?? []) {
    notDrawn.push({
      what: f.label ? `${f.kind} (${f.label})` : f.kind,
      why: 'recorded on the document, but the reading carries no located geometry for it',
    });
  }

  return { features, notDrawn, closed, relative: true, confidence };
}
