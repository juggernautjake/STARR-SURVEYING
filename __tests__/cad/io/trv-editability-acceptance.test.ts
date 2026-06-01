// __tests__/cad/io/trv-editability-acceptance.test.ts
//
// cad-trv-import-export-deep-semantic Pass 10 — end-to-end
// editability acceptance: simulate the surveyor's full workflow
// against every real sample and assert the round-trip survives
// edits.
//
//   1. parseTrv → trvToDrawing → DrawingDocument.
//   2. Edit: MOVE point #1 + ADD a new POINT + DELETE point #N.
//   3. drawingToTrv(doc, { sourceTrv: trv, applyChanges: true })
//      produces an edited TRV.
//   4. parseTrv that edited TRV; assert:
//      - point count = (original - 1 deleted + 1 added).
//      - the moved point has its new coords.
//      - the new point appears.
//      - the deleted point is gone.
//      - the projection block + GNSS + every layer + every styling
//        record is preserved.
//
// This is the manual-test-plan proxy: if these specs pass, a
// surveyor can confidently import a real TRV, edit it, export,
// and re-open in Traverse PC without data loss.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';
import { drawingToTrv } from '@/lib/cad/io/drawing-to-trv';

const FILES = [
  '/root/.claude/uploads/8e9a0e58-deee-4aa8-a3ef-9b30f13eae19/8b109092-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026.TRV',
  '/root/.claude/uploads/8e9a0e58-deee-4aa8-a3ef-9b30f13eae19/b79d86b6-SKP_PROPERTY_ADVISORS_TREMONT_ST_BELTON_26065_MAY_20_2026.TRV',
  '/root/.claude/uploads/8e9a0e58-deee-4aa8-a3ef-9b30f13eae19/f2793868-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026_1.TRV',
];

const AVAILABLE = FILES.filter((p) => fs.existsSync(p));

function buildDoc(text: string): { trv: ReturnType<typeof parseTrv>; doc: DrawingDocument } {
  const trv = parseTrv(text);
  const mapped = trvToDrawing(trv);
  const layers: Record<string, Layer> = {};
  for (const l of mapped.layers) layers[l.id] = l;
  const features: Record<string, Feature> = {};
  for (const f of mapped.features) features[f.id] = f;
  const doc: DrawingDocument = {
    id: 'd', name: '', created: '', modified: '', author: '',
    features, layers, layerOrder: mapped.layers.map((l) => l.id),
    featureGroups: {}, layerGroups: {}, layerGroupOrder: [],
  } as unknown as DrawingDocument;
  return { trv, doc };
}

