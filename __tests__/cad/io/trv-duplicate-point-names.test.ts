// __tests__/cad/io/trv-duplicate-point-names.test.ts
//
// cad-ux-cleanup-pass Slice 2 — when a TRV file contains the same
// point id more than once, the import keeps the FIRST occurrence
// verbatim and renames subsequent collisions to `${name}:K` (K = 1, 2,
// …). The original code silently overwrote on collision, so all but
// the last record disappeared.

import { describe, it, expect } from 'vitest';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

/** Build a minimal TRV fixture that opens a #,POINTS section and
 *  drops the supplied `[id, N, E, Z]` rows as `0,id; 2,N,E,Z` blocks. */
function pointsTrv(rows: Array<[string, number, number, number]>): ReturnType<typeof parseTrv> {
  const lines = ['999,begin', '#,POINTS', `95,${rows.length}`];
  for (const [id, n, e, z] of rows) lines.push(`0,${id}`, '3,0', `2,${n},${e},${z}`);
  lines.push('999,end');
  return parseTrv(lines.join('\r\n'));
}

/** Canonical point features only — `trvToDrawing` also clones each
 *  point onto the synthetic Points-layer mirror (`trvPointMirror:
 *  true`) which would double every id in the assertions. */
const pointIds = (trv: ReturnType<typeof parseTrv>): string[] =>
  trvToDrawing(trv).features
    .filter((f) =>
      f.type === 'POINT' &&
      typeof f.properties.trvPointId === 'string' &&
      !f.properties.trvPointMirror,
    )
    .map((f) => String(f.properties.trvPointId));

describe('TRV duplicate point names — first wins, dups number from :1', () => {
  it('three raw duplicates → first stays bare, dups :1, :2', () => {
    const trv = pointsTrv([
      ['22fnd', 100, 200, 50],
      ['22fnd', 101, 201, 51],
      ['22fnd', 102, 202, 52],
    ]);
    expect(pointIds(trv)).toEqual(['22fnd', '22fnd:1', '22fnd:2']);
  });

  it('source already provides :N suffixes → preserved verbatim', () => {
    const trv = pointsTrv([
      ['22fnd', 100, 200, 50],
      ['22fnd:1', 101, 201, 51],
      ['22fnd:2', 102, 202, 52],
    ]);
    expect(pointIds(trv)).toEqual(['22fnd', '22fnd:1', '22fnd:2']);
  });

  it('rename skips suffixes the source itself already claims', () => {
    // Two bare `22fnd` + a source-provided `22fnd:1`: the rename must
    // hop to `:2` so it doesn't collide with the later source record.
    const trv = pointsTrv([
      ['22fnd', 100, 200, 50],
      ['22fnd', 101, 201, 51],
      ['22fnd:1', 102, 202, 52],
    ]);
    expect(pointIds(trv)).toEqual(['22fnd', '22fnd:2', '22fnd:1']);
  });

  it('placeholder (2,id,0,0,0) does NOT steal the bare name from a real record', () => {
    const trv = pointsTrv([
      ['22fnd', 0, 0, 0],         // placeholder — skipped, name freed
      ['22fnd', 100, 200, 50],    // real record keeps the bare name
    ]);
    expect(pointIds(trv)).toEqual(['22fnd']);
  });

  it('distinct names never get a suffix', () => {
    const trv = pointsTrv([
      ['101', 100, 200, 50],
      ['102', 101, 201, 51],
      ['IRF', 102, 202, 52],
    ]);
    expect(pointIds(trv)).toEqual(['101', '102', 'IRF']);
  });

  it('feature id mirrors the disambiguated trvPointId so downstream lookups stay in sync', () => {
    const trv = pointsTrv([
      ['22fnd', 100, 200, 50],
      ['22fnd', 101, 201, 51],
    ]);
    const points = trvToDrawing(trv).features.filter((f) =>
      f.type === 'POINT' && !f.properties.trvPointMirror,
    );
    expect(points.map((f) => f.id)).toEqual(['trv-point:22fnd', 'trv-point:22fnd:1']);
  });
});
