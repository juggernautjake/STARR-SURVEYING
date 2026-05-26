// __tests__/cad/ai/selection-digest.test.ts
import { describe, it, expect } from 'vitest';
import { buildSelectionDigest } from '@/lib/cad/ai-engine/drawing-chat';
import type { DrawingDocument, Feature } from '@/lib/cad/types';

const STYLE = {
  color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null,
  symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null,
  labelOffset: { x: 0, y: 0 }, isOverride: false,
} as const;

function doc(features: Record<string, Feature>, origin = { n: 0, e: 0 }): DrawingDocument {
  return {
    id: 'd', name: 'D', created: '', modified: '', author: '',
    features,
    layers: { L: { id: 'L', name: 'BOUNDARY' } } as unknown as DrawingDocument['layers'],
    layerOrder: ['L'], layerGroups: {}, layerGroupOrder: [],
    customSymbols: [], customLineTypes: [], codeStyleOverrides: {},
    globalStyleConfig: {} as DrawingDocument['globalStyleConfig'],
    settings: { displayPreferences: { originNorthing: origin.n, originEasting: origin.e } } as DrawingDocument['settings'],
  } as unknown as DrawingDocument;
}

function pt(id: string, x: number, y: number, props: Record<string, unknown> = {}): Feature {
  return { id, type: 'POINT', geometry: { type: 'POINT', point: { x, y } }, layerId: 'L', style: STYLE, properties: props } as Feature;
}

describe('buildSelectionDigest', () => {
  it('returns an empty digest when nothing is selected', () => {
    const d = buildSelectionDigest(doc({}), []);
    expect(d.count).toBe(0);
    expect(d.items).toHaveLength(0);
    expect(d.truncated).toBe(false);
  });

  it('resolves point number/code/description and northing/easting (with origin)', () => {
    const d = doc(
      { p1: pt('p1', 100, 200, { pointNumber: 12, code: 'IP', description: 'Iron pin', elevation: 350 }) },
      { n: 10000, e: 5000 },
    );
    const dig = buildSelectionDigest(d, ['p1']);
    expect(dig.count).toBe(1);
    expect(dig.items[0]).toMatchObject({
      type: 'POINT', layer: 'BOUNDARY', pointNumber: '12', code: 'IP',
      description: 'Iron pin', northing: 10200, easting: 5100, elevation: 350,
    });
  });

  it('counts by type and ignores ids that are not in the document', () => {
    const d = doc({ p1: pt('p1', 0, 0), p2: pt('p2', 1, 1) });
    const dig = buildSelectionDigest(d, ['p1', 'p2', 'ghost']);
    expect(dig.count).toBe(2);
    expect(dig.byType).toEqual({ POINT: 2 });
  });
});
