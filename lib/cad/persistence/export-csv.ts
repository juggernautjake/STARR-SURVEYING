// lib/cad/persistence/export-csv.ts — Export drawing data to CSV / Excel-compatible format
//
// Two flavours per Phase 7 §10 acceptance tests:
//
//   * "simplified"  — surveyor-readable. Code column shows the
//                     base monument code (e.g. "BC02") and the
//                     B/E/C/A line-control suffix lives in its
//                     own column so the dataset is sortable
//                     without the suffix poisoning groupings.
//   * "full"        — every available field including the AI
//                     pipeline's per-feature confidence + tier,
//                     the geometry layer style summary, and a
//                     spread of every custom property so a
//                     downstream tool can ingest the whole
//                     drawing.
//
// Both flavours sort by point number (ascending, missing last).

import type { DrawingDocument } from '../types';
import { parseCodeWithSuffix } from '../codes/code-suffix-parser';

export type CsvFlavor = 'simplified' | 'full';

export interface CsvSimplifiedRow {
  pointNo: string | number;
  northing: number;
  easting: number;
  elevation: number;
  /** Base monument code with any line-control suffix stripped. */
  code: string;
  /** Line-control suffix (B, E, BA, EA, C, A, …) or empty string. */
  suffix: string;
  description: string;
  layer: string;
}

export interface CsvFullRow extends CsvSimplifiedRow {
  /** Original code as the surveyor entered it (e.g. "BC02B"). */
  rawCode: string;
  /** Surveyor action — FOUND / SET / CALCULATED / NONE. */
  monumentAction: string;
  /** AI pipeline confidence score (0–100) when present. */
  aiConfidence: number | '';
  /** AI pipeline tier (1–5) when present. */
  aiTier: number | '';
  /** Stable feature id — useful for round-trips. */
  featureId: string;
  /** Layer hex colour for downstream styling. */
  layerColor: string;
  /** Feature-style line-type id (or layer fallback when null). */
  lineTypeId: string;
  /** Feature group id when grouped, blank otherwise. */
  featureGroupId: string;
  /** Spread of every custom property the feature carries. */
  properties: Record<string, string | number | boolean>;
}

interface BuildOptions {
  flavor?: CsvFlavor;
  /** Optional map of feature.id → ConfidenceScore for the
   *  full flavour. The AI engine surfaces this from the
   *  pipeline run; leave undefined for manually-drawn drawings
   *  and the columns will be blank. */
  scores?: Map<string, { score: number; tier: 1 | 2 | 3 | 4 | 5 }> | null;
}

interface BuildResult {
  rows: CsvSimplifiedRow[] | CsvFullRow[];
  flavor: CsvFlavor;
}

/** Build the CSV rows from a drawing document. */
export function buildCsvRows(doc: DrawingDocument, opts: BuildOptions = {}): BuildResult {
  const flavor = opts.flavor ?? 'simplified';
  const scores = opts.scores ?? null;

  const displayPrefs = doc.settings.displayPreferences;
  const originN = displayPrefs?.originNorthing ?? 0;
  const originE = displayPrefs?.originEasting ?? 0;

  const features = Object.values(doc.features);
  features.sort((a, b) => {
    const na = Number(a.properties?.pointNo ?? Infinity);
    const nb = Number(b.properties?.pointNo ?? Infinity);
    return na - nb;
  });

  const simplified: CsvSimplifiedRow[] = [];
  const full: CsvFullRow[] = [];

  for (const feature of features) {
    if (feature.hidden) continue;
    const g = feature.geometry;
    if (g.type !== 'POINT' || !g.point) continue;

    const layer = doc.layers[feature.layerId]?.name ?? feature.layerId;
    const layerColor = doc.layers[feature.layerId]?.color ?? '';
    const rawCode = String(feature.properties?.code ?? '');
    const parsed = rawCode ? parseCodeWithSuffix(rawCode) : null;
    const baseCode = parsed?.baseCode ?? rawCode;
    const suffix = parsed?.suffix ?? '';
    const description = String(
      feature.properties?.description ?? feature.properties?.name ?? ''
    );

    const base: CsvSimplifiedRow = {
      pointNo: feature.properties?.pointNo != null ? String(feature.properties.pointNo) : '',
      northing: g.point.y + originN,
      easting:  g.point.x + originE,
      elevation: Number(feature.properties?.elevation ?? 0),
      code: baseCode,
      suffix,
      description,
      layer,
    };

    if (flavor === 'simplified') {
      simplified.push(base);
      continue;
    }

    const score = scores?.get(feature.id) ?? null;
    const fullRow: CsvFullRow = {
      ...base,
      rawCode,
      monumentAction: String(feature.properties?.monumentAction ?? ''),
      aiConfidence: score?.score ?? '',
      aiTier:       score?.tier ?? '',
      featureId:    feature.id,
      layerColor,
      lineTypeId:   feature.style?.lineTypeId ?? doc.layers[feature.layerId]?.lineTypeId ?? '',
      featureGroupId: feature.featureGroupId ?? '',
      properties:   feature.properties ?? {},
    };
    full.push(fullRow);
  }

  return flavor === 'simplified'
    ? { rows: simplified, flavor }
    : { rows: full, flavor };
}

