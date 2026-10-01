// __tests__/cad/io/trv-full-parser.test.ts
//
// trv-full-support — the parser, record family by record family, on the
// hand-written synthetic fixture (made-up data). See docs/cad/trv-format.md.

import { describe, it, expect } from 'vitest';
import { parseTrv, serializeTrv, colorRefToCss, KNOWN_TRV_CODES } from '@/lib/cad/io/trv-parser';
import { SYNTHETIC_TRV } from './fixtures/trv-synthetic';

const doc = parseTrv(SYNTHETIC_TRV);

describe('TRV parser — file + job header', () => {
  it('recognises the file and reads the version records', () => {
    expect(doc.looksLikeTrv).toBe(true);
    expect(doc.version).toBe('99.000');
    expect(doc.header.fullVersion).toBe('99.0.1.2 (01012030)');
  });

  it('reads the job header records (81, 87, 88, 89, 95, 107)', () => {
    expect(doc.header.jobDescription).toBe('Practice Lot Survey 9001');
    expect(doc.header.jobAddress).toBe('100 Example Rd, Sampletown, TX');
    expect(doc.header.surveyor).toBe('A Surveyor');
    expect(doc.header.jobNumber).toBe('9001');
    expect(doc.header.nextPointNumber).toBe('8');
    expect(doc.header.client).toBe('Sample Client, 1 Test St');
  });

  it('keeps the project metadata + projection (90-94, 101-106)', () => {
    expect(doc.metadata.projectName).toBe('Practice Lot');
    expect(doc.metadata.surveyDate).toBe('01-01-2030');
    expect(doc.metadata.units).toBe('0');
    expect(doc.metadata.pointCount).toBe(8);
    expect(doc.projection?.crsName).toBe('Local.crs');
    expect(doc.projection?.ellipsoidName).toBe('GRS 80');
  });

  it('reads survey layers (86) and drawing groups (100)', () => {
    expect(doc.layers.map((l) => [l.id, l.name])).toEqual([['0', 'Un-Assigned'], ['3', 'Boundaries'], ['18', 'Topo']]);
    expect(doc.drawingGroups.map((g) => [g.id, g.name])).toEqual([['0', 'Un-Assigned'], ['4', 'Plats']]);
  });
});

describe('TRV parser — points (0-4)', () => {
  it('reads id, N/E/Z, description, method and the 3-record flags', () => {
    const p2 = doc.points.find((p) => p.id === '2')!;
    expect(p2.north).toBe(5000);
    expect(p2.east).toBe(5100);
    expect(p2.elevation).toBe(100.5);
    expect(p2.description).toBe('set 1/2 IR');
    expect(p2.methodCode).toBe('5');
    const p3 = doc.points.find((p) => p.id === '3')!;
    expect(p3.attrFlags).toBe(4);
    expect(p3.layerId).toBe('4'); // legacy field keeps the raw value
  });

  it('keeps the placeholder 2,0,0,0 point as parsed data', () => {
    const p99 = doc.points.find((p) => p.id === '99')!;
    expect([p99.north, p99.east, p99.elevation]).toEqual([0, 0, 0]);
  });
});

describe('TRV parser — #,LINES curves (20-23)', () => {
  it('reads from / to / flags / signed radius', () => {
    expect(doc.lineEntities.map((l) => [l.fromId, l.toId, l.flags, l.radius])).toEqual([
      ['2', '3', 40, -100],
      ['4', '5', 8, 60],
    ]);
  });
});

describe('TRV parser — traverses (30-76, 10-13)', () => {
  const lot = doc.traverses.find((t) => t.name === 'LOT 1')!;
  const fence = doc.traverses.find((t) => t.name === 'FENCE')!;

  it('reads the traverse id, flags and TPC area (31, 33)', () => {
    expect(lot.trvId).toBe('7');
    expect(lot.flags).toBe(536870914);
    expect(lot.area).toBeCloseTo(10905.86, 2);
  });

  it('keeps one ref per 10 record with its 11 flags, sequence and drawing layer', () => {
    expect(lot.pointIds).toEqual(['1', '2', '3', '4', '1']);
    expect(lot.refs!.map((r) => [r.pointId, r.flags, r.seq, r.drawingLayerId])).toEqual([
      ['1', 8, 1, '3'], ['2', 8, 2, '3'], ['3', 8, 3, '3'], ['4', 8, 4, '3'], ['1', 0, 5, '3'],
    ]);
  });

  it('attaches the 12 curve marker and the 13 COGO record to the ref they follow', () => {
    expect(lot.refs![1].curveMarker).toBe(132);
    expect(lot.refs![2].curveMarker).toBe(134);
    expect(lot.refs![2].cogo?.radius).toBe(100);
    expect(fence.refs![1].cogo).toMatchObject({ flags: 225, distance: 50, azimuthDeg: 90 });
  });

  it('flags a pen-up ref (11 bit 16)', () => {
    expect(fence.refs!.map((r) => r.penUp)).toEqual([false, false, true]);
  });

  it('reads the traverse description (1 inside a traverse)', () => {
    expect(doc.traverses.find((t) => t.name === 'pts.csv')!.description).toBe('D:\\pts.csv');
  });

  it('still captures 31 / 33 / 12 as styling records for the verbatim round-trip', () => {
    const codes = lot.stylingRecords.map((r) => r.code);
    expect(codes).toContain('31');
    expect(codes).toContain('33');
    expect(codes).toContain('12');
  });
});

