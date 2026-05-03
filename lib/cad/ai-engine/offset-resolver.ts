// lib/cad/ai-engine/offset-resolver.ts
//
// Phase 6 §26 — Dynamic Offset Resolution. Detects offset
// shots in the imported point set + computes the true
// monument position before Stage 2 feature assembly.
//
// This first slice covers the two deterministic detection
// paths from spec §26.2:
//   * Code suffix:  `BC02_10R` → offset 10' to the right of
//     the bearing-line direction.
//   * Companion pair: pt 35 + pt 35off → 35off is the offset
//     shot; the displacement is the vector between them, but
//     since the spec leaves the reference bearing TBD for
//     pair shots we flag those as ambiguous when the pair
//     doesn't carry an explicit perp/bearing token in the
//     description.
//
// Description-text parsing + Claude-assisted field-note
// extraction land in follow-up slices (the Claude path needs
// the worker plumbing already shipped in the API route slice).
//
// Pure function: no I/O. Reuses Phase 4's bearing helpers.

import { generateId, type SurveyPoint } from '../types';

// ────────────────────────────────────────────────────────────
// Types (richer than the existing OffsetResolutionResult)
// ────────────────────────────────────────────────────────────

export type OffsetDirection =
  | { type: 'PERPENDICULAR_LEFT' }
  | { type: 'PERPENDICULAR_RIGHT' }
  | { type: 'INLINE_FORWARD' }
  | { type: 'INLINE_BACKWARD' }
  | { type: 'BEARING'; bearingAzimuth: number };

export type OffsetResolutionMethod =
  | 'SUFFIX'
  | 'DESCRIPTION'
  | 'FIELD_NOTES'
  | 'COMPANION_PAIR';

export interface OffsetShot {
  offsetPointId: string;
  truePointId: string | null;
  offsetDistance: number;
  offsetDirection: OffsetDirection;
  resolutionMethod: OffsetResolutionMethod;
  /** 0–100. Drives the §28 clarifying-question gate. */
  confidence: number;
  requiresUserConfirmation: boolean;
}

export interface OffsetResolutionDetail {
  resolvedShots: OffsetShot[];
  truePoints: SurveyPoint[];
  ambiguousShots: OffsetShot[];
  unresolvedPointIds: string[];
}

// ────────────────────────────────────────────────────────────
// Public API — synchronous (no Claude in this slice)
// ────────────────────────────────────────────────────────────

/**
 * Walk the input point set, detect deterministic offset shots
 * (suffix + companion-pair), compute the true positions, and
 * return both the resolved + ambiguous lists.
 */
export function resolveOffsetsSync(
  points: SurveyPoint[]
): OffsetResolutionDetail {
  const suffixHits = detectSuffixOffsets(points);
  const pairHits = detectCompanionPairs(points, suffixHits);
  const all = dedupe([...suffixHits, ...pairHits]);

  const truePoints: SurveyPoint[] = [];
  const ambiguous: OffsetShot[] = [];

  for (const shot of all) {
    const offsetPt = points.find((p) => p.id === shot.offsetPointId);
    if (!offsetPt) continue;
    const refBearing = computeReferenceBearing(offsetPt, points);
    if (
      refBearing === null &&
      shot.offsetDirection.type !== 'BEARING'
    ) {
      shot.requiresUserConfirmation = true;
      ambiguous.push(shot);
      continue;
    }
    const truePos = applyOffset(
      offsetPt,
      shot.offsetDistance,
      shot.offsetDirection,
      refBearing
    );
    const truePoint: SurveyPoint = {
      ...offsetPt,
      id: generateId(),
      pointName: offsetPt.pointName.replace(/off(set)?$/i, ''),
      easting: truePos.x,
      northing: truePos.y,
    };
    truePoints.push(truePoint);
    shot.truePointId = truePoint.id;
  }

  return {
    resolvedShots: all.filter((s) => !s.requiresUserConfirmation),
    truePoints,
    ambiguousShots: ambiguous,
    unresolvedPointIds: detectUnresolvedOffsetIndicators(points, all),
  };
}

