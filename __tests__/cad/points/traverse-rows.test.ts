// __tests__/cad/points/traverse-rows.test.ts
import { describe, it, expect } from 'vitest';
import { buildTraverseRows, traverseEditToGeometry } from '@/lib/cad/points/traverse-rows';
import type { DrawingDocument, Feature } from '@/lib/cad/types';

function doc(fs: Feature[], oN = 0, oE = 0): DrawingDocument {
  const m: Record<string, Feature> = {};
  for (const f of fs) m[f.id] = f;
  return {
    features: m,
    settings: { displayPreferences: { originNorthing: oN, originEasting: oE } },
  } as unknown as DrawingDocument;
}

describe('buildTraverseRows', () => {
  it('computes distance + due-east azimuth for a horizontal line', () => {
    // world x = easting, y = northing. Due east = +x → azimuth 90.
    const line = {
      id: 'l', type: 'LINE',
      geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      layerId: 'L1', properties: {},
    } as unknown as Feature;
    const [row] = buildTraverseRows(doc([line]));
    expect(row.kind).toBe('LINE');
    expect(row.distance).toBeCloseTo(100, 6);
    expect(row.azimuth).toBeCloseTo(90, 6);
    expect(row.bearing).toContain('E');
  });

  it('applies the origin to start/end N,E', () => {
    const line = {
      id: 'l', type: 'LINE',
      geometry: { type: 'LINE', start: { x: 10, y: 20 }, end: { x: 10, y: 120 } },
      layerId: 'L1', properties: {},
    } as unknown as Feature;
    const [row] = buildTraverseRows(doc([line], 1000, 2000));
    expect(row.startE).toBeCloseTo(2010, 6);
    expect(row.startN).toBeCloseTo(1020, 6);
    expect(row.azimuth).toBeCloseTo(0, 6); // due north
    expect(row.distance).toBeCloseTo(100, 6);
  });

  it('sums polyline length', () => {
    const pl = {
      id: 'p', type: 'POLYLINE',
      geometry: { type: 'POLYLINE', vertices: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }] },
      layerId: 'L1', properties: {},
    } as unknown as Feature;
    const [row] = buildTraverseRows(doc([pl]));
    expect(row.kind).toBe('POLYLINE');
    expect(row.distance).toBeCloseTo(70, 6); // 30 + 40
  });

  it('computes arc radius / delta / arcLength / chord', () => {
    // Quarter circle radius 100, start angle 0 → end angle pi/2.
    const arc = {
      id: 'a', type: 'ARC',
      geometry: { type: 'ARC', arc: { center: { x: 0, y: 0 }, radius: 100, startAngle: 0, endAngle: Math.PI / 2, anticlockwise: false } },
      layerId: 'L1', properties: {},
    } as unknown as Feature;
    const [row] = buildTraverseRows(doc([arc]));
    expect(row.kind).toBe('ARC');
    expect(row.radius).toBeCloseTo(100, 6);
    expect(row.delta).toBeCloseTo(90, 6);
    expect(row.arcLength).toBeCloseTo((100 * Math.PI) / 2, 6);
    expect(row.chord).toBeCloseTo(2 * 100 * Math.sin(Math.PI / 4), 6);
  });

  it('ignores points and text', () => {
    const pt = { id: 'pt', type: 'POINT', geometry: { type: 'POINT', point: { x: 0, y: 0 } }, layerId: 'L', properties: {} } as unknown as Feature;
    expect(buildTraverseRows(doc([pt]))).toHaveLength(0);
  });
});

describe('traverseEditToGeometry (§10f)', () => {
  const line = {
    id: 'l', type: 'LINE',
    geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }, // due east, 100
    layerId: 'L1', properties: {},
  } as unknown as import('@/lib/cad/types').Feature;

  it('editing distance moves the end along the current azimuth', () => {
    const upd = traverseEditToGeometry(line, 'distance', '250');
    // due east (az 90) → end at x=250, y=0
    expect(upd?.geometry?.end?.x).toBeCloseTo(250, 6);
    expect(upd?.geometry?.end?.y).toBeCloseTo(0, 6);
  });

  it('editing azimuth rotates the end around the start (keeps distance)', () => {
    const upd = traverseEditToGeometry(line, 'azimuth', '0'); // due north, dist 100
    expect(upd?.geometry?.end?.x).toBeCloseTo(0, 6);
    expect(upd?.geometry?.end?.y).toBeCloseTo(100, 6);
  });

  it('editing a quadrant bearing works', () => {
    // N 45°00'00" E → azimuth 45, distance 100.
    const upd = traverseEditToGeometry(line, 'bearing', 'N 45 00 00 E');
    expect(upd?.geometry?.end?.x).toBeCloseTo(100 * Math.sin(Math.PI / 4), 4);
    expect(upd?.geometry?.end?.y).toBeCloseTo(100 * Math.cos(Math.PI / 4), 4);
  });

  it('rejects invalid input and non-lines', () => {
    expect(traverseEditToGeometry(line, 'distance', 'abc')).toBeNull();
    expect(traverseEditToGeometry(line, 'distance', '-5')).toBeNull();
    const poly = { ...line, type: 'POLYLINE' } as typeof line;
    expect(traverseEditToGeometry(poly, 'distance', '50')).toBeNull();
  });
});
