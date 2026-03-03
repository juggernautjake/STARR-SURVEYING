// lib/cad/import/import-pipeline.ts
import type { SurveyPoint, LineString, PointGroup, ValidationIssue } from '../types';
import { generateId } from '../types';
import { parseCodeWithSuffix } from '../codes/code-suffix-parser';
import { parsePointName, resolveMonumentAction } from '../codes/name-suffix-parser';
import { lookupCode } from '../codes/code-lookup';
import { groupPointsByBaseName } from '../codes/point-grouping';
import { buildLineStrings, markAutoSplineStrings } from '../codes/auto-connect';
import { validatePoints } from './validation';
import type { ParsedImportRow } from './types';

export interface ImportResult {
  points: SurveyPoint[];
  lineStrings: LineString[];
  pointGroups: Map<number, PointGroup>;
  validationIssues: ValidationIssue[];
  stats: ImportStats;
}

export interface ImportStats {
  totalRows: number;
  parsedSuccessfully: number;
  parseErrors: number;
  recognizedCodes: number;
  unrecognizedCodes: number;
  pointCodeCount: number;
  lineCodeCount: number;
  lineStringsBuilt: number;
  pointGroupsFound: number;
  groupsWithCalcAndField: number;
  deltaWarnings: number;
  monumentsFound: number;
  monumentsSet: number;
  monumentsCalculated: number;
}

export function processImport(
  parsedRows: ParsedImportRow[],
  sourceFileName: string,
): ImportResult {
  const points: SurveyPoint[] = [];
  const stats: ImportStats = {
    totalRows: parsedRows.length,
    parsedSuccessfully: 0, parseErrors: 0,
    recognizedCodes: 0, unrecognizedCodes: 0,
    pointCodeCount: 0, lineCodeCount: 0,
    lineStringsBuilt: 0, pointGroupsFound: 0,
    groupsWithCalcAndField: 0, deltaWarnings: 0,
    monumentsFound: 0, monumentsSet: 0, monumentsCalculated: 0,
  };

  // Step 1: Convert parsed rows to SurveyPoints
  for (const row of parsedRows) {
    if (row.error || !row.data) {
      stats.parseErrors++;
      continue;
    }
    stats.parsedSuccessfully++;

    const d = row.data;
    const parsedCode = parseCodeWithSuffix(d.rawCode);
    const codeDef = lookupCode(parsedCode.baseCode);
    const parsedName = parsePointName(d.pointName);

    if (codeDef) stats.recognizedCodes++;
    else stats.unrecognizedCodes++;
    if (codeDef?.connectType === 'POINT') stats.pointCodeCount++;
    if (codeDef?.connectType === 'LINE') stats.lineCodeCount++;

    const monumentAction = resolveMonumentAction(codeDef, parsedName);
    if (monumentAction === 'FOUND') stats.monumentsFound++;
    if (monumentAction === 'SET') stats.monumentsSet++;
    if (monumentAction === 'CALCULATED') stats.monumentsCalculated++;

    const surveyPoint: SurveyPoint = {
      id: generateId(),
      pointNumber: d.pointNumber,
      pointName: d.pointName,
      parsedName,
      northing: d.northing,
      easting: d.easting,
      elevation: d.elevation,
      rawCode: d.rawCode,
      parsedCode,
      resolvedAlphaCode: codeDef?.alphaCode ?? parsedCode.baseCode,
      resolvedNumericCode: codeDef?.numericCode ?? parsedCode.baseCode,
      codeSuffix: parsedCode.suffix,
      codeDefinition: codeDef,
      monumentAction,
      description: d.description,
      rawRecord: row.rawLine,
      importSource: sourceFileName,
      layerId: codeDef?.defaultLayerId ?? 'MISC',
      featureId: '',
      lineStringIds: [],
      validationIssues: [],
      confidence: -1,   // -1 = "not yet scored"; Phase 6 AI engine populates this (0–100)
      isAccepted: true,
    };

    points.push(surveyPoint);
  }

  // Step 2: Build line strings
  const lineStrings = buildLineStrings(points);
  markAutoSplineStrings(lineStrings);
  stats.lineStringsBuilt = lineStrings.length;

  for (const ls of lineStrings) {
    for (const ptId of ls.pointIds) {
      const pt = points.find(p => p.id === ptId);
      if (pt) pt.lineStringIds.push(ls.id);
    }
  }

  // Step 3: Group points
  const pointGroups = groupPointsByBaseName(points);
  stats.pointGroupsFound = pointGroups.size;
  for (const group of pointGroups.values()) {
    if (group.hasBothCalcAndField) stats.groupsWithCalcAndField++;
    if (group.deltaWarning) stats.deltaWarnings++;
  }

  // Step 4: Validate
  const validationIssues = validatePoints(points, lineStrings, pointGroups);
  for (const issue of validationIssues) {
    const pt = points.find(p => p.id === issue.pointId);
    if (pt) pt.validationIssues.push(issue);
  }

  return { points, lineStrings, pointGroups, validationIssues, stats };
}

/** Get display code based on current display mode */
export function getDisplayCode(
  point: SurveyPoint,
  mode: 'ALPHA' | 'NUMERIC',
): string {
  const base = mode === 'ALPHA' ? point.resolvedAlphaCode : point.resolvedNumericCode;
  const suffix = point.codeSuffix ?? '';
  return base + suffix;
}

/** Export points to simplified CSV (dad-mode) */
export function exportToSimplifiedCSV(
  points: SurveyPoint[],
  useSimplifiedCodes: boolean,
): string {
  const lines: string[] = [];
  for (const pt of points) {
    const code = useSimplifiedCodes
      ? (pt.codeDefinition?.simplifiedCode ?? pt.resolvedNumericCode)
      : pt.resolvedNumericCode;
    const suffix = pt.codeSuffix ?? '';
    const elev = pt.elevation !== null ? pt.elevation.toFixed(4) : '';
    lines.push(`${pt.pointNumber},${pt.northing.toFixed(4)},${pt.easting.toFixed(4)},${elev},${code}${suffix}`);
  }
  return lines.join('\n');
}