const CSV_ESCAPE = (v: string | number | boolean): string => {
  const s = String(v);
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/** Serialise rows to a CSV string. */
export function rowsToCsv(result: BuildResult): string {
  if (result.flavor === 'simplified') {
    const rows = result.rows as CsvSimplifiedRow[];
    const header = ['Point No', 'Northing', 'Easting', 'Elevation', 'Code', 'Suffix', 'Description', 'Layer'];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [r.pointNo, r.northing.toFixed(4), r.easting.toFixed(4), r.elevation.toFixed(4), r.code, r.suffix, r.description, r.layer]
          .map(CSV_ESCAPE)
          .join(','),
      ),
    ];
    return lines.join('\r\n');
  }

  const rows = result.rows as CsvFullRow[];
  // Union of every custom property key across rows so the
  // header stays stable for the whole sheet.
  const propKeySet = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r.properties)) {
      // Skip keys we already emit as first-class columns to
      // avoid double-printing `code` / `pointNo` / etc.
      if (['code', 'pointNo', 'description', 'name', 'elevation', 'monumentAction'].includes(k)) continue;
      propKeySet.add(k);
    }
  }
  const propKeys = Array.from(propKeySet).sort();

  const header = [
    'Point No', 'Northing', 'Easting', 'Elevation',
    'Code', 'Suffix', 'Raw Code', 'Monument Action',
    'AI Confidence', 'AI Tier',
    'Description', 'Layer', 'Layer Color', 'Line Type ID',
    'Feature ID', 'Feature Group ID',
    ...propKeys.map((k) => `prop:${k}`),
  ];

  const lines = [
    header.join(','),
    ...rows.map((r) => {
      const propCells = propKeys.map((k) => {
        const v = r.properties[k];
        return v == null ? '' : v;
      });
      return [
        r.pointNo,
        r.northing.toFixed(4), r.easting.toFixed(4), r.elevation.toFixed(4),
        r.code, r.suffix, r.rawCode, r.monumentAction,
        r.aiConfidence, r.aiTier,
        r.description, r.layer, r.layerColor, r.lineTypeId,
        r.featureId, r.featureGroupId,
        ...propCells,
      ].map(CSV_ESCAPE).join(',');
    }),
  ];
  return lines.join('\r\n');
}

/** Generate a CSV file download in the browser. */
export function downloadCsv(
  doc: DrawingDocument,
  opts: BuildOptions = {},
): { rowCount: number; flavor: CsvFlavor; filename: string } {
  const flavor = opts.flavor ?? 'simplified';
  const result = buildCsvRows(doc, opts);
  const csv = rowsToCsv(result);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const baseName = doc.name.replace(/\.csv$/i, '');
  const suffix = flavor === 'full' ? '-full' : '';
  const filename = `${baseName}${suffix}.csv`;
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(url);
  return { rowCount: result.rows.length, flavor, filename };
}
