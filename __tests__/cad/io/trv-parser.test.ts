// __tests__/cad/io/trv-parser.test.ts
//
// cad-trv-import-export Slice 1 — pure parser for Traverse PC .TRV
// files. The fixture below mirrors the structure of a real survey
// export (verified against three live samples) — synthesized here to
// keep the test repo PII-free.

import { describe, it, expect } from 'vitest';
import { parseTrv, serializeTrv } from '@/lib/cad/io/trv-parser';

const SAMPLE = [
  '#,TRAVERSE PC',
  '# Full Version number,26.0.1.5 (05142026)',
  '999,begin',
  '80,26.000',
  '#,SURVEY',
  '83,0',
  '86,Un-Assigned,0,0',
  '86,Alignments,1,0',
  '86,Boundaries,3,0',
  '86,Lots,13,0',
  '90,C:\\Users\\example\\sample.doc',
  '91,-1,1,1,0,,0,,-1,Local.crs,None.pgm,0',
  '92,6378137.0000,0.0033528106812,298.2572221008827,GRS 80,6356752.3141,0.0066943800229',
  '93,1.0000000000,0.0000000000,0.000,0,0',
  '94,15.00,10.00,10.00',
  '101,SAMPLE PROJECT',
  '#,POINTS',
  '95,3',
  '0,1',
  '1,first point',
  '3,2',
  '4,5,0,0',
  '2,4994.142075,4999.0675795,700',
  '0,20fnd',
  '1,fnd 1" IR',
  '3,2',
  '4,5,0,0',
  '2,4999.857,4982.031,700.662',
  '0,21',
  '3,2',
  '4,6,0,0',
  '2,5074.7525488,4928.9940786,701.104',
  '#,TRAVERSE',
  '30,boundary',
  '31,0,3,0,0',
  '10,1',
  '11,1,0,0,3,0',
  '10,20fnd',
  '11,1,1,0,3,0',
  '10,21',
  '11,1,2,0,3,0',
  '999,end',
].join('\r\n');

describe('parseTrv — line preservation', () => {
  it('preserves every source line verbatim in `lines[].raw`', () => {
    const doc = parseTrv(SAMPLE);
    expect(doc.lines.length).toBe(SAMPLE.split('\r\n').length);
    expect(doc.lines.map((l) => l.raw).join('\r\n')).toBe(SAMPLE);
  });

  it('splits code + fields correctly', () => {
    const doc = parseTrv(SAMPLE);
    const versionLine = doc.lines.find((l) => l.code === '80')!;
    expect(versionLine.fields).toEqual(['26.000']);
    const layerLine = doc.lines.find((l) => l.code === '86')!;
    expect(layerLine.fields).toEqual(['Un-Assigned', '0', '0']);
  });

  it('parses comment / section lines with code === "#"', () => {
    const doc = parseTrv(SAMPLE);
    const pointsHeader = doc.lines.find((l) => l.code === '#' && l.fields[0] === 'POINTS');
    expect(pointsHeader).toBeDefined();
  });

  it('accepts LF-only input (not just CRLF)', () => {
    const lf = SAMPLE.replace(/\r\n/g, '\n');
    const doc = parseTrv(lf);
    expect(doc.lines.length).toBe(SAMPLE.split('\r\n').length);
  });
});

describe('parseTrv — interpreted views', () => {
  it('extracts the version from record 80', () => {
    expect(parseTrv(SAMPLE).version).toBe('26.000');
  });

  it('extracts the layer table from record 86', () => {
    const { layers } = parseTrv(SAMPLE);
    expect(layers.map((l) => l.name)).toEqual(['Un-Assigned', 'Alignments', 'Boundaries', 'Lots']);
    expect(layers.map((l) => l.id)).toEqual(['0', '1', '3', '13']);
    expect(layers.every((l) => l.parentId === '0')).toBe(true);
  });

  it('extracts points with id/description/layer/method/coords', () => {
    const { points } = parseTrv(SAMPLE);
    expect(points.length).toBe(3);
    expect(points[0]).toMatchObject({
      id: '1',
      description: 'first point',
      layerId: '2',
      methodCode: '5',
      north: 4994.142075,
      east: 4999.0675795,
      elevation: 700,
    });
    expect(points[1].id).toBe('20fnd');
    expect(points[1].description).toBe('fnd 1" IR');
    expect(points[2].id).toBe('21');
    expect(points[2].description).toBeNull();
  });

  it('extracts the traverse with ordered point references + layer', () => {
    const { traverses } = parseTrv(SAMPLE);
    expect(traverses.length).toBe(1);
    expect(traverses[0]).toMatchObject({
      name: 'boundary',
      pointIds: ['1', '20fnd', '21'],
      layerId: '3',
    });
  });

  it('records section markers in source order', () => {
    const { sections } = parseTrv(SAMPLE);
    const labels = sections.map((s) => s.label);
    expect(labels).toContain('SURVEY');
    expect(labels).toContain('POINTS');
    expect(labels).toContain('TRAVERSE');
  });
});

describe('parseTrv — error tolerance', () => {
  it('captures problems in `errors[]` rather than throwing', () => {
    const broken = ['999,begin', '#,POINTS', '0,', '2,not-a-number,nope,nada', '999,end'].join('\r\n');
    const doc = parseTrv(broken);
    expect(doc.errors.length).toBeGreaterThan(0);
    expect(doc.errors[0]).toMatchObject({ lineIndex: 2 });
  });

  it('coerces non-numeric coords to null without erroring', () => {
    const broken = ['999,begin', '#,POINTS', '0,1', '2,nope,nada,boop', '999,end'].join('\r\n');
    const doc = parseTrv(broken);
    expect(doc.points.length).toBe(1);
    expect(doc.points[0]).toMatchObject({ north: null, east: null, elevation: null });
  });

  it('handles unknown record codes by preserving them in `lines`', () => {
    const exotic = ['999,begin', '99999,future-record,with,fields', '999,end'].join('\r\n');
    const doc = parseTrv(exotic);
    const future = doc.lines.find((l) => l.code === '99999');
    expect(future).toBeDefined();
    expect(future!.fields).toEqual(['future-record', 'with', 'fields']);
  });
});

describe('serializeTrv — verbatim round-trip', () => {
  it('serializeTrv(parseTrv(x)) === x for a clean input', () => {
    expect(serializeTrv(parseTrv(SAMPLE))).toBe(SAMPLE);
  });
});
