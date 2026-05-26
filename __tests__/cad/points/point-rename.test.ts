// __tests__/cad/points/point-rename.test.ts
import { describe, it, expect } from 'vitest';
import {
  findNameReferences,
  planRename,
  planDuplicate,
  nameIsTaken,
} from '@/lib/cad/points/point-rename';
import type { DrawingDocument, Feature } from '@/lib/cad/types';

function pt(id: string, name: string, layerId = 'BOUNDARY'): Feature {
  return {
    id,
    type: 'POINT',
    geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    layerId,
    style: {} as Feature['style'],
    properties: { pointName: name },
  } as Feature;
}
function lineRefs(id: string, refs: string[], layerId = 'FENCE'): Feature {
  return {
    id,
    type: 'LINE',
    geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    layerId,
    style: {} as Feature['style'],
    properties: { pointRefs: JSON.stringify(refs) },
  } as Feature;
}
function doc(fs: Feature[]): DrawingDocument {
  const m: Record<string, Feature> = {};
  for (const f of fs) m[f.id] = f;
  return { features: m } as unknown as DrawingDocument;
}

describe('findNameReferences', () => {
  it('reports the point feature, referencing linework, and derivatives', () => {
    const d = doc([
      pt('p', '255'),
      lineRefs('l1', ['255', '256']),
      lineRefs('l2', ['255:1', '256:1']),
      lineRefs('l3', ['300', '301']),
    ]);
    const r = findNameReferences(d, '255');
    expect(r.pointFeatureIds).toEqual(['p']);
    expect(r.linework.map((x) => x.featureId).sort()).toEqual(['l1', 'l2']);
    expect(r.derivatives).toEqual(['255:1']);
  });
});

describe('planRename', () => {
  it('renames the point and updates exact + derivative refs', () => {
    const d = doc([pt('p', '255'), lineRefs('l1', ['255', '256']), lineRefs('l2', ['255:1', '256:1'])]);
    const updates = planRename(d, '255', '900');
    const byId = Object.fromEntries(updates.map((u) => [u.featureId, u.properties]));
    expect(byId['p'].pointName).toBe('900');
    expect(byId['l1'].pointRefs).toBe(JSON.stringify(['900', '256']));
    expect(byId['l2'].pointRefs).toBe(JSON.stringify(['900:1', '256:1']));
  });

  it('does not touch unrelated features', () => {
    const d = doc([pt('p', '255'), lineRefs('l3', ['300', '301'])]);
    const updates = planRename(d, '255', '900');
    expect(updates.map((u) => u.featureId)).toEqual(['p']);
  });
});

describe('planDuplicate', () => {
  it('clones a point with a new id and name, leaving the original', () => {
    const d = doc([pt('p', '255')]);
    const dup = planDuplicate(d, 'p', '255B');
    expect(dup).not.toBeNull();
    expect(dup!.id).not.toBe('p');
    expect(dup!.properties.pointName).toBe('255B');
    expect(d.features['p'].properties.pointName).toBe('255'); // original intact
  });
  it('returns null for a non-point source', () => {
    const d = doc([lineRefs('l1', ['1', '2'])]);
    expect(planDuplicate(d, 'l1', 'X')).toBeNull();
  });
});

describe('nameIsTaken', () => {
  it('detects an existing point name', () => {
    const d = doc([pt('p', '255'), pt('q', '256')]);
    expect(nameIsTaken(d, '256')).toBe(true);
    expect(nameIsTaken(d, '256', 'q')).toBe(false); // exclude self
    expect(nameIsTaken(d, '999')).toBe(false);
  });
});