// ────────────────────────────────────────────────────────────
// Detection — suffix
// ────────────────────────────────────────────────────────────

/**
 * Detect `_<distance><direction>` suffix in the raw code, e.g.
 * `BC02_10R` → 10' right; `BC02_5.5L` → 5.5' left;
 * `BC02_10F` / `_10B` → forward / backward inline.
 */
export function detectSuffixOffsets(
  points: SurveyPoint[]
): OffsetShot[] {
  const hits: OffsetShot[] = [];
  const re = /_(\d+\.?\d*)\s*([LR]T?|FWD?|BCK?|F|B|L|R)$/i;
  for (const pt of points) {
    const code = pt.rawCode ?? '';
    const m = code.match(re);
    if (!m) continue;
    const dist = Number.parseFloat(m[1]);
    if (!Number.isFinite(dist) || dist <= 0) continue;
    const dirToken = m[2].toUpperCase();
    const dir = parseDirectionToken(dirToken);
    if (!dir) continue;
    hits.push({
      offsetPointId: pt.id,
      truePointId: null,
      offsetDistance: dist,
      offsetDirection: dir,
      resolutionMethod: 'SUFFIX',
      confidence: 95,
      requiresUserConfirmation: false,
    });
  }
  return hits;
}

// ────────────────────────────────────────────────────────────
// Detection — companion pair
// ────────────────────────────────────────────────────────────

/**
 * Detect &ldquo;pt N + pt Noff&rdquo; pairs where the offset
 * companion's name ends in `off` / `offset` / `OFF`. Pairs the
 * companion is the offset shot; we flag for user confirmation
 * because we can&apos;t determine direction (left/right) from
 * the names alone — needs a description hint or field-notes
 * entry to disambiguate.
 *
 * Skipped when the offset point is already covered by a
 * suffix hit (`existingHits` set) so we don't double-emit.
 */
export function detectCompanionPairs(
  points: SurveyPoint[],
  existingHits: OffsetShot[]
): OffsetShot[] {
  const covered = new Set(existingHits.map((h) => h.offsetPointId));
  const hits: OffsetShot[] = [];
  // Build a base-name → ids index.
  const byBase = new Map<string, string[]>();
  for (const pt of points) {
    const name = (pt.pointName ?? '').toLowerCase().trim();
    if (!name) continue;
    const base = name.replace(/off(set)?$/i, '').trim();
    if (!base || base === name) continue; // not an offset companion
    const list = byBase.get(base) ?? [];
    list.push(pt.id);
    byBase.set(base, list);
  }

  for (const pt of points) {
    const name = (pt.pointName ?? '').toLowerCase().trim();
    if (!/(off|offset)$/i.test(name)) continue;
    if (covered.has(pt.id)) continue;
    hits.push({
      offsetPointId: pt.id,
      truePointId: null,
      // Distance + direction unknown for pair-only shots; the
      // applyOffset path below will mark ambiguous when no
      // bearing exists.
      offsetDistance: 0,
      offsetDirection: { type: 'PERPENDICULAR_RIGHT' },
      resolutionMethod: 'COMPANION_PAIR',
      confidence: 50,
      requiresUserConfirmation: true,
    });
  }
  return hits;
}

// ────────────────────────────────────────────────────────────
// Detection — points that LOOK offset but couldn&apos;t be
// parsed (for the §28 clarifying-question queue)
// ────────────────────────────────────────────────────────────

