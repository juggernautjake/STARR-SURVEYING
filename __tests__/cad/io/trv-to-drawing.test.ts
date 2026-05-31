// __tests__/cad/io/trv-to-drawing.test.ts
//
// cad-trv-import-export Slice 2 — pure mapper from TrvDocument to
// the layers + features the drawing store consumes.

import { describe, it, expect } from 'vitest';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

const FIXTURE = [
  '999,begin',
  '80,26.000',
  '#,SURVEY',
  '83,0',
  '86,Boundaries,3,0',
  '86,Topo,18,0',
  '#,POINTS',
  '95,3',
  '0,1',
  '1,corner SE',
  '3,3',
  '4,5,0,0',
  '2,4994.142075,4999.0675795,700',
  '0,2',
  '1,corner SW',
  '3,3',
  '4,5,0,0',
  '2,4994.142075,4900.0,700.5',
  '0,3',
  '1,corner NW',
  '3,3',
  '4,5,0,0',
  '2,5094.142075,4900.0,700',
  '#,TRAVERSE',
  '30,perimeter',
  '31,0,3,0,0',
  '10,1',
  '11,1,0,0,3,0',
  '10,2',
  '11,1,1,0,3,0',
  '10,3',
  '11,1,2,0,3,0',
  '10,1',
  '11,1,3,0,3,0',
  '999,end',
].join('\r\n');

function build() {
  const trv = parseTrv(FIXTURE);
  return trvToDrawing(trv);
}

describe('trvToDrawing — layers', () => {
  it('emits one Layer per 86 record, ids prefixed with `trv-layer:`', () => {
    const { layers } = build();
    expect(layers.length).toBe(2);
    expect(layers.map((l) => l.id)).toEqual(['trv-layer:3', 'trv-layer:18']);
    expect(layers.map((l) => l.name)).toEqual(['Boundaries', 'Topo']);
  });

  it('layers preserve source order via sortOrder', () => {
    const { layers } = build();
    expect(layers.map((l) => l.sortOrder)).toEqual([0, 1]);
  });

  it('layer defaults render as visible/unlocked/SOLID', () => {
    const { layers } = build();
    for (const l of layers) {
      expect(l.visible).toBe(true);
      expect(l.locked).toBe(false);
      expect(l.frozen).toBe(false);
      expect(l.lineTypeId).toBe('SOLID');
    }
  });
});

describe('trvToDrawing — points', () => {
  it('emits one POINT Feature per point, ids prefixed with `trv-point:`', () => {
    const { features } = build();
    const points = features.filter((f) => f.type === 'POINT');
    expect(points.length).toBe(3);
    expect(points.map((p) => p.id).sort()).toEqual(['trv-point:1', 'trv-point:2', 'trv-point:3']);
  });

  it('maps (north, east, z) → (east, -north) in screen-y-down space', () => {
    const { features } = build();
    const p1 = features.find((f) => f.id === 'trv-point:1')!;
    // TRV point 1: north=4994.142, east=4999.068
    expect(p1.geometry.point?.x).toBeCloseTo(4999.0675795, 6);
    expect(p1.geometry.point?.y).toBeCloseTo(-4994.142075, 6);
  });

  it('preserves elevation / description / source coords on properties', () => {
    const { features } = build();
    const p1 = features.find((f) => f.id === 'trv-point:1')!;
    expect(p1.properties.elevation).toBe(700);
    expect(p1.properties.label).toBe('corner SE');
    expect(p1.properties.surveyNorth).toBe(4994.142075);
    expect(p1.properties.surveyEast).toBe(4999.0675795);
    expect(p1.properties.trvPointId).toBe('1');
  });

  it('assigns the point to its TRV layer via the layerIdByTrvId map', () => {
    const { features } = build();
    const p1 = features.find((f) => f.id === 'trv-point:1')!;
    expect(p1.layerId).toBe('trv-layer:3');
  });

  it('points with no coordinates are skipped + noted', () => {
    const broken = ['999,begin', '#,POINTS', '95,2', '0,a', '2,0,0,0', '0,b', '4,5,0,0', '999,end'].join('\r\n');
    const { features, notes } = trvToDrawing(parseTrv(broken));
    // `0,a` has 2,0,0,0 → coords are zero but parseable; that's a VALID point at origin.
    // `0,b` has no `2,...` line ⇒ north/east stay null ⇒ skipped.
    expect(features.filter((f) => f.type === 'POINT').map((f) => f.id)).toEqual(['trv-point:a']);
    expect(notes.some((n) => n.includes('b') && n.includes('missing coordinates'))).toBe(true);
  });
});

describe('trvToDrawing — traverses', () => {
  it('emits a POLYGON when the first and last point refs match (closed)', () => {
    const { features } = build();
    const traverse = features.find((f) => f.type === 'POLYGON');
    expect(traverse).toBeDefined();
    // 4 refs in source (1, 2, 3, 1) → 3 vertices in closed POLYGON
    // (duplicate closing ref dropped).
    expect(traverse!.geometry.vertices?.length).toBe(3);
  });

  it('emits a POLYLINE when refs do not loop back', () => {
    const open = FIXTURE.replace(/10,1\r\n11,1,3,0,3,0\r\n/, '');
    const { features } = trvToDrawing(parseTrv(open));
    const traverse = features.find((f) => f.type === 'POLYLINE' || f.type === 'POLYGON')!;
    expect(traverse.type).toBe('POLYLINE');
    expect(traverse.geometry.vertices?.length).toBe(3);
  });

  it('traverse vertices match the imported points in (east, -north) space', () => {
    const { features } = build();
    const traverse = features.find((f) => f.type === 'POLYGON')!;
    const verts = traverse.geometry.vertices!;
    expect(verts[0].x).toBeCloseTo(4999.0675795, 6);
    expect(verts[0].y).toBeCloseTo(-4994.142075, 6);
  });

  it('traverse carries the source-line + ref-id list + name on properties', () => {
    const { features } = build();
    const traverse = features.find((f) => f.type === 'POLYGON')!;
    expect(traverse.properties.name).toBe('perimeter');
    expect(traverse.properties.trvPointRefs).toBe('1,2,3,1');
    expect(typeof traverse.properties.trvSourceLine).toBe('number');
  });

  it('traverse with < 2 resolvable refs is skipped + noted', () => {
    const dangling = [
      '999,begin',
      '#,POINTS',
      '95,1',
      '0,a',
      '4,5,0,0',
      '2,1,2,0',
      '#,TRAVERSE',
      '30,ghost',
      '31,0,1,0,0',
      '10,not-a-point',
      '11,1,0,0,3,0',
      '999,end',
    ].join('\r\n');
    const { features, notes } = trvToDrawing(parseTrv(dangling));
    expect(features.filter((f) => f.type === 'POLYLINE' || f.type === 'POLYGON').length).toBe(0);
    expect(notes.some((n) => n.includes('ghost'))).toBe(true);
  });
});

describe('trvToDrawing — composition', () => {
  it('returns layers + features + notes for the full fixture in one call', () => {
    const out = build();
    expect(out.layers.length).toBe(2);
    expect(out.features.length).toBe(4); // 3 points + 1 polygon
    expect(out.notes).toEqual([]);
  });
});
