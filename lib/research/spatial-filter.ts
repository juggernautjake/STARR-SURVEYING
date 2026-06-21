// lib/research/spatial-filter.ts
//
// §10.5 (spatial result filtering) + §10.6 (disambiguation surfacing)
// of docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// When a portal returns many parcels (e.g. a street-name search → 30
// hits) we rank by proximity/identity to the subject anchor and
// pursue only the subject + true adjoiners; everything else is
// dropped BEFORE any expensive deep AI analysis. Saves both cost and
// boundary-poisoning.
//
// When multiple candidates plausibly match the subject with similar
// strength, we surface the disambiguation choice to the user instead
// of guessing silently (§10.6). The user's pick strengthens the
// anchor for the rest of the project.
//
// Pure — composes slices 3 (relevance classifier), 4 (deed-call
// adjoiners), and 5 (GIS adjacency). No DB, no network.

import type {
  CanonicalProperty,
  RelevanceClassification,
  RelevanceContext,
} from './canonical-schema';
import { unwrap } from './canonical-schema';
import { arePolygonsAdjacent, type GeoJsonPolygonish } from './gis-adjacency';
import {
  candidateFromRecord,
  classifyRelevance,
  haversineMeters,
  resolveSubjectAnchors,
} from './relevance';

// ── §10.5 Spatial filtering ──────────────────────────────────────

/** One candidate scored against the subject's relevance context. */
export interface RankedCandidate {
  record: CanonicalProperty;
  classification: RelevanceClassification;
  /** 0..1 — composite score combining classifier confidence with
   *  proximity to the subject (when geometry is available). 1 =
   *  certainly the subject, 0 = certainly irrelevant. */
  score: number;
  /** When the candidate has geometry + the subject has a geometry
   *  anchor or centroid, this is the boundary-to-boundary distance
   *  in metres. `undefined` when geometry isn't available on one
   *  side or the other. */
  proximity_meters?: number;
}

export interface RankAndFilterOptions {
  /** Cap the output at N records. Useful for downstream cost
   *  control — the §10.4 two-pass extractor pays per token. */
  limit?: number;
  /** Drop candidates whose final score is below this floor.
   *  Default 0.05 (everything tagged `unrelated` falls below). */
  scoreFloor?: number;
}

/** Pure. Rank a candidate list by relevance to the subject, drop
 *  everything below the score floor, sort high-to-low. Subject
 *  matches come first, then adjoiners (parcel_id-anchored above
 *  owner-anchored above legal-only), then anything unknown the
 *  caller might still want to look at, then the floor cuts the
 *  unrelated parcels out. */
