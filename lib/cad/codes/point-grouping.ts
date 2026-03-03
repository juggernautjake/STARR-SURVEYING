// lib/cad/codes/point-grouping.ts
import type { SurveyPoint, PointGroup } from '../types';

const DELTA_WARNING_THRESHOLD = 0.10;

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function groupPointsByBaseName(points: SurveyPoint[]): Map<number, PointGroup> {
  const groups = new Map<number, PointGroup>();

  for (const pt of points) {
    const base = pt.parsedName.baseNumber;
    if (base === 0) continue;

    if (!groups.has(base)) {
      groups.set(base, {
        baseNumber: base,
        allPoints: [],
        calculated: [],
        found: null,
        set: null,
        none: [],
        finalPoint: pt,
        finalSource: 'NONE',
        calcSetDelta: null,
        calcFoundDelta: null,
        hasBothCalcAndField: false,
        deltaWarning: false,
      });
    }

    const group = groups.get(base)!;
    group.allPoints.push(pt);

    switch (pt.parsedName.normalizedSuffix) {
      case 'CALCULATED': group.calculated.push(pt); break;
      case 'FOUND': group.found = pt; break;
      case 'SET': group.set = pt; break;
      case 'NONE': group.none.push(pt); break;
    }
  }

  for (const group of groups.values()) {
    group.calculated.sort((a, b) => b.parsedName.recalcSequence - a.parsedName.recalcSequence);

    if (group.set) {
      group.finalPoint = group.set;
      group.finalSource = 'SET';
    } else if (group.found) {
      group.finalPoint = group.found;
      group.finalSource = 'FOUND';
    } else if (group.calculated.length > 0) {
      group.finalPoint = group.calculated[0];
      group.finalSource = 'CALCULATED';
    } else if (group.none.length > 0) {
      group.finalPoint = group.none[0];
      group.finalSource = 'NONE';
    }

    const latestCalc = group.calculated.length > 0 ? group.calculated[0] : null;

    if (latestCalc && group.set) {
      group.calcSetDelta = distance(
        { x: latestCalc.easting, y: latestCalc.northing },
        { x: group.set.easting, y: group.set.northing },
      );
      group.hasBothCalcAndField = true;
    }

    if (latestCalc && group.found) {
      group.calcFoundDelta = distance(
        { x: latestCalc.easting, y: latestCalc.northing },
        { x: group.found.easting, y: group.found.northing },
      );
      group.hasBothCalcAndField = true;
    }

    group.deltaWarning =
      (group.calcSetDelta !== null && group.calcSetDelta > DELTA_WARNING_THRESHOLD) ||
      (group.calcFoundDelta !== null && group.calcFoundDelta > DELTA_WARNING_THRESHOLD);
  }

  return groups;
}

export function getVisibleGroupPoints(
  group: PointGroup,
  showAllPositions: boolean,
): { point: SurveyPoint; isFinal: boolean; opacity: number }[] {
  if (!showAllPositions) {
    return [{ point: group.finalPoint, isFinal: true, opacity: 1.0 }];
  }
  return group.allPoints.map(pt => ({
    point: pt,
    isFinal: pt.id === group.finalPoint.id,
    opacity: pt.id === group.finalPoint.id ? 1.0 : 0.4,
  }));
}
