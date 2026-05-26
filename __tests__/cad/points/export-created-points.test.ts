// __tests__/cad/points/export-created-points.test.ts
// §8c — created (auto-named) points are included in CSV/PNEZD exports.
import { describe, it, expect } from 'vitest';
import { buildPnezdAscii, buildCsvRows } from '@/lib/cad/persistence/export-csv';
import type { DrawingDocument, Feature } from '@/lib/cad/types';

function createdPoint(id: string, name: string, x: number, y: number): Feature {
  return {
    id,
    type: 'POINT',
    geometry: { type: 'POINT', point: { x, y } },
    layerId: 'L1',
    style: {} as Feature['style'],
    properties: { pointName: name, code: 'CP' },
  } as Feature;
}

function doc(fs: Feature[]): DrawingDocument {
  const m: Record<string, Feature> = {};
  for (const f of fs) m[f.id] = f;
  return {
    features: m,
    layers: { L1: { id: 'L1', name: 'L1' } },
    settings: { displayPreferences: { originNorthing: 0, originEasting: 0 } },
  } as unknown as DrawingDocument;
}

describe('§8c export inclusion of created points', () => {
  it('PNEZD includes a manually-created, auto-named point', () => {
    const { text, rowCount } = buildPnezdAscii(doc([createdPoint('a', '1', 100, 200)]));
    expect(rowCount).toBe(1);
    // PNEZD = Point, Northing, Easting, ... → name "1", N=200, E=100.
    expect(text).toMatch(/(^|\n)1,/);
    expect(text).toContain('200');
    expect(text).toContain('100');
  });

  it('CSV rows include created points by their assigned name', () => {
    const { rows } = buildCsvRows(doc([createdPoint('a', '7', 10, 20), createdPoint('b', '8', 30, 40)]));
    const nums = rows.map((r) => r.pointNo);
    expect(nums).toContain('7');
    expect(nums).toContain('8');
  });
});
