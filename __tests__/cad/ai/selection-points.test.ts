// __tests__/cad/ai/selection-points.test.ts
//
// Regression guard for the POINT-coordinate extraction the solver
// dialogues rely on. A `.position` typo (the real field is
// `geometry.point`) crashed the Calc Point + Sketch dialogs at
// runtime; these tests pin the contract to the real Feature shape.

import { describe, it, expect } from 'vitest';
import { selectedPoints, collectedPoints } from '@/lib/cad/ai/selection-points';
import type { Feature } from '@/lib/cad/types';

function pointFeature(id: string, x: number, y: number, name?: string): Feature {
  return {
    id,
    type: 'POINT',
    geometry: { type: 'POINT', point: { x, y } },
    layerId: 'layer-1',
    style: {} as Feature['style'],
    properties: name ? { pointName: name } : {},
  };
}

function lineFeature(id: string): Feature {
  return {
    id,
    type: 'LINE',
    geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    layerId: 'layer-1',
    style: {} as Feature['style'],
    properties: {},
  };
}

describe('selectedPoints', () => {
  it('reads coordinates from geometry.point (not .position)', () => {
    const out = selectedPoints([pointFeature('p1', 1000, 2000, 'CP1')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ id: 'p1', name: 'CP1', point: { x: 1000, y: 2000 } });
  });

  it('falls back to an id prefix when pointName is absent', () => {
    const out = selectedPoints([pointFeature('abcdef123456', 5, 6)]);
    expect(out[0].name).toBe('abcdef12');
  });

  it('ignores non-POINT features', () => {
    const out = selectedPoints([pointFeature('p1', 1, 2), lineFeature('l1')]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('p1');
  });

  it('drops POINT features whose point coordinate is missing', () => {
    const broken: Feature = {
      id: 'p1',
      type: 'POINT',
      geometry: { type: 'POINT' }, // no `point`
      layerId: 'layer-1',
      style: {} as Feature['style'],
      properties: {},
    };
    expect(selectedPoints([broken])).toHaveLength(0);
  });
});

describe('collectedPoints', () => {
  it('flattens to { name, x, y } for the Vision prompt', () => {
    const out = collectedPoints([pointFeature('p1', 10, 20, 'A'), pointFeature('p2', 30, 40, 'B')]);
    expect(out).toEqual([
      { name: 'A', x: 10, y: 20 },
      { name: 'B', x: 30, y: 40 },
    ]);
  });
});
