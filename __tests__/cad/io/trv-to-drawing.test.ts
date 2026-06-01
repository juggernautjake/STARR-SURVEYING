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
    // `0,a` has real coords → kept. `0,b` has no `2,...` line at
    // all ⇒ north/east stay null ⇒ skipped with "missing coords".
    // (cad-trv-import-display Slice 1: `0,c` with `2,0,0,0` is a
    // placeholder record + skipped as such — see the dedicated
    // placeholder-skip test for that path.)
    const broken = [
      '999,begin', '#,POINTS', '95,2',
      '0,a', '2,100,200,300',
      '0,b', '4,5,0,0',
      '999,end',
    ].join('\r\n');
    const { features, notes } = trvToDrawing(parseTrv(broken));
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

  it('Pass 3 — preserves the traverse\'s styling records as JSON on properties.trvStylingRecords', () => {
    const fixture = [
      '999,begin',
      '#,TRAVERSE',
      '30,boundary',
      '50,style-a',
      '70,1.5,foo',
      '10,1',
      '11,1,0,0,3,0',
      '10,2',
      '11,1,1,0,3,0',
      '999,end',
    ].join('\r\n');
    const { features } = trvToDrawing(parseTrv(fixture));
    // No points present in this fixture (only a #,TRAVERSE
    // section), so the traverse should still resolve via its point
    // refs missing → fewer than 2 resolved → traverse is skipped
    // with a note. Add the points so the traverse maps.
    const fixtureWithPoints = [
      '999,begin',
      '#,POINTS', '95,2',
      '0,1', '2,1,1,0',
      '0,2', '2,2,2,0',
      '#,TRAVERSE',
      '30,boundary',
      '50,style-a',
      '70,1.5,foo',
      '10,1', '11,1,0,0,3,0',
      '10,2', '11,1,1,0,3,0',
      '999,end',
    ].join('\r\n');
    const out = trvToDrawing(parseTrv(fixtureWithPoints));
    const t = out.features.find((f) => f.type === 'POLYLINE')!;
    const raw = t.properties.trvStylingRecords as string;
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual([
      { code: '50', fields: ['style-a'] },
      { code: '70', fields: ['1.5', 'foo'] },
    ]);
    // Avoid unused-binding lint on the throwaway `features`.
    expect(features).toBeDefined();
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

// cad-trv-import-export-deep-semantic Pass 7 — curve detection
// emits an additional ARC feature when the polyline geometry has
// a curved run (residual within tolerance). cad-trv-import-polish
// Slice 1 — SPLINE fallback emission was REMOVED; the polyline
// already faithfully follows the source vertices, so adding a
// SPLINE alongside it double-drew the same geometry. Detection
// metadata still lands in properties.trvCurveRuns for a future
// "convert segment to spline" tool.
describe('trvToDrawing — Pass 7: curve detection + ARC emission', () => {
  function arcPointsFixture(): string {
    // Generate ~quarter-circle of radius 100 at origin, 10 pts.
    // Wrap into a TRV fixture with 10 points + a traverse
    // referencing them in order (open polyline).
    const lines: string[] = ['999,begin', '#,POINTS', '95,10'];
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const ang = t * (Math.PI / 2);
      const east = 100 * Math.cos(ang);
      const north = 100 * Math.sin(ang);
      lines.push(`0,p${i}`);
      lines.push(`2,${north.toFixed(6)},${east.toFixed(6)},0`);
    }
    lines.push('#,TRAVERSE');
    lines.push('30,curve-trav');
    lines.push('31,0,10,0,0');
    for (let i = 0; i < 10; i++) {
      lines.push(`10,p${i}`);
      lines.push(`11,1,${i},0,3,0`);
    }
    lines.push('999,end');
    return lines.join('\r\n');
  }

  it('emits an ARC feature alongside the POLYLINE when a circular run is detected', () => {
    const { features } = trvToDrawing(parseTrv(arcPointsFixture()));
    const polyline = features.find((f) => f.type === 'POLYLINE');
    const arc = features.find((f) => f.type === 'ARC');
    expect(polyline).toBeDefined();
    expect(arc).toBeDefined();
    expect(arc!.geometry.arc?.radius).toBeCloseTo(100, 3);
    expect(arc!.geometry.arc?.center.x).toBeCloseTo(0, 3);
    // Y is negated by the screen-y-down transform: north → -y so
    // center y in screen space should be ~0 too (the arc is in the
    // y<0 half-plane in screen coords).
  });

  it('the ARC feature carries curveOfTraverse pointing at the polyline', () => {
    const { features } = trvToDrawing(parseTrv(arcPointsFixture()));
    const polyline = features.find((f) => f.type === 'POLYLINE')!;
    const arc = features.find((f) => f.type === 'ARC')!;
    expect(arc.properties.curveOfTraverse).toBe(polyline.id);
    expect(arc.properties.curveKind).toBe('ARC');
  });

  it('the polyline keeps its original vertex chain (area / boundary unchanged)', () => {
    const { features } = trvToDrawing(parseTrv(arcPointsFixture()));
    const polyline = features.find((f) => f.type === 'POLYLINE')!;
    // 10 input vertices, no dedup since the open traverse doesn't
    // loop back.
    expect(polyline.geometry.vertices?.length).toBe(10);
  });

  it('records the detected runs on properties.trvCurveRuns as JSON', () => {
    const { features } = trvToDrawing(parseTrv(arcPointsFixture()));
    const polyline = features.find((f) => f.type === 'POLYLINE')!;
    const raw = polyline.properties.trvCurveRuns as string;
    const runs = JSON.parse(raw);
    expect(Array.isArray(runs)).toBe(true);
    expect(runs.length).toBe(1);
    expect(runs[0].kind).toBe('ARC');
  });

  it('cad-trv-import-polish Slice 1: a NON-circular curved run no longer emits a SPLINE feature', () => {
    // Hand-crafted free-form curve (not a circle): the run is
    // detected but no SPLINE feature is emitted; the polyline
    // alone covers the vertices, and trvCurveRuns records the
    // detection metadata.
    const lines: string[] = ['999,begin', '#,POINTS', '95,8'];
    // S-curve sampling — definitely curved, definitely not a circle
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const east = 100 * t;
      const north = 30 * Math.sin(t * Math.PI * 2);
      lines.push(`0,p${i}`);
      lines.push(`2,${north.toFixed(6)},${east.toFixed(6)},0`);
    }
    lines.push('#,TRAVERSE');
    lines.push('30,scurve');
    lines.push('31,0,8,0,0');
    for (let i = 0; i < 8; i++) {
      lines.push(`10,p${i}`);
      lines.push(`11,1,${i},0,3,0`);
    }
    lines.push('999,end');
    const { features } = trvToDrawing(parseTrv(lines.join('\r\n')));
    expect(features.filter((f) => f.type === 'SPLINE')).toEqual([]);
    const poly = features.find((f) => f.type === 'POLYLINE')!;
    // Detection still recorded for a future converter tool.
    const runs = JSON.parse(poly.properties.trvCurveRuns as string);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.some((r: { kind: string }) => r.kind === 'SPLINE')).toBe(true);
  });

  it('does NOT emit any curve features for a straight polyline', () => {
    const fixture = [
      '999,begin',
      '#,POINTS',
      '95,4',
      '0,1', '2,0,0,0',
      '0,2', '2,0,10,0',
      '0,3', '2,0,20,0',
      '0,4', '2,0,30,0',
      '#,TRAVERSE',
      '30,straight',
      '31,0,4,0,0',
      '10,1', '11,1,0,0,3,0',
      '10,2', '11,1,1,0,3,0',
      '10,3', '11,1,2,0,3,0',
      '10,4', '11,1,3,0,3,0',
      '999,end',
    ].join('\r\n');
    const { features } = trvToDrawing(parseTrv(fixture));
    expect(features.filter((f) => f.type === 'ARC' || f.type === 'SPLINE')).toEqual([]);
    expect(features.filter((f) => f.type === 'POLYLINE').length).toBe(1);
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
