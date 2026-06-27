// __tests__/cad/import/linework-features.test.ts
import { describe, it, expect } from 'vitest';
import { buildLineworkFeatures } from '@/lib/cad/import/linework-features';
import type { LineString, SurveyPoint } from '@/lib/cad/types';

function pt(id: string, e: number, n: number, layerId = 'MISC'): SurveyPoint {
  return {
    id, easting: e, northing: n, layerId,
    codeDefinition: { defaultColor: '#00ff00', defaultLineWeight: 0.7 },
  } as unknown as SurveyPoint;
}
function ls(id: string, pointIds: string[], codeBase = 'FN', isClosed = false): LineString {
  return { id, codeBase, pointIds, isClosed, segments: [], featureId: null } as LineString;
}

describe('buildLineworkFeatures', () => {
  it('builds a separate POLYLINE feature per line string at the points’ coords', () => {
    const points = [pt('a', 10, 20), pt('b', 110, 20), pt('c', 110, 90)];
    const strings = [ls('L1', ['a', 'b', 'c'], 'FN')];
    const feats = buildLineworkFeatures(points, strings, () => 'FENCE');

    expect(feats).toHaveLength(1);
    const f = feats[0];
    expect(f.type).toBe('POLYLINE');
    expect(f.layerId).toBe('FENCE');
    expect(f.geometry.vertices).toEqual([
      { x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 90 },
    ]);
    // Carries linkage metadata. Linework imports BLACK by default (no longer
    // tinted by the survey code); line weight still follows the code default.
    expect(f.properties?.lineStringId).toBe('L1');
    expect(f.properties?.codeBase).toBe('FN');
    expect(f.style.color).toBe('#000000');
    expect(f.style.lineWeight).toBe(0.7);
    // The line is its OWN feature (distinct from any point) — deletable
    // without touching the points.
    expect(f.id).toBeTruthy();
    // Linkage is written back onto the line string.
    expect(strings[0].featureId).toBe(f.id);
  });

  it('skips line strings with fewer than two resolvable points', () => {
    const points = [pt('a', 0, 0)];
    const strings = [ls('L1', ['a']), ls('L2', ['a', 'missing'])];
    expect(buildLineworkFeatures(points, strings, () => 'MISC')).toHaveLength(0);
  });

  it('resolves the layer from the first point of each line', () => {
    const points = [pt('a', 0, 0, 'BOUNDARY'), pt('b', 5, 5, 'BOUNDARY')];
    const feats = buildLineworkFeatures(points, [ls('L1', ['a', 'b'])], (p) => p.layerId);
    expect(feats[0].layerId).toBe('BOUNDARY');
  });
});
