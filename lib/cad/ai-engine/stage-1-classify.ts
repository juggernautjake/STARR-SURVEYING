// lib/cad/ai-engine/stage-1-classify.ts
// Stage 1 of the AI Drawing Engine pipeline: Point Classification.
//
// Reuses Phase 2's parsing infrastructure (code lookup, suffix parsing,
// name-suffix parsing) and adds AI-level classification flags:
//   - Duplicate point-number detection
//   - Zero-coordinate detection
//   - Statistical outlier detection (mean + 50σ threshold)
//   - Name-suffix confidence flags
//   - Monument-without-action flags
//
// Does NOT call an LLM — all classification is deterministic from the
// existing parsed SurveyPoint data.

import type { SurveyPoint, Point2D } from '../types';
import type { ClassificationResult, ClassificationFlag } from './types';

// ── Internal helpers ──────────────────────────────────────────────────────────

function computeCentroid(points: SurveyPoint[]): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };
  const sumE = points.reduce((s, p) => s + p.easting, 0);
  const sumN = points.reduce((s, p) => s + p.northing, 0);
  return { x: sumE / points.length, y: sumN / points.length };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify every point in the imported set.
 *
 * The function is pure: it reads the already-parsed SurveyPoint fields
 * (codeDefinition, codeSuffix, parsedName, monumentAction, etc.) and produces
 * a richer ClassificationResult for each point.
 *
 * @param points  All SurveyPoints produced by the Phase 2 import pipeline.
 * @returns       One ClassificationResult per input point, same order.
 */
export function classifyPoints(points: SurveyPoint[]): ClassificationResult[] {
  if (points.length === 0) return [];

  // ── Pre-compute centroid & outlier threshold ──
  const centroid = computeCentroid(points);
  const distances = points.map((p) =>
    Math.sqrt((p.easting - centroid.x) ** 2 + (p.northing - centroid.y) ** 2),
  );
  const meanDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  const variance =
    distances.reduce((a, d) => a + (d - meanDist) ** 2, 0) / distances.length;
  const stdDev = Math.sqrt(variance);
  // 50σ is very permissive — only catches truly egregious outliers
  // (e.g. a control point entered in the wrong zone).
  const outlierThreshold = meanDist + 50 * stdDev;

  // ── Track point numbers for duplicate detection ──
  const seenNumbers = new Map<number, string[]>(); // pointNumber → [id, ...]

  const results: ClassificationResult[] = [];

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const flags: ClassificationFlag[] = [];
    const flagMessages: string[] = [];

    // ── Duplicate point number ────────────────────────────────────────────
    const existing = seenNumbers.get(point.pointNumber) ?? [];
    if (existing.length > 0) {
      flags.push('DUPLICATE_POINT_NUMBER');
      flagMessages.push(
        `Point number ${point.pointNumber} also appears as ID(s): ${existing.join(', ')}`,
      );
    }
    existing.push(point.id);
    seenNumbers.set(point.pointNumber, existing);

    // ── Zero coordinates ──────────────────────────────────────────────────
    if (point.easting === 0 && point.northing === 0) {
      flags.push('ZERO_COORDINATES');
      flagMessages.push('Both Easting and Northing are exactly zero');
    }

    // ── Coordinate outlier ────────────────────────────────────────────────
    const dist = distances[i];
    if (dist > outlierThreshold && outlierThreshold > 0) {
      flags.push('COORDINATE_OUTLIER');
      flagMessages.push(
        `Point is ${dist.toFixed(0)}' from centroid ` +
          `(threshold: ${outlierThreshold.toFixed(0)}')`,
      );
    }

    // ── Code recognition ──────────────────────────────────────────────────
    if (!point.codeDefinition) {
      flags.push('UNRECOGNIZED_CODE');
      flagMessages.push(`Code "${point.rawCode}" was not found in the point-code library`);
    }

    // ── Name-suffix ambiguity ─────────────────────────────────────────────
    const { parsedName } = point;
    if (
      parsedName.suffixConfidence < 0.8 &&
      parsedName.normalizedSuffix !== 'NONE'
    ) {
      flags.push('NAME_SUFFIX_AMBIGUOUS');
      flagMessages.push(
        `Suffix "${parsedName.suffix}" interpreted as ${parsedName.normalizedSuffix} ` +
          `with ${(parsedName.suffixConfidence * 100).toFixed(0)}% confidence`,
      );
    }

    // ── Monument without clear action ─────────────────────────────────────
    if (
      point.codeDefinition?.category === 'BOUNDARY_CONTROL' &&
      point.monumentAction === 'UNKNOWN'
    ) {
      flags.push('MONUMENT_NO_ACTION');
      flagMessages.push(
        'Boundary monument code without a clear found / set / calculated indicator',
      );
    }

    // ── Calc-without-field (populated from Phase 2 validation) ───────────
    const hasCalcWithoutField = point.validationIssues.some(
      (vi) => vi.type === 'CALC_WITHOUT_FIELD',
    );
    if (hasCalcWithoutField) {
      flags.push('CALC_WITHOUT_FIELD');
      flagMessages.push('Calculated position with no corresponding set or found point');
    }

    // ── Derive line-string role from codeSuffix ───────────────────────────
    const suf = point.codeSuffix ?? null;
    const isLineStart     = suf === 'B'  || suf === 'BA';
    const isLineEnd       = suf === 'E'  || suf === 'EA';
    const isArcPoint      = suf === 'A'  || suf === 'BA'
                          || suf === 'EA' || suf === 'CA';
    const isAutoSplinePoint = point.codeDefinition?.isAutoSpline ?? false;

    results.push({
      point,
      resolvedCode:    point.codeDefinition ?? null,
      monumentAction:  point.monumentAction ?? null,
      codeSuffix:      suf,
      isLineStart,
      isLineEnd,
      isArcPoint,
      isAutoSplinePoint,
      flags,
      flagMessages,
    });
  }

  return results;
}
