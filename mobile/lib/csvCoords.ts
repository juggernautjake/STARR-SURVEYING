/**
 * CSV coordinate parser + P,N,E,Z,D format detection.
 *
 * Closes the F5 deferral *"CSV parser (P,N,E,Z,D and variants);
 * auto-link CSV rows to phone-side data points by name."*
 *
 * The Trimble (and Carlson, Topcon, Leica) field-controller export
 * format is `Point, Northing, Easting, Elevation, Description` —
 * commonly written as P,N,E,Z,D. Real-world variants we accept:
 *   - With or without a header row.
 *   - Comma OR tab OR semicolon separators.
 *   - Quoted fields with embedded commas (e.g.
 *     `BM01,3120456.123,1234567.890,892.45,"Found rebar, cap stamped"`).
 *   - Either P,N,E,Z,D or N,E,Z,D,P column order (some platforms
 *     swap the name to the end).
 *
 * Pure module — no React, no Supabase, no expo. Trivially testable.
 *
 * Usage:
 *   const text = await fetch(localUri).then(r => r.text());
 *   const result = parseCoordCsv(text);
 *   if (result.format === 'pnezd') {
 *     // result.rows[i] = { name, northing, easting, elevation, description }
 *   }
 */

export type CoordFormat =
  /** Point name first: P, N, E, Z, D (Trimble Survey Pro default). */
  | 'pnezd'
  /** Point name last: N, E, Z, D, P (Carlson SurvCE export). */
  | 'nezdp'
  /** Couldn't auto-detect — caller renders the raw grid. */
  | 'unknown';

export type Separator = ',' | '\t' | ';';

export interface ParsedCoordRow {
  /** 1-based row number for surfacing parse errors in the UI. */
  rowNumber: number;
  /** Surveyor-assigned point name (e.g. BM01). Null when the
   *  field was empty in the source row. */
  name: string | null;
  northing: number | null;
  easting: number | null;
  elevation: number | null;
  description: string | null;
  /** The raw cells, kept around so the UI can render the
   *  unparsed view side-by-side with the structured one. */
  raw: string[];
}

export interface CoordCsvResult {
  format: CoordFormat;
  /** ',', '\t', or ';' — sniffed from the first line. Null on
   *  empty input. */
  separator: Separator | null;
  /** True when the first row was a header (skipped from rows[]). */
  hasHeader: boolean;
  /** Detected column order; useful when format is 'unknown' so the
   *  UI can label the raw grid. */
  columnLabels: string[];
  rows: ParsedCoordRow[];
  /** Total cell rows in the file BEFORE we filtered blanks +
   *  headers. The UI shows "X rows · Y matched" so we want the
   *  meaningful denominator. */
  parsedCount: number;
  /** Soft errors — mismatched column count, unparseable numerics
   *  on a row that otherwise looks like a coord row. The UI can
   *  surface these as warnings. */
  warnings: string[];
}

/** Sniff the most-common separator from the first ~200 chars.
 *  Tab beats comma beats semicolon when frequencies tie. */
