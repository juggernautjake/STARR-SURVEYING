// __tests__/cad/io/trv-io.test.ts
//
// cad-trv-import-export Slice 4 — high-level import/export helpers
// + source-text locks for the MenuBar wiring.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { importTrvFromText, downloadTrv, formatRenderedElements } from '@/lib/cad/io/trv-io';
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
    // cad-trv-import-polish Slice 3 — mapper now emits exactly
    // TWO synthetic layers per import (Drawing + Points).
    expect(r.layerCount).toBe(2);
    expect(r.pointCount).toBe(1);
    expect(r.traverseCount).toBe(0);
    expect(r.notes).toEqual([]);
    // cad-trv-import-polish Slice 3 — mapper now emits synthetic
    // Drawing + Points layers (no project name in fixture →
    // "TRV Import" prefix).
    expect(r.mapped.layers[0].id).toBe('trv-drawing:trv-import');
    expect(r.mapped.features[0].type).toBe('POINT');
  });

  it('surfaces parser errors + mapping notes in the report', () => {
    const broken = '999,begin\r\n#,POINTS\r\n0,\r\n999,end';
    const r = importTrvFromText(broken);
    // Parser error for the empty point id + a mapping note for any
    // skipped record.
    expect(r.notes.length).toBeGreaterThan(0);
  });

  // cad-trv-drawing-element-rendering Slice 7 — rendered drawing-
  // element counts for the import-confirm dialog.
  it('reports counts of rendered drawing-element geometry + text', () => {
    const withElements = [
      '999,begin', '#,POINTS', '95,2',
      '0,A', '3,0', '4,5,0,0', '2,100,200,0',
      '0,B', '3,0', '4,5,0,0', '2,150,250,0',
      '#,DRAWING',
      '28,4,400,500,450,560,0',            // element line
      '28,30,3,200,100,250,150,300,180',   // element polyline
      '28,5,3304420.64,10711661.37,0,0,4.00,0,0,grass', // world text
      '999,end',
    ].join('\r\n');
    const r = importTrvFromText(withElements);
    expect(r.renderedElements.elementLines).toBe(1);
    expect(r.renderedElements.elementPolylines).toBe(1);
    expect(r.renderedElements.textAnnotations).toBe(1);
    // The element geometry/text must NOT inflate the point/traverse
    // counts the dialog headlines.
    expect(r.pointCount).toBe(2);
    expect(r.traverseCount).toBe(0);
  });
});

describe('formatRenderedElements', () => {
  it('joins the non-zero rendered-element counts', () => {
    expect(formatRenderedElements({ connectorLines: 12, elementPolylines: 11, elementLines: 7, textAnnotations: 56 }))
      .toBe('12 connector line(s), 11 polyline(s), 7 line(s), 56 text label(s)');
  });
  it('returns empty string when nothing rendered', () => {
    expect(formatRenderedElements({ connectorLines: 0, elementPolylines: 0, elementLines: 0, textAnnotations: 0 })).toBe('');
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
    expect(MENUBAR_SRC).toMatch(/import \{ downloadTrv, importTrvFromText, formatRenderedElements, type TrvImportReport \} from '@\/lib\/cad\/io\/trv-io';/);
  });

  it('declares exportTrv() function wired to downloadTrv', () => {
    expect(MENUBAR_SRC).toMatch(/function exportTrv\(\)/);
    expect(MENUBAR_SRC).toMatch(/downloadTrv\(drawingStore\.document\)/);
  });

  it('declares importTrv() that opens a file picker + previews counts', () => {
    expect(MENUBAR_SRC).toMatch(/function importTrv\(\)/);
    expect(MENUBAR_SRC).toMatch(/input\.accept = '\.TRV,\.trv,text\/plain'/);
    // cad-trv-dual-layer-filename Slice 1 — the file name is threaded
    // through so the imported layers are named after the FILE.
    expect(MENUBAR_SRC).toMatch(/importTrvFromText\(text, \{ fileName: file\.name \}\)/);
    // cad-trv-fidelity Slice 13 — the import preview is the Starr-styled
    // confirm modal now, NOT the native window.confirm popup.
    expect(MENUBAR_SRC).toMatch(/import \{ confirmAction(, alertAction)? \} from '\.\/ConfirmDialog';/);
    // Isolate the importTrv() function body.
    const start = MENUBAR_SRC.indexOf('function importTrv()');
    const after = MENUBAR_SRC.slice(start + 'function importTrv()'.length);
    const nextFn = after.indexOf('\n  function ');
    const importFn = nextFn > 0 ? after.slice(0, nextFn) : after;
    expect(importFn).toMatch(/await confirmAction\(\{[\s\S]*?title: 'Import Traverse PC \(\.TRV\)'/);
    // …and no longer uses the native confirm for the import preview.
    expect(importFn).not.toMatch(/window\.confirm\(/);
  });

  it('appends layers + features to the drawing store on confirm', () => {
    expect(MENUBAR_SRC).toMatch(/for \(const l of report\.mapped\.layers\) drawingStore\.addLayer\(l\)/);
    // cad-duplicate-point-handling Slice 4 — features now run
    // through dedupeTrvFeaturesAgainstDrawing before addFeatures
    // so cross-file `:N` collisions resolve automatically.
    expect(MENUBAR_SRC).toMatch(/drawingStore\.addFeatures\(deduped(Open|Import)\.features\)/);
  });

  it('renders "Export as Traverse PC (.TRV)…" + "Import Traverse PC (.TRV)…" menu entries', () => {
    expect(MENUBAR_SRC).toMatch(/label: 'Export as Traverse PC \(\.TRV\)…'/);
    expect(MENUBAR_SRC).toMatch(/label: 'Import Traverse PC \(\.TRV\)…'/);
  });
});
