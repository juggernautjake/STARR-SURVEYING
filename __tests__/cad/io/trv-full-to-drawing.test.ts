// __tests__/cad/io/trv-full-to-drawing.test.ts
//
// trv-full-support — what Starr Forge gets from a TRV: true ARC features
// for the file's curves (not fitted, not segmented), hidden chord / pen-up
// edges, element arcs + leaders, and — in `layerMode: 'source'` — the
// file's own layers with colours and TPC's labels as text.

import { describe, it, expect } from 'vitest';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';
import { importTrvFromText, formatRenderedElements } from '@/lib/cad/io/trv-io';
import type { Feature } from '@/lib/cad/types';
import { SYNTHETIC_TRV } from './fixtures/trv-synthetic';

const doc = parseTrv(SYNTHETIC_TRV);

describe('trvToDrawing — true curves (default two-layer mode)', () => {
  const { features, layers } = trvToDrawing(doc, { layerPrefix: 'Sample' });
  const byId = new Map(features.map((f) => [f.id, f]));
  const lot = features.find((f) => f.properties.name === 'LOT 1')!;

  it('keeps the two-layer layout by default', () => {
    expect(layers.map((l) => l.name)).toEqual(['Sample — Drawing', 'Sample — Points']);
  });

  it('LOT 1 stays one closed POLYGON with TPC\'s area; its curved edge is hidden', () => {
    expect(lot.type).toBe('POLYGON');
    expect(lot.geometry.vertices).toHaveLength(4);
    expect(lot.geometry.hiddenSegments).toEqual([1]);
    expect(lot.properties.trvArea).toBeCloseTo(10905.86, 2);
    expect(lot.properties.trvTraverseId).toBe('7');
    expect(lot.properties.trvCurveCount).toBe(1);
  });

  it('emits an editable ARC for edge 2→3 with radius, centre and sweep from the file', () => {
    const arc = byId.get(`${lot.id}:curve:1`)!;
    expect(arc.type).toBe('ARC');
    const g = arc.geometry.arc!;
    expect(g.radius).toBe(100);
    expect(g.center.x).toBeCloseTo(5013.3975, 4);
    expect(g.center.y).toBeCloseTo(5050, 6);
    expect(g.anticlockwise).toBe(true);
    // Start at point 2 (angle -30°), end at point 3 (+30°): a 60° CCW sweep.
    expect((g.startAngle * 180) / Math.PI).toBeCloseTo(-30, 6);
    expect((g.endAngle * 180) / Math.PI).toBeCloseTo(30, 6);
    expect(arc.properties).toMatchObject({ curveOfTraverse: lot.id, trvCurveSource: 'LINES', trvRadius: -100, trvCurveFromId: '2', trvCurveToId: '3' });
    expect(arc.properties.trvDeltaDeg).toBeCloseTo(60, 6);
    expect(arc.properties.trvArcLength).toBeCloseTo((100 * Math.PI) / 3, 6);
    expect(arc.layerId).toBe(lot.layerId);
    expect(arc.featureGroupId).toBe(lot.featureGroupId);
  });

  it('does not ALSO curve-fit a traverse that carries its own curves', () => {
    const lotArcs = features.filter((f) => f.type === 'ARC' && f.properties.curveOfTraverse === lot.id);
    expect(lotArcs).toHaveLength(1);
    expect(lot.properties.trvCurveRuns).toBeUndefined();
  });

  it('hides the edge into a pen-up ref', () => {
    const fence = features.find((f) => f.properties.name === 'FENCE')!;
    expect(fence.type).toBe('POLYLINE');
    expect(fence.geometry.hiddenSegments).toEqual([1]);
  });

  it('adds element arcs, standalone curves and leaders as derived features', () => {
    const kinds = (k: string) => features.filter((f) => f.properties.trvElementKind === k);
    const elArc = kinds('ELEMENT_ARC');
    expect(elArc).toHaveLength(1);
    expect(elArc[0].type).toBe('ARC');
    expect(elArc[0].geometry.arc!.center.y).toBeCloseTo(5300 + 50 * Math.sqrt(3), 6);
    expect(elArc[0].style.lineTypeId).toBe('DASHED');
    expect(elArc[0].properties.trvDerived).toBe(true);
    const curve = kinds('TRV_CURVE');
    expect(curve).toHaveLength(1);
    expect(curve[0].geometry.arc!.anticlockwise).toBe(false);
    expect(kinds('ELEMENT_LEADER')).toHaveLength(1);
  });

  it('remembers TPC symbol numbers on points', () => {
    const p3 = features.find((f) => f.type === 'POINT' && f.properties.trvPointId === '3' && !f.properties.trvPointMirror)!;
    expect(p3.properties.trvSymbolId).toBe('18');
  });

  it('only draws the primary sheet (Sheet B\'s duplicate label is ignored)', () => {
    const lotFeature = features.find((f) => f.properties.name === 'LOT 1')!;
    expect(lotFeature.properties.trvAreaLabel).toBe('10906 SqFt0.250 Acres');
  });
});

