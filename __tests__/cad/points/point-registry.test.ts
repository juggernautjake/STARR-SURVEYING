// __tests__/cad/points/point-registry.test.ts
import { describe, it, expect } from 'vitest';
import {
  featureCoords,
  collectExistingNames,
  buildPointRegistry,
  assignNamesForNewFeatures,
  nameDrawnFeature,
} from '@/lib/cad/points/point-registry';
import type { DrawingDocument, Feature } from '@/lib/cad/types';

function pt(id: string, layerId: string, x: number, y: number, name: string): Feature {
  return {
    id,
    type: 'POINT',
    geometry: { type: 'POINT', point: { x, y } },
    layerId,
    style: {} as Feature['style'],
    properties: { pointName: name },
  } as Feature;
}

function line(id: string, layerId: string, a: { x: number; y: number }, b: { x: number; y: number }): Feature {
  return {
    id,
    type: 'LINE',
    geometry: { type: 'LINE', start: a, end: b },
    layerId,
    style: {} as Feature['style'],
    properties: {},
  } as Feature;
}

function doc(features: Feature[]): DrawingDocument {
  const map: Record<string, Feature> = {};
  for (const f of features) map[f.id] = f;
  return { features: map } as unknown as DrawingDocument;
}

describe('featureCoords', () => {
  it('extracts coords per geometry type', () => {
    expect(featureCoords(pt('p', 'L', 1, 2, '1'))).toEqual([{ x: 1, y: 2 }]);
    expect(featureCoords(line('l', 'L', { x: 0, y: 0 }, { x: 5, y: 0 }))).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]);
  });
});

describe('collectExistingNames + buildPointRegistry', () => {
  it('collects POINT names and builds a coord registry', () => {
    const d = doc([pt('a', 'BD', 0, 0, '255'), pt('b', 'BD', 100, 0, '256')]);
    expect(collectExistingNames(d)).toEqual(new Set(['255', '256']));
    const reg = buildPointRegistry(d);
    expect(reg).toHaveLength(2);
    expect(reg[0]).toMatchObject({ name: '255', x: 0, y: 0, layerId: 'BD' });
  });
});

describe('assignNamesForNewFeatures — §8 rules', () => {
  // Two existing boundary points 255 (0,0) and 256 (100,0).
  const base = [pt('a', 'BOUNDARY', 0, 0, '255'), pt('b', 'BOUNDARY', 100, 0, '256')];

  it('reuses both endpoints when the line is on the same layer', () => {
    const lineSame = line('L1', 'BOUNDARY', { x: 0, y: 0 }, { x: 100, y: 0 });
    const d = doc([...base, lineSame]);
    const out = assignNamesForNewFeatures(d, ['L1']);
    expect(out).toEqual([{ featureId: 'L1', kind: 'VERTICES', refs: ['255', '256'] }]);
  });

  it('derives base:1 for a cross-layer line', () => {
    const lineFence = line('L1', 'FENCE', { x: 0, y: 0 }, { x: 100, y: 0 });
    const d = doc([...base, lineFence]);
    const out = assignNamesForNewFeatures(d, ['L1']);
    expect(out).toEqual([{ featureId: 'L1', kind: 'VERTICES', refs: ['255:1', '256:1'] }]);
  });

  it('increments to base:2 when a :1 already exists', () => {
    const existingFence = line('F0', 'FENCE', { x: 0, y: 0 }, { x: 100, y: 0 });
    existingFence.properties = { pointRefs: JSON.stringify(['255:1', '256:1']) };
    const lineFence2 = line('L1', 'FENCE', { x: 0, y: 0 }, { x: 100, y: 0 });
    const d = doc([...base, existingFence, lineFence2]);
    const out = assignNamesForNewFeatures(d, ['L1']);
    expect(out).toEqual([{ featureId: 'L1', kind: 'VERTICES', refs: ['255:2', '256:2'] }]);
  });

  it('mints fresh numbers for novel coordinates', () => {
    const novel = line('L1', 'BOUNDARY', { x: 500, y: 500 }, { x: 600, y: 500 });
    const d = doc([...base, novel]);
    const out = assignNamesForNewFeatures(d, ['L1']);
    expect(out).toEqual([{ featureId: 'L1', kind: 'VERTICES', refs: ['257', '258'] }]);
  });

  it('names a new standalone POINT', () => {
    const p = pt('P1', 'BOUNDARY', 9, 9, ''); // unnamed
    p.properties = {};
    const d = doc([...base, p]);
    const out = assignNamesForNewFeatures(d, ['P1']);
    expect(out).toEqual([{ featureId: 'P1', kind: 'POINT', name: '257' }]);
  });

  it('reuses a shared mint across two new features in one batch', () => {
    // Two new lines that share a brand-new vertex at (500,500): the
    // second should reuse the name minted by the first.
    const l1 = line('L1', 'BOUNDARY', { x: 500, y: 500 }, { x: 600, y: 500 });
    const l2 = line('L2', 'BOUNDARY', { x: 500, y: 500 }, { x: 500, y: 600 });
    const d = doc([...base, l1, l2]);
    const out = assignNamesForNewFeatures(d, ['L1', 'L2']);
    // L1: 257 (500,500), 258 (600,500); L2 reuses 257, mints 259.
    expect(out[0]).toEqual({ featureId: 'L1', kind: 'VERTICES', refs: ['257', '258'] });
    expect(out[1]).toEqual({ featureId: 'L2', kind: 'VERTICES', refs: ['257', '259'] });
  });
});

describe('applyAssignment + nameDrawnFeature', () => {
  const base = [pt('a', 'BOUNDARY', 0, 0, '255'), pt('b', 'BOUNDARY', 100, 0, '256')];

  it('stamps pointRefs on a freshly-drawn cross-layer line', () => {
    const drawn = line('NEW', 'FENCE', { x: 0, y: 0 }, { x: 100, y: 0 });
    const d = doc(base); // drawn not yet added
    const named = nameDrawnFeature(d, drawn);
    expect(named.properties).toMatchObject({ pointRefs: JSON.stringify(['255:1', '256:1']) });
  });

  it('stamps a minted pointName on a new standalone point', () => {
    const drawn = pt('NEW', 'BOUNDARY', 50, 50, '');
    drawn.properties = {};
    const d = doc(base);
    const named = nameDrawnFeature(d, drawn);
    expect(named.properties.pointName).toBe('257');
  });

  it('does not overwrite an already-named point', () => {
    const drawn = pt('NEW', 'BOUNDARY', 50, 50, '999');
    const d = doc(base);
    const named = nameDrawnFeature(d, drawn);
    expect(named.properties.pointName).toBe('999');
  });
})