describe('TRV parser — sheets + drawing layers (28,0 / 29,0,*)', () => {
  it('finds both sheets and picks the one with the most elements as primary', () => {
    expect(doc.sheets.map((s) => s.name)).toEqual(['Sheet A', 'Sheet B']);
    expect(doc.primarySheetIndex).toBe(0);
    expect(doc.sheet?.name).toBe('Sheet A');
  });

  it('reads scale, paper size, extents, centre and fonts', () => {
    const s = doc.sheet!;
    expect(s.scale).toBe(40);
    expect([s.paperWidthIn, s.paperHeightIn]).toEqual([8.5, 11]);
    expect(s.extents).toEqual([4990, 5210, 5160, 4990]);
    expect(s.center).toEqual({ x: 5075, y: 5100 });
    expect(s.fonts).toEqual([{ index: 0, face: 'Arial' }]);
  });

  it('reads drawing layers with visibility, weight and COLORREF colour', () => {
    const byName = new Map(doc.sheet!.layers.map((l) => [l.name, l]));
    expect([...byName.keys()]).toEqual(['0', 'TPCSymbols', 'TPCPointLabels', 'TPCLines', 'TPCLineLabels', 'TPCLotAreas', 'Fences']);
    expect(byName.get('TPCLines')!.color).toBeNull(); // -1 = default ink
    expect(byName.get('TPCPointLabels')!.color).toBe('#ff0000'); // 255 = 0x0000FF → red
    expect(byName.get('TPCLineLabels')!.color).toBe('#0000ff'); // 0xFF0000 → blue
    expect(byName.get('Fences')!.color).toBe('#008000');
    expect(byName.get('Fences')!.lineWeight).toBe(2);
    expect(byName.get('TPCLotAreas')!.visible).toBe(false);
  });

  it('tags every drawing element with its sheet', () => {
    const last = doc.drawingElements[doc.drawingElements.length - 1];
    expect(last.header[0]).toBe('14');
    expect(last.sheetIndex).toBe(1);
    expect(doc.drawingElements.find((e) => e.header[0] === '8')!.sheetIndex).toBe(0);
  });
});

describe('TRV parser — census + robustness', () => {
  it('counts every record code and reports the unknown ones without dropping them', () => {
    expect(doc.recordCounts['0']).toBe(8);
    expect(doc.recordCounts['28']).toBeGreaterThan(10);
    expect(doc.unknownRecords).toEqual([{ code: '777', count: 1, firstLine: expect.any(Number) }]);
    expect(KNOWN_TRV_CODES.has('777')).toBe(false);
    expect(serializeTrv(doc)).toBe(SYNTHETIC_TRV);
  });

  it('accepts a byte-order mark, LF-only and bare-CR line endings', () => {
    const lf = parseTrv('\ufeff' + SYNTHETIC_TRV.replace(/\r\n/g, '\n'));
    const cr = parseTrv(SYNTHETIC_TRV.replace(/\r\n/g, '\r'));
    for (const d of [lf, cr]) {
      expect(d.looksLikeTrv).toBe(true);
      expect(d.points).toHaveLength(8);
      expect(d.traverses).toHaveLength(4);
      expect(d.lineEntities).toHaveLength(2);
    }
  });

  it('never throws on garbage and says it is not a TRV', () => {
    const d = parseTrv('hello,world\n,,,\n28\n29,2\n20,\n23,abc');
    expect(d.looksLikeTrv).toBe(false);
    expect(d.lineEntities).toEqual([]);
    expect(d.errors.length).toBeGreaterThan(0);
  });

  it('decodes COLORREF values', () => {
    expect(colorRefToCss('-1')).toBeNull();
    expect(colorRefToCss('0')).toBe('#000000');
    expect(colorRefToCss(0x00ff00)).toBe('#00ff00');
    expect(colorRefToCss('16777216')).toBeNull();
    expect(colorRefToCss('x')).toBeNull();
  });
});
