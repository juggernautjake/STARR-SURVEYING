// __tests__/cad/io/trv-text-elements.test.ts
//
// cad-trv-drawing-element-rendering Slice 3 — `28,5` WORLD-placed
// text annotations render as TEXT features at their survey coords.
// Paper-space `28,5` (title block) is left for Slice 4.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';
import { drawingToTrv } from '@/lib/cad/io/drawing-to-trv';
import { extractTextElements } from '@/lib/cad/io/trv-drawing-elements';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';

const WORLD = '28,5,3304420.64,10711661.37,0,0,4.00,0,0,grass';
const WORLD_COMMA = '28,5,3304500.00,10711600.00,0,0,5.00,0,0,conc. drive, 6in thick';
const PAPER = '28,5,-1.90,1.60,5,1,14.00,0,6,STARR SURVEYING';

const FIXTURE = [
  '999,begin', '101,Text', '#,POINTS', '95,1',
  '0,1', '3,0', '4,5,0,0', '2,100,200,0',
  '#,DRAWING', WORLD, WORLD_COMMA, PAPER,
  '999,end',
].join('\r\n');

describe('extractTextElements', () => {
  const els = extractTextElements(parseTrv(FIXTURE).drawingElements);

  it('splits WORLD vs PAPER by coordinate magnitude', () => {
    const world = els.filter((e) => e.space === 'WORLD');
    const paper = els.filter((e) => e.space === 'PAPER');
    expect(world.map((e) => e.text)).toEqual(['grass', 'conc. drive, 6in thick']);
    expect(paper.map((e) => e.text)).toEqual(['STARR SURVEYING']);
  });

  it('rejoins comma-containing text + keeps the font size', () => {
    const c = els.find((e) => e.text.startsWith('conc.'))!;
    expect(c.text).toBe('conc. drive, 6in thick');
    expect(c.fontSize).toBe(5);
    expect(c.x).toBe(3304500);
    expect(c.y).toBe(10711600);
  });
});

describe('trvToDrawing — world text → TEXT features', () => {
  const { layers, features } = trvToDrawing(parseTrv(FIXTURE), { layerPrefix: 'X' });
  const drawingLayerId = layers[0].id;

  it('emits a TEXT feature per WORLD annotation, on the Drawing layer', () => {
    const texts = features.filter((f) => f.properties.trvElementKind === 'ELEMENT_TEXT');
    expect(texts).toHaveLength(2); // grass + conc. (PAPER skipped)
    for (const f of texts) {
      expect(f.type).toBe('TEXT');
      expect(f.properties.trvDerived).toBe(true);
      expect(f.layerId).toBe(drawingLayerId);
      expect(typeof f.properties.fontSize).toBe('number');
    }
    const grass = texts.find((f) => f.geometry.textContent === 'grass')!;
    expect(grass.geometry.point).toEqual({ x: 3304420.64, y: 10711661.37 });
  });

  it('does NOT render paper-space title-block text (Slice 4)', () => {
    const texts = features.filter((f) => f.properties.trvElementKind === 'ELEMENT_TEXT');
    expect(texts.some((f) => f.geometry.textContent === 'STARR SURVEYING')).toBe(false);
  });
});

describe('round-trip — TEXT features are not emitted to TRV', () => {
  it('drawingToTrv writes no extra records for derived text', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE), { layerPrefix: 'X' });
    const doc = makeDoc(features);
    const out = drawingToTrv(doc);
    expect(out).toMatch(/(^|\r\n)95,1(\r\n|$)/);
    expect(out.includes('grass')).toBe(false);
  });
});

describe('Hillsboro sample integration', () => {
  const sample = path.join(__dirname, '..', '..', 'fixtures', 'trv', 'hillsboro-nazarene.trv');
  it.skipIf(!fs.existsSync(sample))('renders the world-placed site annotations', () => {
    const { features } = trvToDrawing(parseTrv(fs.readFileSync(sample, 'latin1')));
    const texts = features.filter((f) => f.properties.trvElementKind === 'ELEMENT_TEXT');
    // ~56 world-placed 28,5 annotations in the file.
    expect(texts.length).toBeGreaterThanOrEqual(50);
    expect(texts.some((f) => f.geometry.textContent === 'grass')).toBe(true);
    for (const f of texts) {
      expect(f.type).toBe('TEXT');
      expect(f.geometry.point).toBeDefined();
      expect(String(f.geometry.textContent ?? '').length).toBeGreaterThan(0);
    }
  });
});

function makeDoc(features: Feature[]): DrawingDocument {
  const featureMap: Record<string, Feature> = {};
  for (const f of features) featureMap[f.id] = f;
  return {
    id: 'd', name: '', created: '', modified: '', author: '',
    features: featureMap, layers: {} as Record<string, Layer>, layerOrder: [],
    featureGroups: {}, layerGroups: {}, layerGroupOrder: [],
  } as unknown as DrawingDocument;
}
