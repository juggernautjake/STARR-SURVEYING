// lib/cad/geometry/legal-desc.ts — Legal description text generator
import type { Traverse, SurveyPoint } from '../types';
import { formatBearing, formatDMS } from './bearing';

export interface LegalDescConfig {
  format: 'METES_AND_BOUNDS';
  bearingPrecision: 'SECOND' | 'TENTH_SECOND';
  distancePrecision: number;       // Decimal places (0-4), default 2
  includeMonumentDescriptions: boolean;
  includeCurveData: boolean;
  basisOfBearings: string;
  datumStatement: string;
  areaDisplay: 'SQFT_AND_ACRES' | 'ACRES_ONLY';
}

export const DEFAULT_LEGAL_DESC_CONFIG: LegalDescConfig = {
  format: 'METES_AND_BOUNDS',
  bearingPrecision: 'SECOND',
  distancePrecision: 2,
  includeMonumentDescriptions: true,
  includeCurveData: true,
  basisOfBearings: '',
  datumStatement: '',
  areaDisplay: 'SQFT_AND_ACRES',
};

export function generateLegalDescription(
  traverse: Traverse,
  points: Map<string, SurveyPoint>,
  config: LegalDescConfig,
): string {
  const lines: string[] = [];

  let openingLine = 'BEGINNING at a point';
  if (config.includeMonumentDescriptions) {
    const startPt = points.get(traverse.pointIds[0]);
    if (startPt?.codeDefinition) {
      openingLine += `, a ${startPt.codeDefinition.description.toLowerCase()},`;
    }
  }
  lines.push(openingLine);

  for (let i = 0; i < traverse.legs.length; i++) {
    const leg = traverse.legs[i];
    const bearing = formatBearing(leg.bearing, config.bearingPrecision);
    const dist = leg.distance.toFixed(config.distancePrecision);

    let legLine: string;
    if (leg.isArc && leg.curveData && config.includeCurveData) {
      const cd = leg.curveData;
      const dir = cd.direction === 'RIGHT' ? 'right' : 'left';
      const deltaFmt = formatDMS(cd.delta * 180 / Math.PI);
      legLine =
        `THENCE along a curve to the ${dir}, having a radius of ${cd.R.toFixed(2)} feet, ` +
        `a central angle of ${deltaFmt}, an arc length of ${cd.L.toFixed(2)} feet, ` +
        `and a chord bearing of ${formatBearing(cd.CB * 180 / Math.PI, config.bearingPrecision)} ` +
        `for a chord distance of ${cd.C.toFixed(2)} feet`;
    } else {
      legLine = `THENCE ${bearing}, a distance of ${dist} feet`;
    }

    if (config.includeMonumentDescriptions && i < traverse.legs.length - 1) {
      const destPt = points.get(leg.toPointId);
      if (destPt?.codeDefinition?.category === 'BOUNDARY_CONTROL') {
        legLine += ` to a ${destPt.codeDefinition.description.toLowerCase()}`;
      }
    }

    if (!legLine.endsWith(';')) {
      legLine += ';';
    }
    lines.push(legLine);
  }

  lines.push('THENCE to the POINT OF BEGINNING.');

  if (traverse.area) {
    const acres = traverse.area.acres.toFixed(4);
    const sqft = Math.round(traverse.area.squareFeet).toLocaleString();
    if (config.areaDisplay === 'SQFT_AND_ACRES') {
      lines.push(`CONTAINING ${sqft} square feet (${acres} acres), more or less.`);
    } else {
      lines.push(`CONTAINING ${acres} acres, more or less.`);
    }
  }

  if (config.basisOfBearings) {
    lines.push(`BASIS OF BEARINGS: ${config.basisOfBearings}.`);
  }

  return lines.join('\n\n');
}