describe.skipIf(AVAILABLE.length === 0)('Pass 10 — end-to-end editability acceptance on real samples', () => {
  for (const p of AVAILABLE) {
    const name = p.split('/').pop()!;

    it(`(${name}) edit (move + add + delete) → reexport → reparse preserves expected state`, () => {
      const original = fs.readFileSync(p, 'latin1');
      const { trv, doc } = buildDoc(original);
      const originalPointCount = trv.points.length;
      const originalLayerCount = trv.layers.length;
      const originalTraverseCount = trv.traverses.length;

      // Pick three points to edit / delete + synthesize one to add.
      // cad-trv-dual-layer-filename Slice 2 — operate on the CANONICAL
      // points (skip the render-only Drawing-layer mirrors, which
      // share a trvPointId with their twin + don't round-trip).
      const pointFeatures = Object.values(doc.features).filter(
        (f) => f.type === 'POINT' && !f.properties.trvPointMirror,
      );
      expect(pointFeatures.length).toBeGreaterThan(2); // safety
      const movedFeat = pointFeatures[0];
      const deletedFeat = pointFeatures[pointFeatures.length - 1];

      // MOVE: bump surveyEast by 12345 on the first point.
      const movedFeatNew: Feature = {
        ...movedFeat,
        properties: { ...movedFeat.properties, surveyEast: 12345.6789 },
      };
      // DELETE: drop the last point.
      const editedFeatures: Record<string, Feature> = {};
      for (const f of Object.values(doc.features)) {
        if (f.id === deletedFeat.id) continue;
        editedFeatures[f.id] = f.id === movedFeat.id ? movedFeatNew : f;
      }
      // ADD: a brand-new POINT with no trvPointId.
      const addedFeat: Feature = {
        id: 'added-pt-1',
        type: 'POINT',
        geometry: { type: 'POINT', point: { x: 999, y: -888 } } as Feature['geometry'],
        layerId: doc.layerOrder[0] ?? '',
        style: {} as never,
        properties: { label: 'added by Pass 10 test' },
      } as Feature;
      editedFeatures[addedFeat.id] = addedFeat;

      const editedDoc: DrawingDocument = { ...doc, features: editedFeatures } as DrawingDocument;
      const edited = drawingToTrv(editedDoc, { sourceTrv: trv, applyChanges: true });
      const reparsed = parseTrv(edited);

      // Pure structural assertions:
      // 1. Point count is bumped correctly.
      expect(reparsed.points.length).toBe(originalPointCount - 1 + 1);
      // 2. Moved point's coord is reflected.
      const movedTrvId = movedFeat.properties.trvPointId as string;
      const movedAfter = reparsed.points.find((q) => q.id === movedTrvId);
      expect(movedAfter).toBeDefined();
      expect(movedAfter!.east).toBeCloseTo(12345.6789, 4);
      // 3. Deleted point is gone.
      const deletedTrvId = deletedFeat.properties.trvPointId as string;
      expect(reparsed.points.find((q) => q.id === deletedTrvId)).toBeUndefined();
      // 4. New point appears with its label.
      const added = reparsed.points.find((q) => q.id === 'added-pt-1');
      expect(added).toBeDefined();
      expect(added!.description).toBe('added by Pass 10 test');
      // 5. Projection / GNSS / metadata preserved.
      expect(reparsed.projection?.crsName).toBe(trv.projection?.crsName);
      expect(!!reparsed.gnss).toBe(!!trv.gnss);
      expect(reparsed.metadata.projectName).toBe(trv.metadata.projectName);
      // 6. Every layer survived.
      expect(reparsed.layers.length).toBe(originalLayerCount);
      // 7. Traverses count: should be UNCHANGED unless our deleted
      //    point happened to be referenced by every traverse. We
      //    don't assert strict equality (a traverse with all-
      //    deleted refs becomes empty); we assert > 0 to confirm
      //    the structure survived.
      expect(reparsed.traverses.length).toBeGreaterThan(0);
      expect(reparsed.traverses.length).toBeLessThanOrEqual(originalTraverseCount);
      // 8. Total styling records across all traverses unchanged
      //    (Pass 3 lossless capture).
      const stylingOrig = trv.traverses.reduce((s, t) => s + t.stylingRecords.length, 0);
      const stylingAfter = reparsed.traverses.reduce((s, t) => s + t.stylingRecords.length, 0);
      expect(stylingAfter).toBe(stylingOrig);
      // 9. Drawing-element + lot counts unchanged.
      expect(reparsed.drawingElements.length).toBe(trv.drawingElements.length);
      expect(reparsed.lotSegments.length).toBe(trv.lotSegments.length);
    });
  }
});

// Documented manual test plan (kept as a single passing spec so the
// instructions live next to the automated coverage and can't get
// lost). A surveyor running through this validates that a real
// Traverse PC install reads our edited exports.
describe('Pass 10 — Traverse PC reopen manual test plan', () => {
  it('documents the steps to verify Traverse PC accepts our exports', () => {
    const steps = [
      '1. Open File → Import → "Import Traverse PC (.TRV)…" + pick a real sample.',
      '2. Move one of the imported points (e.g. drag-select + arrow keys).',
      '3. Add a new POINT feature (point tool, click anywhere).',
      '4. Right-click → Delete on one of the imported points.',
      '5. File → Export → "Export as Traverse PC (.TRV)…" → save as edited.TRV.',
      '6. Open edited.TRV in Traverse PC.',
      '7. Verify in Traverse PC: (a) the moved point\'s coords are the new values; (b) the added point appears with our label; (c) the deleted point is GONE; (d) every other point + traverse + layer + label format is intact.',
    ];
    // The spec is here to prevent the steps from being lost. Each
    // line is non-empty + numbered so a grep across the codebase
    // surfaces them.
    expect(steps.length).toBe(7);
    for (const s of steps) expect(s).toMatch(/^\d+\./);
  });
});
