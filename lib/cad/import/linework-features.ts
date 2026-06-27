// lib/cad/import/linework-features.ts
//
// Build POLYLINE drawing features from coded survey points + the line
// strings derived from their codes/shot order ("field-to-finish"). The
// resulting features are SEPARATE from the POINT features — deleting a
// line never removes the underlying points. Pure + unit-testable.

import type { Feature, LineString, SurveyPoint } from '../types';
import { generateId } from '../types';
import { DEFAULT_FEATURE_STYLE } from '../constants';

/**
 * Convert line strings into POLYLINE features. `layerFor` resolves the
 * layer each line lands on (e.g. the import target layer, or the layer
 * of the line's first point). Mutates each consumed `LineString.featureId`
 * to point at the feature it produced, mirroring the import pipeline so
 * the point-store linkage stays intact.
 */
export function buildLineworkFeatures(
  points: SurveyPoint[],
  lineStrings: LineString[],
  layerFor: (firstPoint: SurveyPoint) => string,
): Feature[] {
  const pointById = new Map(points.map((p) => [p.id, p]));
  const features: Feature[] = [];

  for (const ls of lineStrings) {
    if (ls.pointIds.length < 2) continue;
    const pts = ls.pointIds
      .map((id) => pointById.get(id))
      .filter((p): p is SurveyPoint => p !== undefined);
    if (pts.length < 2) continue;

    const codeDef = pts[0]?.codeDefinition;
    const feature: Feature = {
      id: generateId(),
      type: 'POLYLINE',
      geometry: {
        type: 'POLYLINE',
        vertices: pts.map((p) => ({ x: p.easting, y: p.northing })),
      },
      layerId: layerFor(pts[0]),
      style: {
        ...DEFAULT_FEATURE_STYLE,
        // Black by default — linework is recoloured deliberately, not tinted
        // by the survey code. (Line weight still follows the code default.)
        color: '#000000',
        lineWeight: codeDef?.defaultLineWeight ?? null,
      },
      properties: {
        lineStringId: ls.id,
        codeBase: ls.codeBase,
        isClosed: String(ls.isClosed),
      },
    };
    ls.featureId = feature.id;
    features.push(feature);
  }

  return features;
}