export function detectUnresolvedOffsetIndicators(
  points: SurveyPoint[],
  resolved: OffsetShot[]
): string[] {
  const resolvedIds = new Set(resolved.map((s) => s.offsetPointId));
  const out: string[] = [];
  const re = /\boff(set)?\b/i;
  for (const pt of points) {
    if (resolvedIds.has(pt.id)) continue;
    const code = pt.rawCode ?? '';
    const desc = pt.description ?? '';
    const name = pt.pointName ?? '';
    if (re.test(code) || re.test(desc) || re.test(name)) {
      out.push(pt.id);
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Apply offset
// ────────────────────────────────────────────────────────────

/**
 * Apply an offset to a shot point given a reference bearing
 * (the survey line the offset is measured from). Returns the
 * computed true position.
 */
export function applyOffset(
  pt: SurveyPoint,
  distance: number,
  direction: OffsetDirection,
  referenceBearing: number | null
): { x: number; y: number } {
  if (direction.type === 'BEARING') {
    return applyBearingDistance(pt, distance, direction.bearingAzimuth);
  }
  if (referenceBearing === null) {
    // Caller should have flagged ambiguous before reaching
    // this branch; defensive: return identity so we don't
    // produce garbage coordinates.
    return { x: pt.easting, y: pt.northing };
  }
  switch (direction.type) {
    case 'PERPENDICULAR_LEFT':
      return applyBearingDistance(
        pt,
        distance,
        (referenceBearing - 90 + 360) % 360
      );
    case 'PERPENDICULAR_RIGHT':
      return applyBearingDistance(
        pt,
        distance,
        (referenceBearing + 90) % 360
      );
    case 'INLINE_FORWARD':
      return applyBearingDistance(pt, distance, referenceBearing);
    case 'INLINE_BACKWARD':
      return applyBearingDistance(
        pt,
        distance,
        (referenceBearing + 180) % 360
      );
  }
}

function applyBearingDistance(
  pt: SurveyPoint,
  dist: number,
  azimuth: number
): { x: number; y: number } {
  const rad = (azimuth * Math.PI) / 180;
  return {
    x: pt.easting + dist * Math.sin(rad),
    y: pt.northing + dist * Math.cos(rad),
  };
}

// ────────────────────────────────────────────────────────────
// Reference bearing
// ────────────────────────────────────────────────────────────

/**
 * Estimate the reference bearing for an offset shot: azimuth
 * of the segment running through the nearest two non-offset
 * boundary points. Returns null when too few neighbours exist
 * to form a segment — the caller flags those ambiguous.
 */
function computeReferenceBearing(
  offsetPt: SurveyPoint,
  allPoints: SurveyPoint[]
): number | null {
  const neighbours = allPoints
    .filter((p) => p.id !== offsetPt.id)
    .filter((p) => !/(off|offset)$/i.test(p.pointName ?? ''))
    .map((p) => ({
      pt: p,
      d: Math.hypot(
        p.easting - offsetPt.easting,
        p.northing - offsetPt.northing
      ),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2);
  if (neighbours.length < 2) return null;
  const [a, b] = neighbours;
  const dx = b.pt.easting - a.pt.easting;
  const dy = b.pt.northing - a.pt.northing;
  if (dx === 0 && dy === 0) return null;
  let az = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (az < 0) az += 360;
  return az;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function parseDirectionToken(token: string): OffsetDirection | null {
  switch (token) {
    case 'L':
    case 'LT':
    case 'LEFT':
      return { type: 'PERPENDICULAR_LEFT' };
    case 'R':
    case 'RT':
    case 'RIGHT':
      return { type: 'PERPENDICULAR_RIGHT' };
    case 'F':
    case 'FWD':
      return { type: 'INLINE_FORWARD' };
    case 'B':
    case 'BCK':
      return { type: 'INLINE_BACKWARD' };
    default:
      return null;
  }
}

function dedupe(shots: OffsetShot[]): OffsetShot[] {
  // Higher-confidence resolution methods win when the same
  // offset point shows up via multiple detectors. Order:
  // SUFFIX > DESCRIPTION > FIELD_NOTES > COMPANION_PAIR.
  const order: Record<OffsetResolutionMethod, number> = {
    SUFFIX: 4,
    DESCRIPTION: 3,
    FIELD_NOTES: 2,
    COMPANION_PAIR: 1,
  };
  const byId = new Map<string, OffsetShot>();
  for (const s of shots) {
    const prev = byId.get(s.offsetPointId);
    if (
      !prev ||
      order[s.resolutionMethod] > order[prev.resolutionMethod]
    ) {
      byId.set(s.offsetPointId, s);
    }
  }
  return Array.from(byId.values());
}
