// __tests__/cad/io/trv-model.test.ts
//
// trv-full-support — parse → resolved model: entity counts, true-arc
// geometry, pen-ups, labels, layers, sheets and paper-space filtering,
// on the synthetic fixture (made-up data).

import { describe, it, expect } from 'vitest';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { buildTrvModel, strokeKindForCode, type TrvModelEntity } from '@/lib/cad/io/trv-model';
import { SYNTHETIC_TRV } from './fixtures/trv-synthetic';

const doc = parseTrv(SYNTHETIC_TRV);
const model = buildTrvModel(doc);
const of = <K extends TrvModelEntity['kind']>(kind: K) =>
  model.entities.filter((e): e is Extract<TrvModelEntity, { kind: K }> => e.kind === kind);

describe('TRV model — summary', () => {
  it('counts what Traverse PC plots', () => {
    expect(model.summary).toMatchObject({
      points: 7,        // 99 is a 0,0,0 placeholder
      lines: 6,         // LOT 3 + FENCE 1 + element line + connector
      curves: 3,        // LOT edge 2→3, standalone 4→5, element arc
      shapes: 2,        // LOT 1 + the closed element polygon
      polylines: 2,     // FENCE + leader
      texts: 1,         // the world note
      labels: 4,        // point, segment, element (@25) and area labels
      symbols: 1,
      surveyLayers: 3,
      paperItems: 2,    // title-block text + box
      unknownRecordLines: 1,
    });
    expect(model.scale).toBe(40);
  });

  it('notes the placeholder, the CSV list and the unknown record', () => {
    expect(model.notes.join('\n')).toMatch(/placeholder/);
    expect(model.notes.join('\n')).toMatch(/CSV point-list/);
    expect(model.notes.join('\n')).toMatch(/777×1/);
  });
});

describe('TRV model — traverses become paths with TRUE arcs', () => {
  const lot = of('path').find((p) => p.name === 'LOT 1')!;

  it('closes LOT 1 and keeps TPC\'s own area', () => {
    expect(lot.closed).toBe(true);
    expect(lot.pointIds).toEqual(['1', '2', '3', '4']);
    expect(lot.area).toBeCloseTo(10905.86, 2);
    expect(lot.computedArea).toBeCloseTo(10000 + 5000 * (Math.PI / 3 - Math.sin(Math.PI / 3)), 6);
    expect(lot.trvId).toBe('7');
    expect(lot.bold).toBe(true);
  });

  it('edge 2→3 is an arc: radius 100, centre (5013.397, 5050), Δ 60°, counter-clockwise', () => {
    expect(lot.segments.map((s) => s.kind)).toEqual(['line', 'arc', 'line', 'line']);
    const seg = lot.segments[1];
    if (seg.kind !== 'arc') throw new Error('expected an arc');
    expect(seg.signedRadius).toBe(-100);
    expect(seg.arc.radius).toBe(100);
    expect(seg.arc.center.x).toBeCloseTo(5013.3975, 4);
    expect(seg.arc.center.y).toBeCloseTo(5050, 6);
    expect((seg.arc.delta * 180) / Math.PI).toBeCloseTo(60, 6);
    expect(seg.arc.anticlockwise).toBe(true);
    expect(seg.arc.start).toEqual({ x: 5100, y: 5000 });
    expect(seg.arc.end).toEqual({ x: 5100, y: 5100 });
  });

  it('a pen-up ref leaves its edge undrawn', () => {
    const fence = of('path').find((p) => p.name === 'FENCE')!;
    expect(fence.closed).toBe(false);
    expect(fence.segments.map((s) => s.drawn)).toEqual([true, false]);
  });

  it('construction copies are kept but hidden on their own layer; CSV lists are not drawn', () => {
    const copy = of('path').find((p) => p.name === 'Copy-LOT 1')!;
    expect(copy.hidden).toBe(true);
    expect(copy.layerKey).toBe('construction');
    expect(model.layers.find((l) => l.key === 'construction')!.visible).toBe(false);
    expect(of('path').some((p) => p.name === 'pts.csv')).toBe(false);
  });

  it('draws a #,LINES curve no traverse uses (4→5, R +60, clockwise)', () => {
    const standalone = of('arc').find((a) => a.source === 'lines')!;
    expect(standalone.signedRadius).toBe(60);
    expect(standalone.arc.anticlockwise).toBe(false);
    expect(standalone.arc.center.x).toBeCloseTo(5000 + Math.sqrt(60 * 60 - 50 * 50), 6);
    expect(standalone.arc.center.y).toBeCloseTo(5150, 6);
  });
});

