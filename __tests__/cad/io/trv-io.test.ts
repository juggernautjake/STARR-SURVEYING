// __tests__/cad/io/trv-io.test.ts
//
// cad-trv-import-export Slice 4 — high-level import/export helpers
// + source-text locks for the MenuBar wiring.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { importTrvFromText, downloadTrv } from '@/lib/cad/io/trv-io';
import type { DrawingDocument } from '@/lib/cad/types';

const FIXTURE = [
  '999,begin',
  '80,26.000',
  '86,Boundaries,3,0',
  '#,POINTS',
  '95,1',
  '0,1',
  '1,corner',
  '3,3',
  '4,5,0,0',
  '2,4994.142075,4999.067,700',
  '999,end',
].join('\r\n');

describe('importTrvFromText', () => {
  it('returns a counts report + the mapped result', () => {
    const r = importTrvFromText(FIXTURE);
    expect(r.layerCount).toBe(1);
    expect(r.pointCount).toBe(1);
    expect(r.traverseCount).toBe(0);
    expect(r.notes).toEqual([]);
    expect(r.mapped.layers[0].id).toBe('trv-layer:3');
    expect(r.mapped.features[0].type).toBe('POINT');
  });

  it('surfaces parser errors + mapping notes in the report', () => {
    const broken = '999,begin\r\n#,POINTS\r\n0,\r\n999,end';
    const r = importTrvFromText(broken);
    // Parser error for the empty point id + a mapping note for any
    // skipped record.
    expect(r.notes.length).toBeGreaterThan(0);
  });
});

describe('downloadTrv', () => {
  function makeDoc(name: string): DrawingDocument {
    return {
      id: 'd', name, created: '', modified: '', author: '',
      features: {}, layers: {}, layerOrder: [],
      featureGroups: {}, layerGroups: {}, layerGroupOrder: [],
    } as unknown as DrawingDocument;
  }

  it('returns the serialized TRV byte size + a filename derived from the doc name', () => {
    const r = downloadTrv(makeDoc('My Project'), { filename: undefined });
    expect(r.filename).toBe('My_Project.TRV');
    expect(r.byteSize).toBeGreaterThan(0);
  });

  it('respects an explicit filename', () => {
    const r = downloadTrv(makeDoc('whatever'), { filename: 'custom.TRV' });
    expect(r.filename).toBe('custom.TRV');
  });

  it('falls back to survey.TRV when the doc name is empty', () => {
    const r = downloadTrv(makeDoc(''));
    expect(r.filename).toBe('survey.TRV');
  });
});

describe('MenuBar — TRV import/export wiring', () => {
  const MENUBAR_SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
    'utf8',
  );

  it('imports downloadTrv + importTrvFromText + TrvImportReport from trv-io', () => {
    expect(MENUBAR_SRC).toMatch(/import \{ downloadTrv, importTrvFromText, type TrvImportReport \} from '@\/lib\/cad\/io\/trv-io';/);
  });

  it('declares exportTrv() function wired to downloadTrv', () => {
    expect(MENUBAR_SRC).toMatch(/function exportTrv\(\)/);
    expect(MENUBAR_SRC).toMatch(/downloadTrv\(drawingStore\.document\)/);
  });

  it('declares importTrv() that opens a file picker + previews counts', () => {
    expect(MENUBAR_SRC).toMatch(/function importTrv\(\)/);
    expect(MENUBAR_SRC).toMatch(/input\.accept = '\.TRV,\.trv,text\/plain'/);
    expect(MENUBAR_SRC).toMatch(/importTrvFromText\(text\)/);
    expect(MENUBAR_SRC).toMatch(/window\.confirm\(/);
  });

  it('appends layers + features to the drawing store on confirm', () => {
    expect(MENUBAR_SRC).toMatch(/for \(const l of report\.mapped\.layers\) drawingStore\.addLayer\(l\)/);
    expect(MENUBAR_SRC).toMatch(/drawingStore\.addFeatures\(report\.mapped\.features\)/);
  });

  it('renders "Export as Traverse PC (.TRV)…" + "Import Traverse PC (.TRV)…" menu entries', () => {
    expect(MENUBAR_SRC).toMatch(/label: 'Export as Traverse PC \(\.TRV\)…'/);
    expect(MENUBAR_SRC).toMatch(/label: 'Import Traverse PC \(\.TRV\)…'/);
  });
});
