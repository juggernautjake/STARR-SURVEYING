// lib/cad/persistence/export-csv.ts — Export drawing data to CSV / Excel-compatible format
//
// Extracts every POINT feature in the drawing plus any named vertices from
// polylines/polygons that carry survey-point properties.  The output is a
// standard comma-separated values file that opens directly in Excel/Sheets.

import type { DrawingDocument, Feature } from '../types';

export interface CsvRow {
  pointNo: string | number;
  northing: number;
  easting: number;
  elevation: number;
  code: string;
  description: string;
  layer: string;
}

/** Build the CSV rows from a drawing document. */
export function buildCsvRows(doc: DrawingDocument): CsvRow[] {
  const rows: CsvRow[] = [];

  const displayPrefs = doc.settings.displayPreferences;
  const originN = displayPrefs?.originNorthing ?? 0;
  const originE = displayPrefs?.originEasting ?? 0;

  // Sort features by point number (properties.pointNo) when available
  const features = Object.values(doc.features);
  features.sort((a, b) => {
    const na = Number(a.properties?.pointNo ?? Infinity);
    const nb = Number(b.properties?.pointNo ?? Infinity);
    return na - nb;
  });

  for (const feature of features) {
    if (feature.hidden) continue;

    const g = feature.geometry;
    const layer = doc.layers[feature.layerId]?.name ?? feature.layerId;

    if (g.type === 'POINT' && g.point) {
      rows.push({
        pointNo: feature.properties?.pointNo ?? '',
        northing: g.point.y + originN,
        easting: g.point.x + originE,
        elevation: Number(feature.properties?.elevation ?? 0),
        code: String(feature.properties?.code ?? ''),
        description: String(feature.properties?.description ?? feature.properties?.name ?? ''),
        layer,
      });
    }
  }

  return rows;
}

/** Serialise rows to a CSV string. */
export function rowsToCsv(rows: CsvRow[]): string {
  const header = ['Point No', 'Northing', 'Easting', 'Elevation', 'Code', 'Description', 'Layer'];

  const escape = (v: string | number): string => {
    const s = String(v);
    // Wrap in quotes if the value contains a comma, quote or newline
    if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [r.pointNo, r.northing.toFixed(4), r.easting.toFixed(4), r.elevation.toFixed(4), r.code, r.description, r.layer]
        .map(escape)
        .join(','),
    ),
  ];
  return lines.join('\r\n');
}

/** Generate a CSV file download in the browser. */
export function downloadCsv(doc: DrawingDocument): { rowCount: number } {
  const rows = buildCsvRows(doc);
  const csv = rowsToCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `${doc.name}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
  return { rowCount: rows.length };
}
