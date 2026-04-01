// lib/cad/ai-engine/stage-2-assemble.ts
// Stage 2 of the AI Drawing Engine pipeline: Feature Assembly.
//
// Takes the ClassificationResult[] from Stage 1 and the PointGroup map from
// the Phase 2 import pipeline, then:
//   1. Selects the "final" point from every group  (SET > FOUND > latest CALC > NONE)
//   2. Builds line strings via the Phase 2 auto-connect engine
//   3. Runs arc detection (Kasa algebraic circle fit on consecutive A-suffix runs)
//   4. Routes each line string to POLYLINE / POLYGON / ARC / SPLINE / MIXED_GEOMETRY
//   5. Creates POINT features for point-only codes
//   6. Detects unclosed boundaries

import type {
  Feature,
  SurveyPoint,
  LineString,
  FeatureStyle,
  FeatureGeometry,
  Point2D,
  PointGroup,
} from '../types';
import { generateId } from '../types';
import { buildLineStrings } from '../codes/auto-connect';
import type { ClassificationResult, FeatureAssemblyResult, AssemblyWarning, ArcDefinition } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Layer ID used for AI-assembled features before the user assigns layers. */
const AI_DEFAULT_LAYER = '0';

/** Minimum points required for a Kasa circle fit to be meaningful. */
const MIN_ARC_POINTS = 3;

/** Boundary codes that should trigger an "unclosed boundary" warning. */
const BOUNDARY_CODES = new Set(['PL01', 'PL06', '350', '355']);

/** Default gap in feet below which a nearly-closed boundary triggers a warning. */
const CLOSE_GAP_THRESHOLD_FT = 1.0;

// ── Default style helpers ─────────────────────────────────────────────────────

function defaultStyle(): FeatureStyle {
  return {
    color:          null,   // inherit from layer / code cascade
    lineWeight:     null,
    opacity:        1,
    lineTypeId:     null,
    symbolId:       null,
    symbolSize:     null,
    symbolRotation: 0,
    labelVisible:   null,
    labelFormat:    null,
    labelOffset:    { x: 0, y: 0 },
    isOverride:     false,
  };
}

// ── Kasa algebraic circle fit ─────────────────────────────────────────────────

/**
 * Fit a circle to an array of 2D points using the Kasa algebraic method
 * (numerically robust, O(n) once sums are computed).
 *
 * Returns null if fitting is degenerate (collinear points or too few points).
 */
function kasaCircleFit(points: Point2D[]): ArcDefinition | null {
  const n = points.length;
  if (n < MIN_ARC_POINTS) return null;

  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  let sxxx = 0, syyy = 0, sxxy = 0, sxyy = 0;

  for (const p of points) {
    sx += p.x;      sy += p.y;
    sxx += p.x * p.x;  syy += p.y * p.y;  sxy += p.x * p.y;
    sxxx += p.x ** 3;  syyy += p.y ** 3;
    sxxy += p.x * p.x * p.y;  sxyy += p.x * p.y * p.y;
  }

  const A = n * sxx - sx * sx;
  const B = n * sxy - sx * sy;
  const C = n * syy - sy * sy;
  const D = 0.5 * (n * sxxx + n * sxyy - sx * sxx - sx * syy);
  const E = 0.5 * (n * sxxy + n * syyy - sy * sxx - sy * syy);

  const denom = A * C - B * B;
  if (Math.abs(denom) < 1e-10) return null; // degenerate

  const cx = (D * C - B * E) / denom;
  const cy = (A * E - B * D) / denom;
  const radius = Math.sqrt(
    cx * cx + cy * cy + (sxx + syy) / n - (2 * cx * sx + 2 * cy * sy) / n,
  );

  if (!isFinite(radius) || radius <= 0) return null;

  const startAngle = Math.atan2(points[0].y - cy, points[0].x - cx);
  const endAngle   = Math.atan2(points[n - 1].y - cy, points[n - 1].x - cx);

  // Determine sweep direction via cross product of first two radii
  const mid = points[Math.floor(n / 2)];
  const cross =
    (points[0].x - cx) * (mid.y - cy) - (points[0].y - cy) * (mid.x - cx);
  const direction: 'CW' | 'CCW' = cross > 0 ? 'CCW' : 'CW';

  return {
    center:     { x: cx, y: cy },
    radius,
    startAngle,
    endAngle,
    direction,
    pc:  points[0],
    pt:  points[n - 1],
    mpc: mid,
    pi:  { x: cx, y: cy }, // PI is approximated as center; full tangent-intersection computation is in the curve editor
  };
}

