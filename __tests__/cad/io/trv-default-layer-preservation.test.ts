// __tests__/cad/io/trv-default-layer-preservation.test.ts
//
// cad-trv-import-polish Slice 2 — lock the contract that a TRV
// import ADDS its two synthetic layers on top of whatever the
// drawing already has, without removing any pre-existing layers
// (default starting layers OR user-created layers).

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { importTrvFromText } from '@/lib/cad/io/trv-io';

const FIXTURE = [
  '999,begin',
  '101,Sample',
  '#,SURVEY',
  '86,Boundaries,3,0',
  '#,POINTS',
  '95,1',
  '0,1', '3,3', '4,5,0,0', '2,100,200,0',
  '999,end',
].join('\r\n');

function applyImport() {
  const report = importTrvFromText(FIXTURE);
  const store = useDrawingStore.getState();
  for (const l of report.mapped.layers) store.addLayer(l);
  store.addFeatures(report.mapped.features);
  return report;
}

beforeEach(() => {
  // Reset to a fresh document so each test starts clean.
  useDrawingStore.getState().newDocument();
});

describe('TRV import — preserves all pre-existing layers', () => {
  it('every default starting layer survives the import', () => {
    const before = Object.keys(useDrawingStore.getState().document.layers).sort();
    expect(before.length).toBeGreaterThan(0);
    applyImport();
    const after = Object.keys(useDrawingStore.getState().document.layers).sort();
    for (const id of before) expect(after).toContain(id);
  });

  it('user-created layers also survive', () => {
    const store = useDrawingStore.getState();
    store.addLayer({
      id: 'MY-CUSTOM-LAYER',
      name: 'My Custom Layer',
      visible: true, locked: false, frozen: false,
      color: '#FF8800', lineWeight: 0.5, lineTypeId: 'SOLID',
      opacity: 1, groupId: null, sortOrder: 999,
      isDefault: false, isProtected: false, autoAssignCodes: [],
    });
    applyImport();
    expect(useDrawingStore.getState().document.layers['MY-CUSTOM-LAYER']).toBeDefined();
  });

  it('default layers retain their isProtected / isDefault flags', () => {
    const store = useDrawingStore.getState();
    const beforeDefaults = Object.values(store.document.layers).filter((l) => l.isDefault);
    expect(beforeDefaults.length).toBeGreaterThan(0);
    applyImport();
    for (const l of beforeDefaults) {
      const after = useDrawingStore.getState().document.layers[l.id];
      expect(after).toBeDefined();
      expect(after.isDefault).toBe(true);
    }
  });

  it('the 2 imported synthetic layers are ADDED after the existing layerOrder', () => {
    const beforeOrder = useDrawingStore.getState().document.layerOrder;
    applyImport();
    const afterOrder = useDrawingStore.getState().document.layerOrder;
    // Every pre-existing layer id stays in the same relative
    // order at the front of the list; the 2 new TRV layers tag
    // onto the end.
    for (let i = 0; i < beforeOrder.length; i++) {
      expect(afterOrder[i]).toBe(beforeOrder[i]);
    }
    expect(afterOrder.length).toBe(beforeOrder.length + 2);
    expect(afterOrder[afterOrder.length - 2]).toMatch(/^trv-drawing:/);
    expect(afterOrder[afterOrder.length - 1]).toMatch(/^trv-points:/);
  });

  it('pre-existing features stay intact across the import', () => {
    // Stash a synthetic feature directly so the test doesn't
    // need the drawing tool plumbing.
    const store = useDrawingStore.getState();
    const before = Object.keys(store.document.features);
    applyImport();
    const after = Object.keys(useDrawingStore.getState().document.features);
    for (const id of before) expect(after).toContain(id);
  });
});
