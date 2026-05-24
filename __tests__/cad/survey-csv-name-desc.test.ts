import { describe, it, expect } from 'vitest';
import { parseCSV } from '@/lib/cad/import/csv-parser';
import { processImport } from '@/lib/cad/import/import-pipeline';
import { DEFAULT_CSV_CONFIG } from '@/lib/cad/import/types';
import { generateLabelsForFeature } from '@/lib/cad/labels';
import { DEFAULT_LAYER_DISPLAY_PREFERENCES, DEFAULT_DISPLAY_PREFERENCES, DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { Feature, Layer, SurveyPoint } from '@/lib/cad/types';

// Representative rows from the uploaded survey export (PtName, N, E, Z, Desc).
// Covers: pure-numeric code, code + trailing text, free-text description,
// a name containing a space, and a code with no space before its text.
const CSV = [
  '1,5000.000,5000.000,800.000,314',
  '40fnd,5060.428,4818.360,802.306,txdot row marker',
  '21fnd,5062.942,4808.510,802.021,310 ACS',
  '33fnd,5045.278,4989.083,800.293,309 cap 4636',
  '208,5088.489,4944.097,796.113,brick mail box w/ flower bed',
  '501 better,5114.077,4855.449,804.561,304',
  '502,5146.432,4873.652,800.207,731wood',
  '540,5074.000,4814.364,801.913,old 644',
].join('\n');

/** Mirror of the feature.properties the ImportDialog builds per point. */
function featureProps(pt: SurveyPoint) {
  return {
    pointId: pt.id,
    pointName: pt.pointName,
    code: pt.resolvedAlphaCode,
    description:
      [pt.rawCode, pt.description]
        .map((s) => (s == null ? '' : String(s).trim()))
        .filter(Boolean)
        .join(' ') || pt.resolvedAlphaCode,
  };
}

function pointFeature(pt: SurveyPoint): Feature {
  return {
    id: 'feat-' + pt.id,
    type: 'POINT',
    geometry: { type: 'POINT', point: { x: pt.easting, y: pt.northing } },
    layerId: 'L',
    style: { ...DEFAULT_FEATURE_STYLE },
    properties: featureProps(pt),
  };
}

const labelLayer: Layer = {
  id: 'L',
  name: 'Survey Points',
  color: '#000000',
  visible: true,
  locked: false,
  displayPreferences: {
    ...DEFAULT_LAYER_DISPLAY_PREFERENCES,
    showPointNames: true,
    showPointDescriptions: true,
  },
} as unknown as Layer;

describe('survey CSV: point name + full description extraction', () => {
  const rows = parseCSV(CSV, DEFAULT_CSV_CONFIG);
  const result = processImport(rows, 'upload.csv');
  const byName = new Map(result.points.map((p) => [p.pointName, p]));

  it('parses every row without dropping points', () => {
    expect(result.points.length).toBe(8);
  });

  it('keeps the raw point name (including names with spaces)', () => {
    expect(byName.has('1')).toBe(true);
    expect(byName.has('40fnd')).toBe(true);
    expect(byName.has('501 better')).toBe(true);
  });

  it('reconstructs the FULL description (code + trailing text)', () => {
    const cases: Record<string, string> = {
      '1': '314',
      '40fnd': 'txdot row marker',
      '21fnd': '310 ACS',
      '33fnd': '309 cap 4636',
      '208': 'brick mail box w/ flower bed',
      '501 better': '304',
      '502': '731wood',
      '540': 'old 644',
    };
    for (const [name, expected] of Object.entries(cases)) {
      const pt = byName.get(name)!;
      expect(pt, name).toBeTruthy();
      expect(featureProps(pt).description, name).toBe(expected);
    }
  });

  it('produces a POINT_NAME and POINT_DESCRIPTION label per point', () => {
    const pt = byName.get('21fnd')!;
    const labels = generateLabelsForFeature(pointFeature(pt), labelLayer, DEFAULT_DISPLAY_PREFERENCES);
    const name = labels.find((l) => l.kind === 'POINT_NAME');
    const desc = labels.find((l) => l.kind === 'POINT_DESCRIPTION');
    expect(name?.text).toBe('21fnd');
    expect(desc?.text).toBe('310 ACS');
  });

  it('shows long / unrecognized descriptions in full', () => {
    const pt = byName.get('208')!;
    const labels = generateLabelsForFeature(pointFeature(pt), labelLayer, DEFAULT_DISPLAY_PREFERENCES);
    const desc = labels.find((l) => l.kind === 'POINT_DESCRIPTION');
    expect(desc?.text).toBe('brick mail box w/ flower bed');
  });
});
