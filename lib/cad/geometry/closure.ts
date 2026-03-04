// lib/cad/geometry/closure.ts — Closure calculation + Bowditch adjustment
import type { Traverse, ClosureResult } from '../types';
import type { Point2D } from '../types';

export function computeClosure(traverse: Traverse): ClosureResult {
  let sumNorth = 0, sumEast = 0, totalDist = 0;

  for (const leg of traverse.legs) {
    sumNorth += leg.deltaNorth;
    sumEast += leg.deltaEast;
    totalDist += leg.distance;
  }

  const linearError = Math.sqrt(sumNorth * sumNorth + sumEast * sumEast);
  let errorBearing = Math.atan2(sumEast, sumNorth) * (180 / Math.PI);
  if (errorBearing < 0) errorBearing += 360;

  const precisionDenominator = linearError > 0 ? Math.round(totalDist / linearError) : Infinity;
  const precisionRatio = linearError > 0
    ? `1:${precisionDenominator.toLocaleString()}`
    : '1:∞ (perfect)';

  const n = traverse.legs.length;
  let angularSum = 0;
  for (let i = 0; i < n; i++) {
    const bearIn = traverse.legs[i].bearing;
    const bearOut = traverse.legs[(i + 1) % n].bearing;
    let angle = bearOut - bearIn + 180;
    if (angle < 0) angle += 360;
    if (angle > 360) angle -= 360;
    angularSum += angle;
  }
  const expectedAngular = (n - 2) * 180;
  const angularError = (angularSum - expectedAngular) * 3600;

  return {
    linearError,
    errorNorth: sumNorth,
    errorEast: sumEast,
    errorBearing,
    angularError,
    precisionRatio,
    precisionDenominator,
    totalDistance: totalDist,
  };
}

export function bowditchAdjustment(traverse: Traverse): Point2D[] {
  const closure = traverse.closure ?? computeClosure(traverse);
  const totalDist = closure.totalDistance;
  if (totalDist === 0) return traverse.legs.map(() => ({ x: 0, y: 0 }));

  const correctedPoints: Point2D[] = [];
  let cumDist = 0;

  correctedPoints.push({ x: 0, y: 0 });

  for (let i = 0; i < traverse.legs.length; i++) {
    cumDist += traverse.legs[i].distance;
    const ratio = cumDist / totalDist;

    correctedPoints.push({
      x: -closure.errorEast * ratio,
      y: -closure.errorNorth * ratio,
    });
  }

  return correctedPoints;
}

export function transitAdjustment(traverse: Traverse): Point2D[] {
  const closure = traverse.closure ?? computeClosure(traverse);
  const totalAbsN = traverse.legs.reduce((s, l) => s + Math.abs(l.deltaNorth), 0);
  const totalAbsE = traverse.legs.reduce((s, l) => s + Math.abs(l.deltaEast), 0);

  const correctedPoints: Point2D[] = [{ x: 0, y: 0 }];
  let cumAbsN = 0, cumAbsE = 0;

  for (let i = 0; i < traverse.legs.length; i++) {
    cumAbsN += Math.abs(traverse.legs[i].deltaNorth);
    cumAbsE += Math.abs(traverse.legs[i].deltaEast);

    correctedPoints.push({
      x: totalAbsE > 0 ? -closure.errorEast * (cumAbsE / totalAbsE) : 0,
      y: totalAbsN > 0 ? -closure.errorNorth * (cumAbsN / totalAbsN) : 0,
    });
  }

  return correctedPoints;
}
