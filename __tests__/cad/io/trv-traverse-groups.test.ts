// __tests__/cad/io/trv-traverse-groups.test.ts
//
// cad-trv-fidelity Slice 2 — each TRV traverse imports as a NAMED
// feature group on the Drawing layer (a "sublayer" in the panel), with
// its linework as members. Delivered via feature groups (which the
// LayerPanel already renders nested) rather than a layer-model change,
// so the two synthetic layers + the byte-stable round-trip are intact.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

function twoTraverseTrv(): string {
  return [
    '999,begin', '#,POINTS', '95,3',
    '0,A', '3,0', '4,5,0,0', '2,100,200,0',
    '0,B', '3,0', '4,5,0,0', '2,150,260,0',
    '0,C', '3,0', '4,5,0,0', '2,180,300,0',
    '#,TRAVERSE',
    '30,BOUNDARY', '31,536870914,2,0,0', '10,A', '11,1,0,0,0,0', '10,B', '11,1,1,0,0,0',
    '30,east fence', '31,536870914,3,0,0', '10,B', '11,1,0,0,0,0', '10,C', '11,1,1,0,0,0',
    '999,end',
  ].join('\r\n');
}

describe('trvToDrawing — per-traverse feature groups', () => {
  const { featureGroups, features, layers } = trvToDrawing(parseTrv(twoTraverseTrv()), { layerPrefix: 'X' });
  const drawingLayerId = layers[0].id;

  it('creates one named group per traverse on the Drawing layer', () => {
    expect(featureGroups.map((g) => g.name).sort()).toEqual(['BOUNDARY', 'east fence']);
    for (const g of featureGroups) {
      expect(g.layerId).toBe(drawingLayerId);
      expect(g.featureIds.length).toBeGreaterThan(0);
    }
  });

  it('the two synthetic layers are unchanged (no layer-model change)', () => {
    expect(layers).toHaveLength(2);
    expect(layers[0].id).toMatch(/^trv-drawing:/);
    expect(layers[1].id).toMatch(/^trv-points:/);
  });

  it('each traverse polyline carries its group id', () => {
    const polys = features.filter((f) => f.type === 'POLYLINE' || f.type === 'POLYGON');
    for (const p of polys) {
      expect(typeof p.featureGroupId).toBe('string');
      const g = featureGroups.find((grp) => grp.id === p.featureGroupId);
      expect(g).toBeTruthy();
      expect(g!.featureIds).toContain(p.id);
    }
  });
});

describe('Hillsboro integration', () => {
  const sample = path.join(__dirname, '..', '..', 'fixtures', 'trv', 'hillsboro-nazarene.trv');
  it.skipIf(!fs.existsSync(sample))('groups the traverses by name', () => {
    const { featureGroups } = trvToDrawing(parseTrv(fs.readFileSync(sample, 'latin1')));
    expect(featureGroups.length).toBeGreaterThan(5);
    // Real traverse names from the file.
    const names = featureGroups.map((g) => g.name);
    expect(names).toContain('BOUNDARY');
  });
});