// ── Arc-run detection ─────────────────────────────────────────────────────────

/**
 * Find runs of consecutive arc-suffix (A / BA / EA / CA) points within a
 * line string.  Returns arrays of point IDs for each run.
 */
function findArcRuns(ls: LineString, classified: ClassificationResult[]): string[][] {
  const runs: string[][] = [];
  let currentRun: string[] = [];

  for (const pid of ls.pointIds) {
    const cp = classified.find((c) => c.point.id === pid);
    const isArc = cp?.isArcPoint ?? false;
    if (isArc) {
      currentRun.push(pid);
    } else {
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
    }
  }
  if (currentRun.length > 0) runs.push(currentRun);
  return runs;
}

// ── Feature builders ──────────────────────────────────────────────────────────

function buildPointFeature(cp: ClassificationResult): Feature {
  return {
    id:       generateId(),
    type:     'POINT',
    layerId:  cp.resolvedCode?.defaultLayerId ?? AI_DEFAULT_LAYER,
    style:    defaultStyle(),
    properties: {
      pointNumber: cp.point.pointNumber,
      pointName:   cp.point.pointName,
      rawCode:     cp.point.rawCode,
      // Store the originating point ID for AI confidence scoring & review queue
      aiPointIds:  cp.point.id,
    },
    geometry: {
      type:  'POINT',
      point: { x: cp.point.easting, y: cp.point.northing },
    } satisfies FeatureGeometry,
  };
}

function buildPolylineFeature(ls: LineString, finals: ClassificationResult[]): Feature {
  const vertices = ls.pointIds
    .map((id) => finals.find((c) => c.point.id === id))
    .filter((c): c is ClassificationResult => c !== undefined)
    .map((c): Point2D => ({ x: c.point.easting, y: c.point.northing }));

  return {
    id:       generateId(),
    type:     ls.isClosed ? 'POLYGON' : 'POLYLINE',
    layerId:  AI_DEFAULT_LAYER,
    style:    defaultStyle(),
    properties: {
      codeBase:   ls.codeBase,
      // Store originating point IDs (JSON-serialised array) for AI scoring
      aiPointIds: ls.pointIds.join(','),
    },
    geometry: {
      type:     ls.isClosed ? 'POLYGON' : 'POLYLINE',
      vertices,
    } satisfies FeatureGeometry,
  };
}

function buildArcFeature(arc: ArcDefinition, pointIds: string[]): Feature {
  return {
    id:       generateId(),
    type:     'ARC',
    layerId:  AI_DEFAULT_LAYER,
    style:    defaultStyle(),
    properties: {
      radius:    Math.round(arc.radius * 100) / 100,
      direction: arc.direction,
      fitted:    true,
    },
    geometry: {
      type: 'ARC',
      arc: {
        center:        arc.center,
        radius:        arc.radius,
        startAngle:    arc.startAngle,
        endAngle:      arc.endAngle,
        anticlockwise: arc.direction === 'CCW',
      },
    } satisfies FeatureGeometry,
  };
}

function buildMixedGeometryFeature(ls: LineString, finals: ClassificationResult[]): Feature {
  // Represent mixed-geometry (arcs interspersed with straights) as POLYLINE
  // with metadata.  The Phase 6 drawing editor will render it using its mixed-
  // geometry engine once the user refines it.
  return {
    ...buildPolylineFeature(ls, finals),
    id:   generateId(),
    type: 'MIXED_GEOMETRY',
    geometry: {
      ...buildPolylineFeature(ls, finals).geometry,
      type: 'MIXED_GEOMETRY',
    },
    properties: { codeBase: ls.codeBase, hasCurveSegments: true },
  };
}

