// lib/cad/geometry/area.ts — Area by coordinate (shoelace) method
import type { SurveyPoint, AreaResult } from '../types';

export function computeArea(points: SurveyPoint[]): AreaResult {
  const n = points.length;
  if (n < 3) return { squareFeet: 0, acres: 0, method: 'COORDINATE' };

  let doubleArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    doubleArea += points[i].easting * points[j].northing;
    doubleArea -= points[j].easting * points[i].northing;
  }

  const sqft = Math.abs(doubleArea / 2);
  return {
    squareFeet: sqft,
    acres: sqft / 43560,
    method: 'COORDINATE',
  };
}

export function computeAreaFromPoints2D(points: { x: number; y: number }[]): AreaResult {
  const n = points.length;
  if (n < 3) return { squareFeet: 0, acres: 0, method: 'COORDINATE' };

  let doubleArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    doubleArea += points[i].x * points[j].y;
    doubleArea -= points[j].x * points[i].y;
  }

  const sqft = Math.abs(doubleArea / 2);
  return {
    squareFeet: sqft,
    acres: sqft / 43560,
    method: 'COORDINATE',
  };
}