export function rankAndFilterCandidates(
  candidates: CanonicalProperty[],
  context: RelevanceContext,
  opts: RankAndFilterOptions = {},
): RankedCandidate[] {
  const floor = opts.scoreFloor ?? 0.05;
  const subjectGeom = pickSubjectGeometry(context);
  const subjectCentroid = context.subject.centroid_lonlat;

  const ranked: RankedCandidate[] = [];
  for (const rec of candidates) {
    const cand = candidateFromRecord(rec);
    const classification = classifyRelevance(cand, context);

    const proximity = computeProximity(rec, subjectGeom, subjectCentroid, cand.centroid_lonlat);
    const score = compositeScore(classification, proximity);
    if (score < floor) continue;

    ranked.push({
      record: { ...rec, relevance: classification.tag },
      classification,
      score,
      proximity_meters: proximity,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return opts.limit ? ranked.slice(0, opts.limit) : ranked;
}

// ── §10.6 Disambiguation ─────────────────────────────────────────

export interface DisambiguationResult {
  /** When the answer is clear ("one candidate clearly beats the
   *  rest"), `chosen` is that candidate. When the answer is
   *  ambiguous, `chosen` is null and `candidates` holds the
   *  tied/close candidates for the UI to surface. */
  chosen: RankedCandidate | null;
  /** Sorted, top-first. Always populated even when chosen is set
   *  (so the UI can show "we picked X over Y, Z"). */
  candidates: RankedCandidate[];
  /** Human-readable reason for the §10.6 dashboard hover-detail. */
  reason: string;
}

export interface DisambiguateOptions {
  /** Score gap above which the leader is considered unambiguous.
   *  Default 0.15 — if the runner-up is within 15 percentage points
   *  of the leader, surface both. */
  ambiguityGap?: number;
  /** Lower bound on the leader's absolute score below which we
   *  refuse to auto-pick. Default 0.6. */
  minimumLeaderScore?: number;
  /** Cap the surfaced candidates at N. Default 5. */
  maxCandidates?: number;
}

/** Pure. Decide whether the highest-scoring candidate is clearly
 *  the subject (auto-pick) or whether we need the user's call. */
export function disambiguateSubject(
  ranked: RankedCandidate[],
  opts: DisambiguateOptions = {},
): DisambiguationResult {
  const gap = opts.ambiguityGap ?? 0.15;
  const minScore = opts.minimumLeaderScore ?? 0.6;
  const max = opts.maxCandidates ?? 5;

  // Only `subject` and `unknown`-tagged candidates are eligible to
  // BE the subject. Adjoiners are surrounding parcels, not the
  // target.
  const eligible = ranked.filter(
    (r) => r.classification.tag === 'subject' || r.classification.tag === 'unknown',
  );

  if (eligible.length === 0) {
    return {
      chosen: null,
      candidates: [],
      reason: 'no candidate matched the subject anchor — caller should surface manual entry',
    };
  }

  const leader = eligible[0]!;
  const runner = eligible[1];
  const trimmed = eligible.slice(0, max);

  if (leader.score < minScore) {
    return {
      chosen: null,
      candidates: trimmed,
      reason: `leader score ${fmt(leader.score)} is below the ${fmt(minScore)} auto-pick floor`,
    };
  }

  if (runner && leader.score - runner.score < gap) {
    return {
      chosen: null,
      candidates: trimmed,
      reason: `runner-up within ${fmt(gap)} of leader (${fmt(leader.score)} vs ${fmt(runner.score)})`,
    };
  }

  return {
    chosen: leader,
    candidates: trimmed,
    reason: runner
      ? `leader ${fmt(leader.score)} > runner-up ${fmt(runner.score)} by ≥ ${fmt(gap)}`
      : `single clear match at ${fmt(leader.score)}`,
  };
}

// ── Internals ────────────────────────────────────────────────────

function pickSubjectGeometry(ctx: RelevanceContext): GeoJsonPolygonish | undefined {
  // RelevanceContext.subject doesn't carry a polygon today (that's
  // a future schema extension); only the centroid. This helper is
  // a forward-compat hook so the caller can pass geometry through
  // an `extras` map once the schema grows.
  const extras = (ctx.subject as unknown as { geometry?: GeoJsonPolygonish }).geometry;
  return extras ?? undefined;
}

function computeProximity(
  rec: CanonicalProperty,
  subjectGeom: GeoJsonPolygonish | undefined,
  subjectCentroid: [number, number] | undefined,
  candidateCentroid: [number, number] | undefined,
): number | undefined {
  // Prefer polygon-to-polygon when we have both shapes.
  const candGeom = unwrap(rec.geometry)?.geojson as GeoJsonPolygonish | undefined;
  if (subjectGeom && candGeom) {
    const adj = arePolygonsAdjacent(subjectGeom, candGeom);
    return adj.minBoundaryDistanceMeters === Infinity ? undefined : adj.minBoundaryDistanceMeters;
  }
  // Fallback: centroid-to-centroid haversine. Good enough for
  // ranking; not for the same-parcel test.
  if (subjectCentroid && candidateCentroid) {
    return haversineMeters(subjectCentroid, candidateCentroid);
  }
  return undefined;
}

function compositeScore(
  classification: RelevanceClassification,
  proximity?: number,
): number {
  // Base — the classifier's own confidence with a tag weight.
  const tagWeight: Record<RelevanceClassification['tag'], number> = {
    subject:   1.0,
    adjoiner:  0.7,
    unknown:   0.3,
    unrelated: 0,
  };
  let s = classification.confidence * tagWeight[classification.tag];

  // Proximity bonus — anything within 50 m of the subject is
  // strongly weighted (this is the spatial signal §10.5 calls out).
  // Falls off linearly to 0 at 500 m so distant noise doesn't drag
  // the ranking.
  if (proximity !== undefined) {
    const bonus = proximity <= 50 ? 0.15 : proximity >= 500 ? 0 : 0.15 * (1 - (proximity - 50) / 450);
    s += bonus;
  }

  return Math.max(0, Math.min(1, s));
}

function fmt(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Convenience wrapper that captures the full §10.5 + §10.6 flow:
 *  rank, surface disambiguation if needed, return both pieces so
 *  the route handler can either continue or pause for user input. */
export function rankAndDisambiguate(
  candidates: CanonicalProperty[],
  context: RelevanceContext,
  filterOpts: RankAndFilterOptions = {},
  disambigOpts: DisambiguateOptions = {},
): { ranked: RankedCandidate[]; disambiguation: DisambiguationResult } {
  // Resolve anchors once so the caller can see what we matched
  // against (useful for the disambiguation UI's hover detail).
  resolveSubjectAnchors(context.subject);
  const ranked = rankAndFilterCandidates(candidates, context, filterOpts);
  const disambiguation = disambiguateSubject(ranked, disambigOpts);
  return { ranked, disambiguation };
}
