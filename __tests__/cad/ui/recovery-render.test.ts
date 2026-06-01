// __tests__/cad/ui/recovery-render.test.ts
//
// cad-trv-fidelity-recovery Slice 1 — recovering an autosaved document
// must show the page + drawings, not just the layer list. Two failure
// modes are locked here:
//   1. DATA: validateAndMigrateDocument must not drop features /
//      settings (incl. paperOrigin) when restoring an autosave — the
//      autosave is JSON-serialized into IndexedDB, so we round-trip
//      through JSON first to mirror the real path.
//   2. CAMERA: both recovery handlers must reframe via cad:zoomToPaper
//      (robust, content-sized) rather than cad:zoomExtents. A recovered
//      TRV doc's geometry sits at survey coordinates; if the camera
//      stays at the origin default, viewport culling drops every
//      feature + the paper renders off-screen → "nothing renders".

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateAndMigrateDocument } from '@/lib/cad/validate';
import { DEFAULT_DRAWING_SETTINGS } from '@/lib/cad/constants';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';

/** A minimal autosave-shaped document with one polyline at survey
 *  coordinates + a paper positioned over it (what a TRV import yields). */
function trvLikeDoc(): DrawingDocument {
  const layer: Layer = {
    id: 'L1', name: 'Drawing', visible: true, locked: false, frozen: false,
    color: '#000000', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
  } as unknown as Layer;
  const feat: Feature = {
    id: 'F1', type: 'POLYLINE', layerId: 'L1',
    geometry: { type: 'POLYLINE', vertices: [
      { x: 3304371, y: 10711703 }, { x: 3304392, y: 10711703 }, { x: 3304392, y: 10711684 },
    ] },
    style: { color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null,
      symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null,
      labelOffset: { x: 0, y: 0 }, isOverride: false } as unknown as Feature['style'],
    properties: {},
  } as unknown as Feature;
  return {
    id: 'doc-1', name: 'Recovered TRV', created: '', modified: '', author: '',
    features: { F1: feat }, layers: { L1: layer }, layerOrder: ['L1'],
    layerGroups: {}, layerGroupOrder: [], featureGroups: {},
    settings: { ...DEFAULT_DRAWING_SETTINGS, paperOrigin: { x: 3304200, y: 10711600 } },
  } as unknown as DrawingDocument;
}

describe('recovery data path — validateAndMigrateDocument preserves content', () => {
  it('keeps features + paperOrigin after a JSON round-trip (IndexedDB autosave)', () => {
    const original = trvLikeDoc();
    // Mirror the autosave → IndexedDB → readAutosave path.
    const fromStore = JSON.parse(JSON.stringify(original));
    const doc = validateAndMigrateDocument(fromStore);
    expect(Object.keys(doc.features)).toEqual(['F1']);
    expect(doc.features.F1.geometry.vertices).toHaveLength(3);
    expect(doc.layerOrder).toEqual(['L1']);
    // The paper position (which the camera must frame) survives.
    expect(doc.settings.paperOrigin).toEqual({ x: 3304200, y: 10711600 });
  });

  it('reassigns (never discards) a feature whose layer vanished', () => {
    const d = trvLikeDoc();
    (d.features.F1 as { layerId: string }).layerId = 'GONE';
    const doc = validateAndMigrateDocument(JSON.parse(JSON.stringify(d)));
    expect(Object.keys(doc.features)).toEqual(['F1']);
    expect(doc.features.F1.layerId).toBe('L1'); // reassigned to first layer
  });
});

describe('recovery camera — both handlers reframe via cad:zoomToPaper', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', p), 'utf8');
  const CADLAYOUT = read('app/admin/cad/CADLayout.tsx');
  const RECENT = read('app/admin/cad/components/RecentRecoveriesDialog.tsx');

  it('the crash-recovery dialog dispatches cad:zoomToPaper (not zoomExtents)', () => {
    expect(CADLAYOUT).toMatch(/new CustomEvent\('cad:zoomToPaper'\)/);
    // Restore handler: loadDocument then the reframe.
    const restore = CADLAYOUT.slice(CADLAYOUT.indexOf('validateAndMigrateDocument(recoveryPayload.document)'));
    expect(restore).toMatch(/loadDocument/);
    expect(restore.slice(0, 2500)).toMatch(/cad:zoomToPaper/);
  });

  it('the Recent Recoveries dialog dispatches cad:zoomToPaper after loadDocument', () => {
    expect(RECENT).toMatch(/loadDocument\(doc\)/);
    expect(RECENT).toMatch(/new CustomEvent\('cad:zoomToPaper'\)/);
  });
});
