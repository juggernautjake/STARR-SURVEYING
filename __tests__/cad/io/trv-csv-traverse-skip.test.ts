// __tests__/cad/io/trv-csv-traverse-skip.test.ts
//
// cad-trv-drawing-parsing Slice 1 — traverses named after their
// source CSV file (e.g. `26074.csv`, `Copy-26074.csv`,
// `DUP-26074.csv`) are master point lists from an upstream CSV
// import. Traverse PC renders them as POINT SYMBOLS only, not
// polylines. Without skipping them our mapper connects 200-
// 350+ unrelated survey shots in row order, producing the
// "drawing isn't great" mess the user reported.

import { describe, it, expect } from 'vitest';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

function fixture(traverseName: string): string {
  return [
    '999,begin',
    '#,POINTS',
    '95,3',
    '0,1', '3,0', '4,5,0,0', '2,100,200,0',
    '0,2', '3,0', '4,5,0,0', '2,150,250,0',
    '0,3', '3,0', '4,5,0,0', '2,200,300,0',
    '#,TRAVERSE',
    `30,${traverseName}`,
    '31,0,3,0,0',
    '10,1', '11,1,0,0,3,0',
    '10,2', '11,1,1,0,3,0',
    '10,3', '11,1,2,0,3,0',
    '999,end',
  ].join('\r\n');
}

describe('mapTraverse — skips CSV master-list traverses', () => {
  it('a traverse named "26074.csv" produces NO polyline / polygon feature', () => {
    const { features, notes } = trvToDrawing(parseTrv(fixture('26074.csv')));
    expect(features.filter((f) => f.type === 'POLYLINE' || f.type === 'POLYGON')).toEqual([]);
    expect(notes.some((n) => n.includes('CSV master-list traverse "26074.csv"'))).toBe(true);
  });

  it('case-insensitive: `Copy-26074.CSV` is also skipped', () => {
    const { features } = trvToDrawing(parseTrv(fixture('Copy-26074.CSV')));
    expect(features.filter((f) => f.type === 'POLYLINE' || f.type === 'POLYGON')).toEqual([]);
  });

  it('prefix variants (Copy-*, DUP-*) skip via the .csv suffix', () => {
    expect(trvToDrawing(parseTrv(fixture('DUP-26074.csv'))).features.filter((f) => f.type === 'POLYLINE')).toEqual([]);
    expect(trvToDrawing(parseTrv(fixture('Copy-26074.csv'))).features.filter((f) => f.type === 'POLYLINE')).toEqual([]);
  });

  it('a non-CSV traverse still renders as a polyline', () => {
    const { features } = trvToDrawing(parseTrv(fixture('BOUNDARY')));
    expect(features.filter((f) => f.type === 'POLYLINE' || f.type === 'POLYGON').length).toBeGreaterThan(0);
  });

  it('member points of a skipped CSV traverse still come through as POINT features', () => {
    // The points pass runs independently of the traverse pass, so
    // the 3 source points still land as POINT features regardless
    // of whether the traverse polyline was skipped.
    const { features } = trvToDrawing(parseTrv(fixture('26074.csv')));
    // cad-trv-dual-layer-filename Slice 2 — count canonical points
    // only (each also mirrors onto the Drawing layer).
    expect(features.filter((f) => f.type === 'POINT' && !f.properties.trvPointMirror).length).toBe(3);
  });

  it('the skip note reports the point count + the symbol-only rendering hint', () => {
    const { notes } = trvToDrawing(parseTrv(fixture('26074.csv')));
    const note = notes.find((n) => n.includes('CSV master-list'));
    expect(note).toContain('3 points');
    expect(note).toContain('POINT symbols only');
  });
});

describe('TRV mapper — point properties.code for label-prefs', () => {
  it('stamps properties.code from the description so layer-prefs "Show point descriptions" finds it', () => {
    const text = [
      '999,begin',
      '#,POINTS',
      '95,1',
      '0,20fnd',
      '1,309 inside 315 1in',
      '3,0',
      '4,5,0,0',
      '2,100,200,0',
      '999,end',
    ].join('\r\n');
    const { features } = trvToDrawing(parseTrv(text));
    const p = features.find((f) => f.properties.trvPointId === '20fnd')!;
    expect(p.properties.code).toBe('309 inside 315 1in');
    expect(p.properties.description).toBe('309 inside 315 1in');
    expect(p.properties.pointName).toBe('20fnd');
  });

  it('a point with no description has neither description NOR code stamped', () => {
    const text = [
      '999,begin',
      '#,POINTS',
      '95,1',
      '0,a',
      '3,0',
      '4,5,0,0',
      '2,100,200,0',
      '999,end',
    ].join('\r\n');
    const p = trvToDrawing(parseTrv(text)).features.find((f) => f.type === 'POINT')!;
    expect(p.properties.description).toBeUndefined();
    expect(p.properties.code).toBeUndefined();
    expect(p.properties.pointName).toBe('a');
  });
});
