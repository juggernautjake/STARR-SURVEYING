// __tests__/cad/io/trv-real-roundtrip.test.ts
//
// cad-trv-import-export Pass 5 — bidirectional round-trip
// verification against the live samples. Three round-trip flavors,
// each driven by ALL three uploaded TRV files:
//
//   A. Verbatim re-emission via serializeTrv → byte-equal to input.
//   B. Verbatim sourceTrv passthrough via
//      drawingToTrv(doc, { sourceTrv }) → byte-equal to input.
//   C. Smart-merge with no edits via
//      drawingToTrv(doc, { sourceTrv, applyChanges: true }) →
//      byte-equal to input (proves nothing spurious gets rewritten).
//
// The samples are real Traverse PC exports kept outside the repo
// (PII reasons). The tests skip silently when the upload directory
// isn't present so CI on a fresh checkout still passes.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';
import { parseTrv, serializeTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';
import { drawingToTrv } from '@/lib/cad/io/drawing-to-trv';

const FILES = [
  '/root/.claude/uploads/8e9a0e58-deee-4aa8-a3ef-9b30f13eae19/8b109092-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026.TRV',
  '/root/.claude/uploads/8e9a0e58-deee-4aa8-a3ef-9b30f13eae19/b79d86b6-SKP_PROPERTY_ADVISORS_TREMONT_ST_BELTON_26065_MAY_20_2026.TRV',
  '/root/.claude/uploads/8e9a0e58-deee-4aa8-a3ef-9b30f13eae19/f2793868-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026_1.TRV',
];

const AVAILABLE = FILES.filter((p) => fs.existsSync(p));

function buildDocFromTrv(trv: ReturnType<typeof parseTrv>): DrawingDocument {
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

describe.skipIf(AVAILABLE.length === 0)('Pass 5 — real-sample bidirectional round-trip', () => {
  for (const p of AVAILABLE) {
    const name = p.split('/').pop();

    it(`(A) serializeTrv re-emits ${name} byte-for-byte`, () => {
      const original = fs.readFileSync(p, 'latin1');
      expect(serializeTrv(parseTrv(original))).toBe(original);
    });

    it(`(B) drawingToTrv verbatim sourceTrv passthrough = ${name}`, () => {
      const original = fs.readFileSync(p, 'latin1');
      const trv = parseTrv(original);
      const doc = buildDocFromTrv(trv);
      expect(drawingToTrv(doc, { sourceTrv: trv })).toBe(original);
    });

    it(`(C) drawingToTrv smart-merge with no edits = ${name}`, () => {
      const original = fs.readFileSync(p, 'latin1');
      const trv = parseTrv(original);
      const doc = buildDocFromTrv(trv);
      expect(drawingToTrv(doc, { sourceTrv: trv, applyChanges: true })).toBe(original);
    });
  }
});
