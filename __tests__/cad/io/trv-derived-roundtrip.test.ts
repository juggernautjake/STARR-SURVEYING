// __tests__/cad/io/trv-derived-roundtrip.test.ts
//
// cad-trv-drawing-element-rendering Slice 5 — consolidating proof
// that the Slice 1-4 DERIVED render echoes (connector lines, element
// polylines / lines, world text) never leak into the TRV export. A
// fresh import → export must stay byte-stable: the verbatim `28`
// drawing-element block is the single source of truth, and derived
// features add no points / traverses.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';
import { parseTrv, serializeTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';
import { drawingToTrv } from '@/lib/cad/io/drawing-to-trv';

const sample = path.join(__dirname, '..', '..', 'fixtures', 'trv', 'hillsboro-nazarene.trv');

function buildDoc(trv: ReturnType<typeof parseTrv>): DrawingDocument {
  const mapped = trvToDrawing(trv);
  const layers: Record<string, Layer> = {};
  for (const l of mapped.layers) layers[l.id] = l;
  const features: Record<string, Feature> = {};
  for (const f of mapped.features) features[f.id] = f;
  return {
    id: 'd', name: '', created: '', modified: '', author: '',
    features, layers, layerOrder: mapped.layers.map((l) => l.id),
    featureGroups: {}, layerGroups: {}, layerGroupOrder: [],
  } as unknown as DrawingDocument;
}

describe.skipIf(!fs.existsSync(sample))('Slice 5 — derived echoes round-trip safely (Hillsboro)', () => {
  const original = fs.readFileSync(sample, 'latin1');
  const trv = parseTrv(original);
  const doc = buildDoc(trv);

  it('the doc actually contains derived render echoes (test is not vacuous)', () => {
    const derived = Object.values(doc.features).filter((f) => f.properties.trvDerived);
    expect(derived.length).toBeGreaterThan(0);
    const kinds = new Set(derived.map((f) => f.properties.trvElementKind));
    expect(kinds.has('ELEMENT_POLYLINE')).toBe(true);
    expect(kinds.has('ELEMENT_LINE')).toBe(true);
    expect(kinds.has('ELEMENT_TEXT')).toBe(true);
  });

  it('serializeTrv re-emits the source byte-for-byte', () => {
    expect(serializeTrv(parseTrv(original))).toBe(original);
  });

  it('smart-merge export (no edits) is byte-equal — derived echoes add no records', () => {
    expect(drawingToTrv(doc, { sourceTrv: trv, applyChanges: true })).toBe(original);
  });

  it('fresh export counts only the real (non-derived, non-mirror) points', () => {
    const out = drawingToTrv(doc);
    const canonical = Object.values(doc.features).filter(
      (f) => f.type === 'POINT' && !f.properties.trvPointMirror && !f.properties.trvDerived,
    ).length;
    expect(out).toMatch(new RegExp(`(^|\\r\\n)95,${canonical}(\\r\\n|$)`));
    // No derived polyline leaked into the traverse section: the fresh
    // export's traverse count equals the real traverse features only.
    const realTraverses = Object.values(doc.features).filter(
      (f) => (f.type === 'POLYLINE' || f.type === 'POLYGON') && !f.properties.trvDerived,
    ).length;
    const emittedTraverseOpeners = (out.match(/(^|\r\n)30,/g) ?? []).length;
    expect(emittedTraverseOpeners).toBe(realTraverses);
  });
});
