// __tests__/cad/points/point-rows.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildPointRows,
  rowToWorldPoint,
  rowEditToFeatureUpdate,
} from '@/lib/cad/points/point-rows';
import type { DrawingDocument, Feature, DrawingSettings } from '@/lib/cad/types';

function pt(id: string, x: number, y: number, props: Record<string, unknown>): Feature {
  return {
    id,
    type: 'POINT',
    geometry: { type: 'POINT', point: { x, y } },
    layerId: 'L1',
    style: {} as Feature['style'],
    properties: props as Feature['properties'],
  } as Feature;
}

function mkDoc(features: Feature[], oN = 0, oE = 0): DrawingDocument {
  const map: Record<string, Feature> = {};
  for (const f of features) map[f.id] = f;
  return {
    features: map,
    settings: { displayPreferences: { originNorthing: oN, originEasting: oE } },
  } as unknown as DrawingDocument;
}

const settings = (oN = 0, oE = 0) =>
  ({ displayPreferences: { originNorthing: oN, originEasting: oE } }) as unknown as DrawingSettings;

describe('buildPointRows', () => {
  it('builds rows from POINT features with origin applied', () => {
    const doc = mkDoc(
      [pt('a', 10, 20, { pointName: '5', code: 'IPF', description: 'iron', elevation: 651 })],
      1000,
      2000,
    );
    const rows = buildPointRows(doc);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'a',
      name: '5',
      northing: 1020, // y + originNorthing
      easting: 2010, // x + originEasting
      elevation: 651,
      code: 'IPF',
      description: 'iron',
      layerId: 'L1',
    });
  });

  it('handles missing elevation as null', () => {
    const doc = mkDoc([pt('a', 0, 0, { pointName: '1' })]);
    expect(buildPointRows(doc)[0].elevation).toBeNull();
  });

  it('ignores non-POINT features', () => {
    const line = { id: 'L', type: 'LINE', geometry: { type: 'LINE' }, layerId: 'L1', properties: {} } as unknown as Feature;
    expect(buildPointRows(mkDoc([line]))).toHaveLength(0);
  });
});

describe('rowToWorldPoint', () => {
  it('inverts the origin offset', () => {
    expect(rowToWorldPoint({ northing: 1020, easting: 2010 }, settings(1000, 2000))).toEqual({
      x: 10,
      y: 20,
    });
  });
});

describe('rowEditToFeatureUpdate', () => {
  const f = pt('a', 10, 20, { pointName: '5', code: 'IPF' });

  it('moves the point when northing changes', () => {
    const upd = rowEditToFeatureUpdate(f, 'northing', '1050', settings(1000, 0));
    expect(upd?.geometry).toMatchObject({ point: { x: 10, y: 50 } });
  });

  it('moves the point when easting changes', () => {
    const upd = rowEditToFeatureUpdate(f, 'easting', '2035', settings(0, 2000));
    expect(upd?.geometry).toMatchObject({ point: { x: 35, y: 20 } });
  });

  it('rejects a non-numeric coordinate', () => {
    expect(rowEditToFeatureUpdate(f, 'northing', 'abc', settings())).toBeNull();
  });

  it('updates code/description/elevation in properties', () => {
    expect(rowEditToFeatureUpdate(f, 'code', 'CP', settings())?.properties).toMatchObject({ code: 'CP' });
    expect(rowEditToFeatureUpdate(f, 'elevation', '700', settings())?.properties).toMatchObject({ elevation: 700 });
  });

  it('clears elevation on empty input', () => {
    const withElev = pt('a', 0, 0, { elevation: 5 });
    const upd = rowEditToFeatureUpdate(withElev, 'elevation', '', settings());
    expect(upd?.properties && 'elevation' in upd.properties).toBe(false);
  });
});
