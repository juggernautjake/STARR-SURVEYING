// lib/cad/import/unknown-refs.ts
//
// cad-duplicate-point-handling Slice 2 — pure helper that finds
// every `pointId` referenced by a LineString / traverse / other
// feature but NOT present in the points list, and emits structured
// `UNKNOWN_POINT_REFERENCE` issues.
//
// Previously the TRV mapper surfaced these as free-form text notes
// (`Traverse "X" — missing point "Y"`) — the Validate UI couldn't
// group / count / link to them. This module turns the missing-ref
// detection into a first-class issue type the rest of the
// validation pipeline already knows how to render.
//
// Pure module: no DOM, no React, no store access.

import type { SurveyPoint, LineString, ValidationIssue } from '../types';

/** Walk every `LineString.pointIds` and verify each referenced id
 *  resolves to a SurveyPoint. Each dangling reference becomes one
 *  WARNING issue carrying the source line-string id + the missing
 *  ref so the Validate step can link back to it. */
export function findUnknownPointRefs(
  points: ReadonlyArray<SurveyPoint>,
  lineStrings: ReadonlyArray<LineString>,
): ValidationIssue[] {
  const knownIds = new Set<string>();
  for (const p of points) knownIds.add(p.id);
  const issues: ValidationIssue[] = [];
  for (const ls of lineStrings) {
    for (const ref of ls.pointIds) {
      if (knownIds.has(ref)) continue;
      issues.push({
        type: 'UNKNOWN_POINT_REFERENCE',
        severity: 'WARNING',
        // ValidationIssue.pointId is the foreign-key field the UI
        // uses to link back to a row. For unknown-ref issues there
        // IS no SurveyPoint to link to — surface the line-string id
        // here so the UI can still highlight the affected feature.
        pointId: ls.id,
        message: `Line string ${ls.codeBase} references unknown point id "${ref}"`,
        autoFixable: false,
      });
    }
  }
  return issues;
}

/** Detect orphan POINT features — points that are NOT referenced
 *  by any LineString. INFO-severity so the surveyor sees them
 *  surfaced without it blocking the import. Useful for surveys
 *  exported from systems where extra "scratch" points get left
 *  behind. */
export function findOrphanPoints(
  points: ReadonlyArray<SurveyPoint>,
  lineStrings: ReadonlyArray<LineString>,
): ValidationIssue[] {
  const referencedIds = new Set<string>();
  for (const ls of lineStrings) for (const ref of ls.pointIds) referencedIds.add(ref);
  const issues: ValidationIssue[] = [];
  for (const p of points) {
    if (referencedIds.has(p.id)) continue;
    // Point features that aren't part of any line string are
    // perfectly normal — control points, monuments, GPS shots,
    // etc. Only surface as INFO when the surveyor explicitly
    // asks, e.g. when QA-checking a multi-system export. The
    // import-pipeline default omits these; callers opt in.
    issues.push({
      type: 'UNKNOWN_POINT_REFERENCE',
      severity: 'INFO',
      pointId: p.id,
      message: `Point ${p.pointName} is not referenced by any line string`,
      autoFixable: false,
    });
  }
  return issues;
}
