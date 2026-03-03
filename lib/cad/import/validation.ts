// lib/cad/import/validation.ts
import type { SurveyPoint, LineString, PointGroup, ValidationIssue } from '../types';

const OUTLIER_MULTIPLIER = 5; // Points > 5× std dev from centroid

function computeCentroid(points: SurveyPoint[]): { x: number; y: number } | null {
  if (points.length === 0) return null;
  const sumX = points.reduce((s, p) => s + p.easting, 0);
  const sumY = points.reduce((s, p) => s + p.northing, 0);
  return { x: sumX / points.length, y: sumY / points.length };
}

function computeStdDev(points: SurveyPoint[], centroid: { x: number; y: number }): number {
  if (points.length < 2) return Infinity;
  const dists = points.map(p => Math.sqrt((p.easting - centroid.x) ** 2 + (p.northing - centroid.y) ** 2));
  const mean = dists.reduce((s, d) => s + d, 0) / dists.length;
  const variance = dists.reduce((s, d) => s + (d - mean) ** 2, 0) / dists.length;
  return Math.sqrt(variance);
}

export function validatePoints(
  points: SurveyPoint[],
  lineStrings: LineString[],
  _pointGroups: Map<number, PointGroup>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ── 1. Duplicate point numbers ──
  const numMap = new Map<number, SurveyPoint[]>();
  for (const pt of points) {
    const arr = numMap.get(pt.pointNumber) ?? [];
    arr.push(pt);
    numMap.set(pt.pointNumber, arr);
  }
  for (const [, dupes] of numMap) {
    if (dupes.length > 1) {
      for (const pt of dupes) {
        issues.push({
          type: 'DUPLICATE_POINT_NUMBER',
          severity: 'WARNING',
          pointId: pt.id,
          message: `Duplicate point number ${pt.pointNumber} (${dupes.length} occurrences)`,
          autoFixable: false,
        });
      }
    }
  }

  // ── 2. Zero coordinates ──
  for (const pt of points) {
    if (pt.northing === 0 || pt.easting === 0) {
      issues.push({
        type: 'ZERO_COORDINATES',
        severity: 'ERROR',
        pointId: pt.id,
        message: `Point ${pt.pointName} has zero northing or easting`,
        autoFixable: false,
      });
    }
  }

  // ── 3. Unrecognized codes ──
  for (const pt of points) {
    if (!pt.codeDefinition) {
      issues.push({
        type: 'UNRECOGNIZED_CODE',
        severity: 'WARNING',
        pointId: pt.id,
        message: `Unrecognized code "${pt.rawCode}" on point ${pt.pointName}`,
        autoFixable: false,
      });
    }
  }

  // ── 4. Coordinate outliers ──
  const validPoints = points.filter(p => p.northing !== 0 && p.easting !== 0);
  const centroid = computeCentroid(validPoints);
  if (centroid && validPoints.length > 4) {
    const stdDev = computeStdDev(validPoints, centroid);
    const threshold = stdDev * OUTLIER_MULTIPLIER;
    for (const pt of validPoints) {
      const dist = Math.sqrt((pt.easting - centroid.x) ** 2 + (pt.northing - centroid.y) ** 2);
      if (dist > threshold) {
        issues.push({
          type: 'COORDINATE_OUTLIER',
          severity: 'WARNING',
          pointId: pt.id,
          message: `Point ${pt.pointName} appears to be a coordinate outlier (${dist.toFixed(1)} ft from centroid)`,
          autoFixable: false,
        });
      }
    }
  }

  // ── 5. Single-point line strings ──
  for (const ls of lineStrings) {
    if (ls.pointIds.length === 1) {
      const pt = points.find(p => p.id === ls.pointIds[0]);
      if (pt) {
        issues.push({
          type: 'SINGLE_POINT_LINE',
          severity: 'WARNING',
          pointId: pt.id,
          message: `Line string for code ${ls.codeBase} has only one point — cannot connect`,
          autoFixable: false,
        });
      }
    }
  }

  // ── 6. Low-confidence name suffixes ──
  for (const pt of points) {
    if (pt.parsedName.suffixConfidence < 0.7 && pt.parsedName.normalizedSuffix !== 'NONE') {
      issues.push({
        type: 'NAME_SUFFIX_AMBIGUOUS',
        severity: 'INFO',
        pointId: pt.id,
        message: `Point name "${pt.pointName}" suffix is ambiguous (confidence: ${(pt.parsedName.suffixConfidence * 100).toFixed(0)}%)`,
        autoFixable: false,
      });
    }
  }

  // ── 7. Calc without field ──
  for (const [, group] of _pointGroups) {
    if (group.calculated.length > 0 && !group.set && !group.found) {
      for (const calcPt of group.calculated) {
        issues.push({
          type: 'CALC_WITHOUT_FIELD',
          severity: 'INFO',
          pointId: calcPt.id,
          message: `Calculated point ${calcPt.pointName} has no corresponding set or found point`,
          autoFixable: false,
        });
      }
    }
  }

  // ── 8. Orphan suffix detection ──
  // Check for E/EA/CA without matching B/BA
  const openLinesByCode = new Map<string, boolean>();
  for (const pt of points) {
    const base = pt.parsedCode.baseCode;
    const suffix = pt.codeSuffix;
    if (!pt.codeDefinition || pt.codeDefinition.connectType === 'POINT') continue;

    if (suffix === 'B' || suffix === 'BA') {
      openLinesByCode.set(base, true);
    } else if (suffix === 'E' || suffix === 'EA' || suffix === 'C' || suffix === 'CA') {
      if (!openLinesByCode.get(base)) {
        issues.push({
          type: 'ORPHAN_END_SUFFIX',
          severity: 'WARNING',
          pointId: pt.id,
          message: `Point ${pt.pointName} has ${suffix} suffix but no matching B/BA was found for code ${base}`,
          autoFixable: false,
        });
      }
      openLinesByCode.delete(base);
    }
  }

  // Any still-open lines → orphan begin
  for (const [code, open] of openLinesByCode) {
    if (open) {
      // Find the B/BA point
      const beginPt = [...points].reverse().find(p =>
        p.parsedCode.baseCode === code && (p.codeSuffix === 'B' || p.codeSuffix === 'BA')
      );
      if (beginPt) {
        issues.push({
          type: 'ORPHAN_BEGIN_SUFFIX',
          severity: 'WARNING',
          pointId: beginPt.id,
          message: `Line string for code ${code} was started with B/BA but never ended with E/C`,
          autoFixable: false,
        });
      }
    }
  }

  return issues;
}
