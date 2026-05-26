// __tests__/cad/points/derived-points.test.ts — §17b
import { describe, it, expect } from 'vitest';
import { collectDerivedPoints } from '@/lib/cad/points/derived-points';
import { buildPnezdAscii, buildCsvRows } from '@/lib/cad/persistence/export-csv';
import type { DrawingDocument, Feature } from '@/lib/cad/types';

function pt(id: string, name: string, x: number, y: number): Feature {
  return {
    id, type: 'POINT',
    geometry: { type: 'POINT', point: { x, y } },
    layerId: 'BOUNDARY', style: {} as Feature['style'],
    properties: { pointName: name },
  } as Feature;
}
function line(id: string, layerId: string, refs: string[], a: { x: number; y: number }, b: { x: number; y: number }): Feature {
  return {
    id, type: 'LINE',
    geometry: { type: 'LINE', start: a, end: b },
    layerId, style: {} as Feature['style'],
    properties: { pointRefs: JSON.stringify(refs) },
  } as Feature;
}
function doc(fs: Feature[], oN = 0, oE = 0): DrawingDocument {
  const m: Record<string, Feature> = {};
  for (const f of fs) m[f.id] = f;
  return {
    features: m,
    layers: { BOUNDARY: { id: 'BOUNDARY', name: 'Boundary' }, FENCE: { id: 'FENCE', name: 'Fence' } },
    settings: { displayPreferences: { originNorthing: oN, originEasting: oE } },
  } as unknown as DrawingDocument;
}

describe('collectDerivedPoints', () => {
  it('materializes cross-layer :N refs not backed by a POINT feature', () => {
    const A = { x: 10, y: 20 }, B = { x: 110, y: 20 };
    const d = doc([
      pt('a', '255', A.x, A.y), pt('b', '256', B.x, B.y),
      line('L', 'FENCE', ['255:1', '256:1'], A, B),
    ], 1000, 2000);
    const out = collectDerivedPoints(d);
    expect(out.map((p) => p.name).sort()).toEqual(['255:1', '256:1']);
    const p = out.find((x) => x.name === '255:1')!;
    expect(p.northing).toBeCloseTo(1020, 6); // y + originN
    expect(p.easting).toBeCloseTo(2010, 6);  // x + originE
    expect(p.layerId).toBe('FENCE');
  });

  it('materializes minted vertex points (no POINT feature)', () => {
    const d = doc([line('L', 'BOUNDARY', ['300', '301'], { x: 5, y: 5 }, { x: 9, y: 9 })]);
    expect(collectDerivedPoints(d).map((p) => p.name).sort()).toEqual(['300', '301']);
  });

  it('skips refs that already have a POINT feature, and dedupes', () => {
    const A = { x: 0, y: 0 };
    const d = doc([
      pt('a', '255', A.x, A.y),
      line('L1', 'BOUNDARY', ['255', '300'], A, { x: 50, y: 0 }),
      line('L2', 'BOUNDARY', ['300', '301'], { x: 50, y: 0 }, { x: 50, y: 50 }),
    ]);
    // 255 has a POINT feature → skip; 300 appears twice → once; 301 once.
    expect(collectDerivedPoints(d).map((p) => p.name).sort()).toEqual(['300', '301']);
  });
});

describe('export inclusion of derived points (§17b)', () => {
  const A = { x: 10, y: 20 }, B = { x: 110, y: 20 };
  const d = doc([
    pt('a', '255', A.x, A.y), pt('b', '256', B.x, B.y),
    line('L', 'FENCE', ['255:1', '256:1'], A, B),
  ]);

  it('PNEZD includes base + derived :N points', () => {
    const { text } = buildPnezdAscii(d);
    expect(text).toMatch(/(^|\n)255,/);
    expect(text).toMatch(/(^|\n)255:1,/);
    expect(text).toMatch(/(^|\n)256:1,/);
  });

  it('CSV rows include derived points', () => {
    const { rows } = buildCsvRows(d, { flavor: 'simplified' });
    const nums = rows.map((r) => r.pointNo);
    expect(nums).toContain('255');
    expect(nums).toContain('255:1');
    expect(nums).toContain('256:1');
  });
});

describe('collectDerivedPoints — hidden features', () => {
  it('skips hidden linework so its vertex refs are not exported', () => {
    const A = { x: 0, y: 0 }, B = { x: 5, y: 0 };
    const fmap: Record<string, Feature> = {};
    const hiddenLine = {
      id: 'h', type: 'LINE', geometry: { type: 'LINE', start: A, end: B },
      layerId: 'BOUNDARY', style: {} as Feature['style'],
      properties: { pointRefs: JSON.stringify(['400', '401']) }, hidden: true,
    } as Feature;
    fmap['h'] = hiddenLine;
    const d = {
      features: fmap,
      layers: { BOUNDARY: { id: 'BOUNDARY', name: 'B' } },
      settings: { displayPreferences: { originNorthing: 0, originEasting: 0 } },
    } as unknown as DrawingDocument;
    expect(collectDerivedPoints(d)).toHaveLength(0);
  });
});
