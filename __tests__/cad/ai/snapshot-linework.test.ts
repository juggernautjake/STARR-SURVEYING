// __tests__/cad/ai/snapshot-linework.test.ts
import { describe, it, expect } from 'vitest';
import { buildSnapshot } from '@/lib/cad/ai-engine/drawing-chat';
import type { DrawingDocument, Feature } from '@/lib/cad/types';

const STYLE = {
  color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null,
  symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null,
  labelOffset: { x: 0, y: 0 }, isOverride: false,
} as const;

function doc(features: Record<string, Feature>): DrawingDocument {
  return {
    id: 'd', name: 'D', created: '', modified: '', author: '',
    features,
    layers: { L: { id: 'L', name: 'BOUNDARY', color: '#000' } } as unknown as DrawingDocument['layers'],
    layerOrder: ['L'], layerGroups: {}, layerGroupOrder: [],
    customSymbols: [], customLineTypes: [], codeStyleOverrides: {},
    globalStyleConfig: {} as DrawingDocument['globalStyleConfig'],
    settings: { paperSize: 'TABLOID', paperOrientation: 'LANDSCAPE', drawingScale: 50, codeDisplayMode: 'ALPHA', titleBlock: {}, displayPreferences: { originNorthing: 0, originEasting: 0 } } as unknown as DrawingDocument['settings'],
  } as unknown as DrawingDocument;
}

describe('buildSnapshot linework catalog', () => {
  it('catalogs non-point features with id/type/center/area and excludes points', () => {
    const features = {
      g1: { id: 'g1', type: 'POLYGON', geometry: { type: 'POLYGON', vertices: [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      ] }, layerId: 'L', style: STYLE, properties: {} } as unknown as Feature,
      p1: { id: 'p1', type: 'POINT', geometry: { type: 'POINT', point: { x: 5, y: 5 } }, layerId: 'L', style: STYLE, properties: {} } as unknown as Feature,
    };
    const snap = buildSnapshot(doc(features));
    expect(snap.linework).toHaveLength(1);
    expect(snap.linework[0]).toMatchObject({ id: 'g1', type: 'POLYGON', layer: 'BOUNDARY' });
    expect(snap.linework[0].center).toEqual({ n: 5, e: 5 });
    expect(snap.linework[0].areaSqFt).toBe(100);
  });

  it('reports the active layer name when provided', () => {
    const snap = buildSnapshot(doc({}), 'BOUNDARY');
    expect(snap.activeLayer).toBe('BOUNDARY');
    expect(buildSnapshot(doc({})).activeLayer).toBeNull();
  });
});
