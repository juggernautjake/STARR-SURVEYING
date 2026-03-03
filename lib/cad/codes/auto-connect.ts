// lib/cad/codes/auto-connect.ts
import type { SurveyPoint, LineString, LineSegmentType } from '../types';
import { generateId } from '../types';
import { lookupCode } from './code-lookup';

const AUTO_SPLINE_CODES = new Set([
  '630', '632', '633', '634',
  '729', '357', '358',
  'TP06', 'TP07', 'TP08', 'TP09', 'TP10', 'TP11',
  'VG07', 'VG08', 'FN11',
  'PL08', 'PL09',
]);

export function isAutoSplineCode(baseCode: string): boolean {
  return AUTO_SPLINE_CODES.has(baseCode.toUpperCase());
}

export function markAutoSplineStrings(lineStrings: LineString[]): void {
  for (const ls of lineStrings) {
    if (isAutoSplineCode(ls.codeBase)) {
      ls.segments = ls.segments.map(s => s === 'STRAIGHT' ? 'SPLINE' as LineSegmentType : s);
    }
  }
}

export function buildLineStrings(points: SurveyPoint[]): LineString[] {
  const strings: LineString[] = [];
  // Track current open line string per code base (support parallel lines of same code)
  const currentByCode = new Map<string, LineString>();

  for (const point of points) {
    const baseCode = point.parsedCode.baseCode;
    const suffix = point.codeSuffix;
    const codeDef = lookupCode(baseCode);

    if (!codeDef || codeDef.connectType === 'POINT') continue;

    const current = currentByCode.get(baseCode) ?? null;

    switch (suffix) {
      case 'B': {
        const ls: LineString = {
          id: generateId(), codeBase: baseCode, pointIds: [point.id],
          isClosed: false, segments: [], featureId: null,
        };
        strings.push(ls);
        currentByCode.set(baseCode, ls);
        break;
      }
      case 'BA': {
        const ls: LineString = {
          id: generateId(), codeBase: baseCode, pointIds: [point.id],
          isClosed: false, segments: [], featureId: null,
        };
        strings.push(ls);
        currentByCode.set(baseCode, ls);
        break;
      }
      case null: {
        if (current) {
          current.pointIds.push(point.id);
          const prevId = current.pointIds[current.pointIds.length - 2];
          const prevPoint = points.find(p => p.id === prevId);
          const prevSuffix = prevPoint?.codeSuffix;
          current.segments.push(prevSuffix === 'BA' || prevSuffix === 'A' ? 'ARC' : 'STRAIGHT');
        } else {
          const ls: LineString = {
            id: generateId(), codeBase: baseCode, pointIds: [point.id],
            isClosed: false, segments: [], featureId: null,
          };
          strings.push(ls);
          currentByCode.set(baseCode, ls);
        }
        break;
      }
      case 'A': {
        if (current) {
          current.pointIds.push(point.id);
          current.segments.push('ARC');
        }
        break;
      }
      case 'EA': {
        if (current) {
          current.pointIds.push(point.id);
          current.segments.push('ARC');
        }
        break;
      }
      case 'E': {
        if (current) {
          current.pointIds.push(point.id);
          current.segments.push('STRAIGHT');
        }
        currentByCode.delete(baseCode);
        break;
      }
      case 'C': {
        if (current) {
          current.pointIds.push(point.id);
          current.segments.push('STRAIGHT');
          current.isClosed = true;
        }
        currentByCode.delete(baseCode);
        break;
      }
      case 'CA': {
        if (current) {
          current.pointIds.push(point.id);
          current.segments.push('ARC');
          current.isClosed = true;
        }
        currentByCode.delete(baseCode);
        break;
      }
    }
  }

  return strings;
}
