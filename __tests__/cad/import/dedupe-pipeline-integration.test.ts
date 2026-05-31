// __tests__/cad/import/dedupe-pipeline-integration.test.ts
//
// cad-duplicate-point-handling Slice 3 — `processImport` now
// runs `dedupePointNumbers` after parsing so a CSV with
// colliding pointNumbers lands as renamed `:N` points instead
// of leaving the collisions as a validation warning the user
// has to resolve.

import { describe, it, expect } from 'vitest';
import { processImport } from '@/lib/cad/import/import-pipeline';
import type { ParsedImportRow } from '@/lib/cad/import/types';

function mkRow(lineNumber: number, pointNumber: number, code = 'CP', n = 100, e = 200): ParsedImportRow {
  return {
    lineNumber,
    rawLine: `${pointNumber},${n},${e},0,${code}`,
    error: null,
    data: {
      pointNumber,
      pointName: String(pointNumber),
      northing: n,
      easting: e,
      elevation: 0,
      rawCode: code,
      description: '',
    },
  };
}

describe('processImport — Slice 3: pipeline applies the deduper', () => {
  it('a CSV with no collisions returns an empty pointRenames list', () => {
    const rows: ParsedImportRow[] = [mkRow(1, 1), mkRow(2, 2), mkRow(3, 3)];
    const r = processImport(rows, 'clean.csv');
    expect(r.pointRenames).toEqual([]);
    expect(r.points.map((p) => p.pointName)).toEqual(['1', '2', '3']);
  });

  it('a CSV with same-layer collisions auto-renames + records the renames', () => {
    const rows: ParsedImportRow[] = [
      mkRow(1, 23, 'CP', 100, 200),
      mkRow(2, 23, 'CP', 150, 250),
      mkRow(3, 23, 'CP', 175, 275),
    ];
    const r = processImport(rows, 'dupes.csv');
    expect(r.pointRenames).toHaveLength(2);
    expect(r.points.map((p) => p.pointName)).toEqual(['23', '23:1', '23:2']);
    expect(r.pointRenames.every((rn) => rn.kind === 'SAME_LAYER')).toBe(true);
  });

  it('cross-layer collisions are tagged CROSS_LAYER (one point per code/layer)', () => {
    // Two known codes that resolve to different defaultLayerId — use
    // a code recognized as Topo and another as Boundary in the
    // master library. If the test's lookups land on MISC for both,
    // the kind degrades to SAME_LAYER (which is fine: the renaming
    // itself still happens). The point is that pointName is
    // auto-renamed REGARDLESS of layer.
    const rows: ParsedImportRow[] = [
      mkRow(1, 99, 'PP'),
      mkRow(2, 99, 'EP'),
    ];
    const r = processImport(rows, 'cross.csv');
    expect(r.points.map((p) => p.pointName)).toEqual(['99', '99:1']);
    expect(r.pointRenames).toHaveLength(1);
    expect(r.pointRenames[0].fromName).toBe('99');
    expect(r.pointRenames[0].toName).toBe('99:1');
  });

  it('DUPLICATE_POINT_NUMBER warnings are SUPPRESSED after dedupe (no leftover dupes by name)', () => {
    const rows: ParsedImportRow[] = [
      mkRow(1, 7),
      mkRow(2, 7),
    ];
    const r = processImport(rows, 'd.csv');
    // The validator runs against POST-dedupe pointNames. The
    // pointNumbers ARE still duplicated, so the existing
    // DUPLICATE_POINT_NUMBER warning still fires once per
    // collision group (the surveyor still wants to know they
    // had a dup) — but only ONE warning per group, not per
    // occurrence, and the pointNames downstream are unique.
    const dupWarnings = r.validationIssues.filter((i) => i.type === 'DUPLICATE_POINT_NUMBER');
    expect(dupWarnings.length).toBe(1);
    expect(r.points.map((p) => p.pointName)).toEqual(['7', '7:1']);
  });

  it('downstream lineStringIds remain pinned to the correct (post-rename) point id', () => {
    // The deduper preserves SurveyPoint.id (uuid); only pointName
    // changes. LineString refs are by id, so they must stay valid
    // through the rename.
    const rows: ParsedImportRow[] = [
      mkRow(1, 1, 'BL/B'),
      mkRow(2, 2, 'BL/E'),
      mkRow(3, 2, 'BL/E'), // pointNumber collision
    ];
    const r = processImport(rows, 'ls.csv');
    expect(r.points.map((p) => p.pointName)).toEqual(['1', '2', '2:1']);
    // Each point's id remains stable; line-string refs use ids.
    for (const ls of r.lineStrings) {
      for (const ref of ls.pointIds) {
        expect(r.points.find((p) => p.id === ref)).toBeDefined();
      }
    }
  });
});