export function sniffSeparator(text: string): Separator | null {
  const sample = text.slice(0, 500);
  if (!sample.trim()) return null;
  const tabs = (sample.match(/\t/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  const semis = (sample.match(/;/g) ?? []).length;
  if (tabs > commas && tabs > semis) return '\t';
  if (semis > commas && semis > tabs) return ';';
  return ',';
}

/**
 * RFC-4180-ish split: handles double-quote escapes and embedded
 * separators. Stops at end-of-line; pre-strip CR before calling.
 */
function splitLine(line: string, sep: Separator): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === sep) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** True when the cell parses cleanly as a finite decimal — the
 *  N / E / Z columns all need this. Allows commas-as-thousands
 *  separators (some European exports). */
function isNumeric(cell: string): boolean {
  if (!cell) return false;
  const cleaned = cell.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return false;
  const n = parseFloat(cleaned);
  return Number.isFinite(n);
}

function toNumber(cell: string): number | null {
  if (!cell) return null;
  const cleaned = cell.replace(/,/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Decide whether the first row is a header (descriptive text) or
 * a coord row. Heuristic: a header row has no numeric cells in
 * positions where data rows would; a data row has 3+ numerics.
 */
function looksLikeHeader(cells: string[]): boolean {
  const numericCount = cells.filter(isNumeric).length;
  // Header rows usually have 0 numerics (column titles like "P,N,E,Z,D").
  // Data rows have at least 3 (N, E, Z minimum).
  return numericCount === 0 && cells.length >= 3;
}

/**
 * Decide the column order. Looks at the first 3 non-blank rows and
 * counts how many fit each candidate format.
 *
 *   pnezd: col 0 non-numeric (point name) + cols 1..3 numeric
 *   nezdp: cols 0..2 numeric (N, E, Z) + col 4 non-numeric
 */
function detectFormat(rows: string[][]): CoordFormat {
  if (rows.length === 0) return 'unknown';
  const sample = rows.slice(0, Math.min(rows.length, 5));
  let pnezd = 0;
  let nezdp = 0;
  for (const r of sample) {
    if (r.length < 4) continue;
    const c0Num = isNumeric(r[0]);
    const c1Num = isNumeric(r[1]);
    const c2Num = isNumeric(r[2]);
    const c3Num = isNumeric(r[3]);
    // P,N,E,Z[,D] → c0 alpha, c1+c2+c3 numeric.
    if (!c0Num && c1Num && c2Num && c3Num) pnezd += 1;
    // N,E,Z,D,P → c0+c1+c2 numeric, c3 alpha (description), c4 alpha (point).
    // Soften: also accept N,E,Z,P (no description) where col 3 is the alpha point.
    if (c0Num && c1Num && c2Num && !c3Num) nezdp += 1;
  }
  if (pnezd > nezdp) return 'pnezd';
  if (nezdp > pnezd) return 'nezdp';
  return 'unknown';
}

/**
 * Parse a CSV-like file of survey coordinates into structured
 * rows + soft warnings. Robust to junk lines (blank rows, weird
 * trailing newlines, comments starting with `#` are skipped).
 */
export function parseCoordCsv(text: string): CoordCsvResult {
  const warnings: string[] = [];
  const separator = sniffSeparator(text);
  if (!separator) {
    return {
      format: 'unknown',
      separator: null,
      hasHeader: false,
      columnLabels: [],
      rows: [],
      parsedCount: 0,
      warnings: ['Empty file.'],
    };
  }

  // Normalise newlines + drop comment + blank lines.
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.startsWith('#'));

  if (lines.length === 0) {
    return {
      format: 'unknown',
      separator,
      hasHeader: false,
      columnLabels: [],
      rows: [],
      parsedCount: 0,
      warnings: ['No data rows.'],
    };
  }

  const splitRows = lines.map((l) => splitLine(l, separator));
  let hasHeader = looksLikeHeader(splitRows[0]);
  let dataRows = hasHeader ? splitRows.slice(1) : splitRows;
  const headerRow = hasHeader ? splitRows[0] : [];

  // Detect format from the data rows. If the first row itself
  // looked like data + the format is unknown, the looksLikeHeader
  // heuristic was wrong (a coord row with all-numeric cells will
  // never trigger it; this guard exists for files where the first
  // row HAS strings + we mistakenly tagged it as header).
  let format = detectFormat(dataRows);
  if (format === 'unknown' && hasHeader) {
    // Try treating the header as data.
    const tryFormat = detectFormat(splitRows);
    if (tryFormat !== 'unknown') {
      hasHeader = false;
      dataRows = splitRows;
      format = tryFormat;
    }
  }

  // Column labels for the raw-grid view. Use the header row when
  // present, otherwise synthesise from the format.
  const columnLabels =
    hasHeader && headerRow.length > 0
      ? headerRow
      : format === 'pnezd'
        ? ['Point', 'Northing', 'Easting', 'Elevation', 'Description']
        : format === 'nezdp'
          ? ['Northing', 'Easting', 'Elevation', 'Description', 'Point']
          : dataRows[0]?.map((_, i) => `Col ${i + 1}`) ?? [];

  const rows: ParsedCoordRow[] = dataRows.map((cells, idx) => {
    const rowNumber = idx + (hasHeader ? 2 : 1);
    if (format === 'pnezd') {
      const n = toNumber(cells[1] ?? '');
      const e = toNumber(cells[2] ?? '');
      const z = toNumber(cells[3] ?? '');
      if (n == null && e == null && z == null) {
        warnings.push(`Row ${rowNumber}: no parseable coordinates.`);
      }
      return {
        rowNumber,
        name: cells[0]?.trim() || null,
        northing: n,
        easting: e,
        elevation: z,
        description: cells[4]?.trim() || null,
        raw: cells,
      };
    }
    if (format === 'nezdp') {
      const n = toNumber(cells[0] ?? '');
      const e = toNumber(cells[1] ?? '');
      const z = toNumber(cells[2] ?? '');
      // Two shapes: N,E,Z,D,P (point at col 4) or N,E,Z,P (point at col 3).
      const desc = cells.length >= 5 ? cells[3]?.trim() || null : null;
      const name =
        cells.length >= 5
          ? cells[4]?.trim() || null
          : cells[3]?.trim() || null;
      return {
        rowNumber,
        name,
        northing: n,
        easting: e,
        elevation: z,
        description: desc,
        raw: cells,
      };
    }
    // Unknown format — surface the row as raw cells with no
    // structured fields. The UI shows the raw grid so the
    // surveyor can still review the file.
    return {
      rowNumber,
      name: null,
      northing: null,
      easting: null,
      elevation: null,
      description: null,
      raw: cells,
    };
  });

  return {
    format,
    separator,
    hasHeader,
    columnLabels,
    rows,
    parsedCount: rows.length,
    warnings,
  };
}

/**
 * Match parsed rows against a list of known data-point names
 * (case-insensitive). Returns a Set so the UI can do O(1)
 * "is this row matched?" lookups.
 */
export function matchedRowNames(
  rows: ParsedCoordRow[],
  knownNames: string[]
): Set<string> {
  const normalised = new Set(
    knownNames.map((n) => n.toLowerCase().trim()).filter(Boolean)
  );
  const matched = new Set<string>();
  for (const r of rows) {
    if (!r.name) continue;
    const key = r.name.toLowerCase().trim();
    if (normalised.has(key)) {
      matched.add(r.name);
    }
  }
  return matched;
}