describe('trvToDrawing — layerMode: source', () => {
  const out = trvToDrawing(doc, { layerPrefix: 'Sample', layerMode: 'source' });
  const layerName = (f: Feature) => out.layers.find((l) => l.id === f.layerId)?.name;

  it('creates the file\'s own layers (+ Points), with colours and visibility', () => {
    const names = out.layers.map((l) => l.name);
    expect(names[0]).toBe('Sample — Points');
    expect(names).toEqual(expect.arrayContaining([
      'Sample — Lines', 'Sample — Point Labels', 'Sample — Line Labels', 'Sample — Lot Areas',
      'Sample — Fences', 'Sample — Drawing', 'Sample — Construction (not plotted)',
    ]));
    const pointLabels = out.layers.find((l) => l.name === 'Sample — Point Labels')!;
    expect(pointLabels.color).toBe('#ff0000');
    expect(pointLabels.description).toMatch(/TPCPointLabels/);
    expect(out.layers.find((l) => l.name === 'Sample — Lot Areas')!.visible).toBe(false);
    expect(out.layers.find((l) => l.name === 'Sample — Construction (not plotted)')!.visible).toBe(false);
    expect(new Set(out.layers.map((l) => l.id)).size).toBe(out.layers.length);
  });

  it('puts every feature on a created layer, with no Drawing-layer point copies', () => {
    const ids = new Set(out.layers.map((l) => l.id));
    expect(out.features.every((f) => ids.has(f.layerId))).toBe(true);
    expect(out.features.some((f) => f.properties.trvPointMirror)).toBe(false);
    const points = out.features.filter((f) => f.type === 'POINT');
    expect(points).toHaveLength(7);
    expect(points.every((f) => layerName(f) === 'Sample — Points')).toBe(true);
  });

  it('traverses + their arcs go on TPC\'s Lines layer; construction copies on their own', () => {
    const lot = out.features.find((f) => f.properties.name === 'LOT 1')!;
    expect(layerName(lot)).toBe('Sample — Lines');
    const arc = out.features.find((f) => f.properties.curveOfTraverse === lot.id)!;
    expect(layerName(arc)).toBe('Sample — Lines');
    const copy = out.features.find((f) => f.properties.name === 'Copy-LOT 1')!;
    expect(layerName(copy)).toBe('Sample — Construction (not plotted)');
    expect(copy.hidden).toBe(true);
    const elArc = out.features.find((f) => f.properties.trvElementKind === 'ELEMENT_ARC')!;
    expect(layerName(elArc)).toBe('Sample — Fences');
  });

  it('places TPC\'s labels as editable TEXT with TPC\'s text, rotation and size', () => {
    const labels = out.features.filter((f) => f.properties.trvElementKind === 'ELEMENT_LABEL');
    expect(labels).toHaveLength(4);
    const seg = labels.find((f) => f.properties.trvLabelRef === '1|2')!;
    expect(seg.type).toBe('TEXT');
    expect(seg.geometry.textContent).toBe('N 90\u00b000\'00" E 100.00\'');
    expect(seg.properties.fontSize).toBe(8);
    expect(seg.properties.textAlign).toBe('center');
    expect(layerName(seg)).toBe('Sample — Line Labels');
    const area = labels.find((f) => f.properties.trvLabelRole === 'areaLabel')!;
    expect(layerName(area)).toBe('Sample — Lot Areas');
    // The two-layer mode's synthesized area text is replaced by TPC's own.
    expect(out.features.some((f) => f.properties.trvAreaAnnotation)).toBe(false);
    const note = out.features.find((f) => f.properties.trvElementKind === 'ELEMENT_TEXT')!;
    expect(note.geometry.textContent).toContain('LOT 1, BLOCK A');
  });

  it('feature groups follow their traverse\'s layer', () => {
    const lot = out.features.find((f) => f.properties.name === 'LOT 1')!;
    const g = out.featureGroups.find((x) => x.id === lot.featureGroupId)!;
    expect(g.name).toBe('LOT 1');
    expect(g.layerId).toBe(lot.layerId);
  });
});

describe('importTrvFromText — report', () => {
  it('passes layerMode through and counts curves + labels', () => {
    const r = importTrvFromText(SYNTHETIC_TRV, { fileName: 'C:\\jobs\\Sample.TRV', layerMode: 'source' });
    expect(r.pointCount).toBe(7);
    expect(r.renderedElements.curves).toBe(3);
    expect(r.renderedElements.labels).toBe(4);
    expect(formatRenderedElements(r.renderedElements)).toMatch(/3 curve\(s\).*4 Traverse PC label\(s\)/);
    expect(r.mapped.layers[0].name).toBe('Sample — Points');
  });

  it('defaults to the two-layer layout', () => {
    const r = importTrvFromText(SYNTHETIC_TRV, { fileName: 'Sample.trv' });
    expect(r.layerCount).toBe(2);
  });
});