function buildSplineFeature(ls: LineString, finals: ClassificationResult[]): Feature {
  const pts = ls.pointIds
    .map((id) => finals.find((c) => c.point.id === id))
    .filter((c): c is ClassificationResult => c !== undefined)
    .map((c): Point2D => ({ x: c.point.easting, y: c.point.northing }));

  // Convert to cubic bezier control points (Catmull-Rom → Bezier conversion)
  const controlPoints: Point2D[] = [];
  if (pts.length >= 2) {
    // First segment: P0, P0→P1 tangent quarter-way, P1←P2 tangent quarter-way, P1
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];

      if (i === 0) controlPoints.push(p1);
      // Catmull-Rom control points
      const cp1: Point2D = {
        x: p1.x + (p2.x - p0.x) / 6,
        y: p1.y + (p2.y - p0.y) / 6,
      };
      const cp2: Point2D = {
        x: p2.x - (p3.x - p1.x) / 6,
        y: p2.y - (p3.y - p1.y) / 6,
      };
      controlPoints.push(cp1, cp2, p2);
    }
  }

  return {
    id:       generateId(),
    type:     'SPLINE',
    layerId:  AI_DEFAULT_LAYER,
    style:    defaultStyle(),
    properties: { codeBase: ls.codeBase, pointCount: pts.length },
    geometry: {
      type:   'SPLINE',
      spline: { controlPoints, isClosed: ls.isClosed },
    } satisfies FeatureGeometry,
  };
}

// ── selectFinalPoints ─────────────────────────────────────────────────────────

/**
 * From each point group keep only the group's `finalPoint`; include all
 * ungrouped points unchanged.
 *
 * Group priority: SET > FOUND > latest CALC > NONE (resolved in Phase 2).
 */
