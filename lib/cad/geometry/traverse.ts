// lib/cad/geometry/traverse.ts — Traverse management
import type { Traverse, TraverseLeg } from '../types';
import type { SurveyPoint } from '../types';
import { generateId } from '../types';
import { inverseBearingDistance } from './bearing';
import { computeClosure } from './closure';
import { computeArea } from './area';

export function createTraverse(
  pointIds: string[],
  points: Map<string, SurveyPoint>,
  isClosed: boolean,
  name?: string,
): Traverse {
  const legs: TraverseLeg[] = [];

  for (let i = 0; i < pointIds.length - 1; i++) {
    const from = points.get(pointIds[i]);
    const to = points.get(pointIds[i + 1]);
    if (!from || !to) continue;

    const inv = inverseBearingDistance(
      { x: from.easting, y: from.northing },
      { x: to.easting, y: to.northing },
    );
    legs.push({
      fromPointId: pointIds[i],
      toPointId: pointIds[i + 1],
      bearing: inv.azimuth,
      distance: inv.distance,
      deltaNorth: to.northing - from.northing,
      deltaEast: to.easting - from.easting,
      isArc: false,
      curveData: null,
    });
  }

  if (isClosed && pointIds.length > 2) {
    const from = points.get(pointIds[pointIds.length - 1]);
    const to = points.get(pointIds[0]);
    if (from && to) {
      const inv = inverseBearingDistance(
        { x: from.easting, y: from.northing },
        { x: to.easting, y: to.northing },
      );
      legs.push({
        fromPointId: pointIds[pointIds.length - 1],
        toPointId: pointIds[0],
        bearing: inv.azimuth,
        distance: inv.distance,
        deltaNorth: to.northing - from.northing,
        deltaEast: to.easting - from.easting,
        isArc: false,
        curveData: null,
      });
    }
  }

  const traverse: Traverse = {
    id: generateId(),
    name: name ?? 'Traverse 1',
    pointIds,
    isClosed,
    legs,
    closure: null,
    adjustedPoints: null,
    adjustmentMethod: null,
    area: null,
  };

  if (isClosed && legs.length > 0) {
    traverse.closure = computeClosure(traverse);
    const surveyPts = pointIds.map(id => points.get(id)).filter(Boolean) as SurveyPoint[];
    traverse.area = computeArea(surveyPts);
  }

  return traverse;
}
