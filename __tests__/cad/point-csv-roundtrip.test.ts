// C12 — does a point survive export → import?
//
// The plan asks whether codes, descriptions and elevations come back intact. This measures it
// rather than assuming, and the answer for CSV is no: the export writes a column the importer has
// no slot for.
//
// ── THE SHAPE OF THE MISMATCH ───────────────────────────────────────────────────────────────────
//
// `PointDataViewer.bulkExport` writes six columns:
//
//     PointNumber, Northing, Easting, Elevation, Code, Description
//
// `CSVImportConfig.columns` has five: pointNumber, northing, easting, elevation, description.
// **There is no `code` index.** The importer instead DERIVES the code out of the description field
// (`codePosition: FIRST_WORD | ENTIRE_FIELD | CUSTOM_REGEX`).
//
// So a file this product exported, re-imported by this product, drops the Code column on the floor
// and reconstructs a code from the wrong field. Neither side is broken on its own — the exporter
// writes a sensible file and the importer reads a sensible file. They just do not agree, and
// nothing anywhere would say so.

import { describe, it, expect } from 'vitest';
import { parseCSV } from '@/lib/cad/import/csv-parser';
import type { CSVImportConfig } from '@/lib/cad/import/types';

/** The exact header + row shape `PointDataViewer.bulkExport` produces. */
function exportedCsv(rows: Array<{ name: string; n: number; e: number; z: number | null; code: string; desc: string }>): string {
  const header = 'PointNumber,Northing,Easting,Elevation,Code,Description';
  const lines = rows.map((r) =>
    [r.name, r.n.toFixed(4), r.e.toFixed(4), r.z == null ? '' : r.z.toFixed(4),
      `"${r.code.replace(/"/g, '""')}"`, `"${r.desc.replace(/"/g, '""')}"`].join(','));
  return [header, ...lines].join('\r\n') + '\r\n';
}

/** The config a surveyor would reasonably set for that file: description is the LAST column. */
const configPointingAtDescription: CSVImportConfig = {
  delimiter: ',', hasHeader: true, skipRows: 0, encoding: 'utf-8',
  columns: { pointNumber: 0, northing: 1, easting: 2, elevation: 3, description: 5 },
  coordinateOrder: 'NE', codePosition: 'ENTIRE_FIELD',
  presetName: null, presetId: null,
};

const SAMPLE = [{ name: '12', n: 1000.25, e: 2000.5, z: 812.33, code: 'BC02', desc: 'corner post' }];

describe('CSV round trip — what survives', () => {
  const csv = exportedCsv(SAMPLE);
  const [row] = parseCSV(csv, configPointingAtDescription);

  it('the point number survives', () => {
    expect(row.data?.pointNumber).toBe(12);
  });

  it('the coordinates survive', () => {
    expect(row.data?.northing).toBeCloseTo(1000.25, 4);
    expect(row.data?.easting).toBeCloseTo(2000.5, 4);
  });

  it('the elevation survives', () => {
    expect(row.data?.elevation).toBeCloseTo(812.33, 4);
  });
});

describe('C12 fix — an explicit code column is read', () => {
  /** The config that matches what this product actually exports. */
  const matchingConfig: CSVImportConfig = {
    ...configPointingAtDescription,
    columns: { ...configPointingAtDescription.columns, code: 4, description: 5 },
  };

  it('code AND description both survive now', () => {
    // Before the fix the config had no `code` index at all, so column 4 was unreachable: the code
    // came back as the description, or pointing `description` at column 4 lost the description
    // instead. Two fields in the file, one slot in the config — whichever you picked, the other
    // was dropped.
    const [row] = parseCSV(exportedCsv(SAMPLE), matchingConfig);
    expect(row.data?.rawCode).toBe('BC02');
    expect(row.data?.description).toBe('corner post');
  });

  it('leaves the description whole rather than carving a code out of it', () => {
    // With an explicit column there is nothing to extract — splitting the description would be
    // guessing at information the file already states.
    const csv = exportedCsv([{ name: '1', n: 1, e: 2, z: null, code: 'BC02', desc: 'FL fence line' }]);
    const [row] = parseCSV(csv, matchingConfig);
    expect(row.data?.rawCode).toBe('BC02');
    expect(row.data?.description).toBe('FL fence line');
  });

  it('still derives from the description when there is NO code column', () => {
    // The raw collector formats put code and description in one field, and that must keep working.
    const [row] = parseCSV(exportedCsv(SAMPLE), configPointingAtDescription);
    expect(row.data?.rawCode).toBe('corner post');
  });

  it('ignores a code index that points past the end of the row', () => {
    const cfg: CSVImportConfig = {
      ...configPointingAtDescription,
      columns: { ...configPointingAtDescription.columns, code: 99 },
    };
    const [row] = parseCSV(exportedCsv(SAMPLE), cfg);
    // Falls back to deriving rather than returning an empty code.
    expect(row.data?.rawCode).toBe('corner post');
  });
});

describe('the exporter quotes correctly, at least', () => {
  it('a description containing a comma survives the split', () => {
    const csv = exportedCsv([{ name: '1', n: 1, e: 2, z: null, code: 'X', desc: 'post, leaning' }]);
    const [row] = parseCSV(csv, configPointingAtDescription);
    expect(row.data?.rawCode).toBe('post, leaning');
  });

  it('a description containing a quote survives', () => {
    const csv = exportedCsv([{ name: '1', n: 1, e: 2, z: null, code: 'X', desc: 'the "old" fence' }]);
    const [row] = parseCSV(csv, configPointingAtDescription);
    expect(row.data?.rawCode).toBe('the "old" fence');
  });

  it('a blank elevation comes back as null rather than 0', () => {
    // Exported as an empty field. Parsing "" as a number gives NaN, and NaN silently becoming 0
    // would put every 2D point on the ground.
    const csv = exportedCsv([{ name: '1', n: 1, e: 2, z: null, code: 'X', desc: 'y' }]);
    const [row] = parseCSV(csv, configPointingAtDescription);
    expect(row.data?.elevation === null || Number.isNaN(row.data?.elevation)).toBe(true);
    expect(row.data?.elevation).not.toBe(0);
  });
});