function selectFinalPoints(
  classified: ClassificationResult[],
  pointGroups: Map<number, PointGroup>,
): ClassificationResult[] {
  // Build set of final-point IDs from all groups
  const finalIds = new Set<string>();
  for (const group of pointGroups.values()) {
    if (group.finalPoint) finalIds.add(group.finalPoint.id);
  }

  return classified.filter((c) => {
    const group = pointGroups.get(c.point.parsedName.baseNumber);
    if (!group) return true;          // ungrouped — include as-is
    return finalIds.has(c.point.id);  // grouped — include only if final
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Assemble drawing features from classified points.
 *
 * @param classified  Output of `classifyPoints()` (Stage 1).
 * @param pointGroups Output of `groupPointsByBaseName()` (Phase 2).
 * @returns           All geometry features ready for confidence scoring.
 */
export function assembleFeatures(
  classified: ClassificationResult[],
  pointGroups: Map<number, PointGroup>,
): FeatureAssemblyResult {
  const result: FeatureAssemblyResult = {
    lineStrings:           [],
    pointFeatures:         [],
    closedPolygons:        [],
    curveFeatures:         [],
    splineFeatures:        [],
    mixedGeometryFeatures: [],
    orphanedPoints:        [],
    warnings:              [],
    stats: {
      totalPoints:            classified.length,
      pointFeaturesCreated:   0,
      lineStringsBuilt:       0,
      closedPolygonsDetected: 0,
      arcsFound:              0,
      splinesBuilt:           0,
      mixedGeometryCount:     0,
      orphanedPointCount:     0,
      warningCount:           0,
    },
  };

  // ── Step 1: Select final points from each group ──
  const finals = selectFinalPoints(classified, pointGroups);

  // ── Step 2: Build line strings from B/E suffixes (Phase 2 engine) ──
  const lineStrings = buildLineStrings(finals.map((c) => c.point));

  // Mark which points already belong to a line string
  const assignedPointIds = new Set<string>();
  for (const ls of lineStrings) {
    for (const pid of ls.pointIds) assignedPointIds.add(pid);
  }

  // ── Step 3: Route each line string to the appropriate geometry type ──
  for (const ls of lineStrings) {
    const hasArcSegments = ls.segments.some((s) => s === 'ARC');
    const isAutoSpline   = finals.some(
      (c) => ls.pointIds.includes(c.point.id) && c.isAutoSplinePoint,
    );

    if (isAutoSpline && ls.pointIds.length >= 3) {
      result.splineFeatures.push(buildSplineFeature(ls, finals));
      result.stats.splinesBuilt++;
    } else if (hasArcSegments) {
      result.mixedGeometryFeatures.push(buildMixedGeometryFeature(ls, finals));
      result.stats.mixedGeometryCount++;
    } else if (ls.isClosed) {
      result.closedPolygons.push(buildPolylineFeature(ls, finals));
      result.stats.closedPolygonsDetected++;
    } else {
      result.lineStrings.push(ls);
      result.stats.lineStringsBuilt++;
    }
  }

  // ── Step 4: Point-only codes → POINT features ──
  for (const cp of finals) {
    if (cp.resolvedCode?.connectType === 'POINT') {
      result.pointFeatures.push(buildPointFeature(cp));
      result.stats.pointFeaturesCreated++;
    }
  }

  // ── Step 5: Detect unclosed boundaries ──
  for (const ls of result.lineStrings) {
    if (ls.pointIds.length >= 3 && BOUNDARY_CODES.has(ls.codeBase)) {
      const firstCp = finals.find((c) => c.point.id === ls.pointIds[0]);
      const lastCp  = finals.find((c) => c.point.id === ls.pointIds[ls.pointIds.length - 1]);
      if (firstCp && lastCp) {
        const gap = Math.sqrt(
          (firstCp.point.easting  - lastCp.point.easting)  ** 2 +
          (firstCp.point.northing - lastCp.point.northing) ** 2,
        );
        if (gap < CLOSE_GAP_THRESHOLD_FT) {
          result.warnings.push({
            type:     'UNCLOSED_BOUNDARY',
            pointIds: ls.pointIds,
            message:  `Boundary line string gap is ${gap.toFixed(3)}' — should this be closed?`,
            severity: 'WARNING',
          });
        }
      }
    }
  }

  // ── Step 6: Arc fitting — consecutive A-suffix point runs → Kasa fit ──
  for (const ls of lineStrings) {
    const arcRuns = findArcRuns(ls, classified);
    for (const run of arcRuns) {
      if (run.length < MIN_ARC_POINTS) {
        result.warnings.push({
          type:     'ARC_INSUFFICIENT_POINTS',
          pointIds: run,
          message:  `Only ${run.length} arc point(s) — need at least ${MIN_ARC_POINTS} for circle fit`,
          severity: 'WARNING',
        });
        continue;
      }

      const pts = run
        .map((id) => finals.find((c) => c.point.id === id))
        .filter((c): c is ClassificationResult => c !== undefined)
        .map((c): Point2D => ({ x: c.point.easting, y: c.point.northing }));

      const arc = kasaCircleFit(pts);
      if (arc) {
        result.curveFeatures.push(buildArcFeature(arc, run));
        result.stats.arcsFound++;
      } else {
        result.warnings.push({
          type:     'ARC_INSUFFICIENT_POINTS',
          pointIds: run,
          message:  'Kasa circle fit returned no result — points may be collinear',
          severity: 'WARNING',
        });
      }
    }
  }

  // ── Step 7: Collect orphaned points (not in any line string, not point-code) ──
  for (const cp of finals) {
    if (!assignedPointIds.has(cp.point.id) && cp.resolvedCode?.connectType !== 'POINT') {
      result.orphanedPoints.push(cp.point);
      result.stats.orphanedPointCount++;
    }
  }

  result.stats.warningCount = result.warnings.length;
  return result;
}

// ── Re-export Kasa fit for use in other stages (e.g. Stage 3 arc-to-deed matching) ──
export { kasaCircleFit };