describe('TRV model — drawing elements (primary sheet only)', () => {
  it('element arc 28,8 (E,N order, radius -100) is a true arc on its layer with its line type', () => {
    const arc = of('arc').find((a) => a.source === 'element')!;
    expect(arc.arc.start).toEqual({ x: 5000, y: 5300 });
    expect(arc.arc.center.x).toBeCloseTo(5050, 6);
    expect(arc.arc.center.y).toBeCloseTo(5300 + 50 * Math.sqrt(3), 6);
    expect(arc.layerKey).toBe('dl:30');
    expect(arc.stroke).toBe('dashed');
  });

  it('element line, closed polygon, leader, connector and symbol', () => {
    const line = of('line').find((l) => l.source === 'element')!;
    expect([line.from, line.to]).toEqual([{ x: 5000, y: 5250 }, { x: 5100, y: 5250 }]);
    const poly = of('polyline').find((p) => p.source === 'element')!;
    expect(poly.closed).toBe(true);
    expect(poly.vertices).toHaveLength(4);
    const leader = of('polyline').find((p) => p.source === 'leader')!;
    expect(leader.vertices).toEqual([{ x: 5060, y: 5060 }, { x: 5070, y: 5070 }, { x: 5080, y: 5070 }]);
    const connector = of('line').find((l) => l.source === 'connector')!;
    expect([connector.from, connector.to]).toEqual([{ x: 5100, y: 5100 }, { x: 5000, y: 5200 }]);
    const sym = of('symbol')[0];
    expect([sym.symbolId, sym.pointId, sym.x, sym.y]).toEqual(['18', '3', 5100, 5100]);
    expect(of('point').find((p) => p.id === '3')!.symbolId).toBe('18');
  });

  it('world text keeps its commas, rotation and size; paper-space items are left out', () => {
    const note = of('text').find((t) => t.role === 'note')!;
    expect(note.text).toBe('LOT 1, BLOCK A');
    expect(note.rotationDeg).toBe(45);
    expect(note.sizePt).toBe(12);
    expect(note.height).toBeCloseTo((12 / 72) * 40, 9);
    expect(of('text').some((t) => /EXAMPLE LAND/.test(t.text))).toBe(false);
  });

  it('labels sit where TPC puts them, on TPC\'s layers', () => {
    const pl = of('text').find((t) => t.role === 'pointLabel')!;
    expect(pl.text).toBe('fnd 1/2" IR');
    expect(pl.x).toBeCloseTo(5000 - 0.25 * 40, 9);
    expect(pl.y).toBeCloseTo(5000 + 0.1 * 40, 9);
    expect(pl.layerKey).toBe('dl:2');

    const seg = of('text').find((t) => t.role === 'segmentLabel' && t.ref === '1|2')!;
    expect(seg.text).toBe('N 90°00\'00" E 100.00\'');
    expect(seg.x).toBeCloseTo(5050, 9);
    expect(seg.y).toBeCloseTo(5000 + 0.05 * 40, 9);
    expect(seg.layerKey).toBe('dl:4');

    const onElement = of('text').find((t) => t.ref === '@25')!;
    expect([onElement.x, onElement.y]).toEqual([5050, 5250]);

    const area = of('text').find((t) => t.role === 'areaLabel')!;
    expect(area.text).toBe('10906 SqFt\n0.250 Acres');
    expect(area.x).toBeCloseTo(5050, 6);
    expect(area.y).toBeCloseTo(5050, 6);
    expect(area.layerKey).toBe('dl:6');
    // Sheet B's duplicate is not drawn by default…
    expect(of('text').some((t) => t.text === 'DUPLICATE AREA')).toBe(false);
  });

  it('…but another sheet can be chosen', () => {
    const b = buildTrvModel(doc, { sheetIndex: 1 });
    expect(b.scale).toBe(20);
    expect(b.entities.some((e) => e.kind === 'text' && e.text === 'DUPLICATE AREA')).toBe(true);
    expect(b.entities.some((e) => e.kind === 'arc' && e.source === 'element')).toBe(false);
  });
});

describe('TRV model — layers + bounds', () => {
  it('lists only layers in use, with friendly names, colours and visibility', () => {
    const byKey = new Map(model.layers.map((l) => [l.key, l]));
    expect(byKey.get('points')!.count).toBe(7);
    expect(byKey.get('dl:3')!.name).toBe('Lines');
    expect(byKey.get('dl:3')!.sourceName).toBe('TPCLines');
    expect(byKey.get('dl:2')!.color).toBe('#ff0000');
    expect(byKey.get('dl:6')!.visible).toBe(false);
    expect(byKey.get('dl:30')!.name).toBe('Fences');
    expect(byKey.has('dl:1')).toBe(true); // the symbol
    expect(model.layers.every((l) => l.count > 0)).toBe(true);
  });

  it('fit bounds cover the drawing', () => {
    const b = model.fitBounds!;
    expect(b.minX).toBeLessThanOrEqual(5000);
    expect(b.maxX).toBeGreaterThanOrEqual(5150);
    expect(b.minY).toBeLessThanOrEqual(5000);
    expect(b.maxY).toBeGreaterThanOrEqual(5300);
  });

  it('fit bounds ignore a far-away outlier among many shots', () => {
    const lines = ['#,TRAVERSE PC', '80,24.000', '#,POINTS'];
    for (let i = 0; i < 60; i++) lines.push(`0,${i + 1}`, `2,${5000 + (i % 10) * 10},${5000 + Math.floor(i / 10) * 10},0`);
    lines.push('0,900', '2,90000,90000,0');
    const m = buildTrvModel(parseTrv(lines.join('\n')));
    expect(m.fitBounds!.maxX).toBeLessThan(6000);
    expect(m.bounds!.maxX).toBe(90000);
  });

  it('maps TPC line-type codes to stroke kinds', () => {
    expect(strokeKindForCode(1)).toBe('solid');
    expect(strokeKindForCode(null)).toBe('solid');
    expect(strokeKindForCode(-43)).toBe('fence');
    expect(strokeKindForCode(40)).toBe('dashed');
  });

  it('an empty TRV yields an empty model without throwing', () => {
    const m = buildTrvModel(parseTrv('#,TRAVERSE PC\r\n999,begin\r\n80,24.000\r\n#,POINTS\r\n999,end'));
    expect(m.entities).toEqual([]);
    expect(m.fitBounds).toBeNull();
    expect(m.summary.points).toBe(0);
  });
});
