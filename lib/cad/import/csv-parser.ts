// lib/cad/import/csv-parser.ts
import type { ParsedImportRow, CSVImportConfig } from './types';
import { cadLog } from '../logger';

export function parseCSV(text: string, config: CSVImportConfig): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

  let startRow = config.hasHeader ? 1 : 0;
  startRow += config.skipRows;

  cadLog.info('CSVParser', `Parsing CSV: ${lines.length} total lines, start row ${startRow}, delimiter "${config.delimiter}"`);

  // Synthetic, always-unique numbers for points whose NAME isn't
  // numeric (e.g. "Temp0000", "MON1"). Negative so they never collide
  // with real point numbers and cluster together when sorting by #.
  // The display name (pointName) keeps the raw string regardless.
  let syntheticSeq = -1;

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i];
    const cols = splitLine(line, config.delimiter);

    const maxColNeeded = Math.max(
      config.columns.pointNumber,
      config.columns.northing,
      config.columns.easting,
      config.columns.description,
      config.columns.elevation >= 0 ? config.columns.elevation : 0,
    );

    if (cols.length < maxColNeeded + 1) {
      cadLog.warn('CSVParser', `Line ${i + 1}: only ${cols.length} column(s), expected at least ${maxColNeeded + 1} — skipped`);
      rows.push({ lineNumber: i + 1, rawLine: line, error: 'Insufficient columns', data: null });
      continue;
    }

    const rawName = cols[config.columns.pointNumber]?.trim() ?? '';
    // Point names are commonly alphanumeric ("20fnd", "Temp0000",
    // "23set"). Keep the raw name; derive a numeric pointNumber from
    // any leading digits, else assign a synthetic unique number.
    // A non-numeric NAME must NOT drop the point — only invalid
    // coordinates do.
    const leadingDigits = rawName.match(/^\d+/);
    const ptNum = leadingDigits ? parseInt(leadingDigits[0], 10) : syntheticSeq--;
    const rawN = parseFloat(cols[config.columns.northing]);
    const rawE = parseFloat(cols[config.columns.easting]);
    const z = config.columns.elevation >= 0 ? parseFloat(cols[config.columns.elevation]) : null;
    const desc = cols[config.columns.description]?.trim() ?? '';

    if (isNaN(rawN) || isNaN(rawE)) {
      cadLog.warn('CSVParser', `Line ${i + 1}: invalid coordinate (N=${rawN}, E=${rawE}) — skipped`);
      rows.push({ lineNumber: i + 1, rawLine: line, error: 'Invalid coordinate value', data: null });
      continue;
    }

    const northing = config.coordinateOrder === 'NE' ? rawN : rawE;
    const easting = config.coordinateOrder === 'NE' ? rawE : rawN;

    // C12 — an explicit code column wins over deriving one from the description.
    //
    // When the file HAS a code column, splitting the description to find a code would be guessing
    // at information the file already states. When it does not (the raw collector formats, where
    // code and description share one field), `extractCode` is still the only way and stays the
    // default. The description is left whole in the explicit case — there is nothing to carve out
    // of it.
    const codeIdx = config.columns.code;
    const hasCodeColumn = typeof codeIdx === 'number' && codeIdx >= 0 && codeIdx < cols.length;
    const { code, remainder } = hasCodeColumn
      ? { code: cols[codeIdx]?.trim() ?? '', remainder: desc }
      : extractCode(desc, config);
    const pointName = rawName;

    rows.push({
      lineNumber: i + 1,
      rawLine: line,
      error: null,
      data: {
        pointNumber: ptNum,
        pointName,
        northing,
        easting,
        elevation: z !== null && !isNaN(z) ? z : null,
        rawCode: code,
        description: remainder,
      },
    });
  }

  return rows;
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === ',') {
    // C12 — a doubled quote inside a quoted field is ONE literal quote (RFC 4180).
    //
    // This previously read `if (char === '"') inQuotes = !inQuotes;` — a quote was always a toggle
    // and never emitted. So `""` toggled off then on and produced NOTHING: a description exported
    // as `the "old" fence` (which this product's own CSV export correctly writes as
    // `"the ""old"" fence"`) came back as `the old fence`. Silent data loss on a round trip through
    // two pieces of code that were each individually right.
    //
    // Found by a round-trip test rather than by reading either side, which is the point of C12:
    // an exporter and an importer can both be correct and still not agree.
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // consume the second quote of the pair
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }
  return line.split(delimiter).map(s => s.trim());
}

function extractCode(
  description: string,
  config: CSVImportConfig,
): { code: string; remainder: string } {
  if (config.codePosition === 'ENTIRE_FIELD') {
    return { code: description, remainder: '' };
  }
  if (config.codePosition === 'CUSTOM_REGEX' && config.codeRegex) {
    try {
      const match = description.match(new RegExp(config.codeRegex));
      if (match) {
        return { code: match[1] || match[0], remainder: description.replace(match[0], '').trim() };
      }
    } catch {
      // Fall through to FIRST_WORD
    }
  }
  const spaceIdx = description.search(/\s/);
  if (spaceIdx === -1) return { code: description, remainder: '' };
  return {
    code: description.substring(0, spaceIdx),
    remainder: description.substring(spaceIdx + 1).trim(),
  };
}

/** Auto-detect delimiter from first few lines */
export function detectDelimiter(text: string): CSVImportConfig['delimiter'] {
  const sample = text.split('\n').slice(0, 5).join('\n');
  const counts = {
    ',': (sample.match(/,/g) || []).length,
    '\t': (sample.match(/\t/g) || []).length,
    '|': (sample.match(/\|/g) || []).length,
    ';': (sample.match(/;/g) || []).length,
    ' ': 0, // Avoid over-detecting spaces
  };
  const best = Object.entries(counts).reduce((a, b) => b[1] > a[1] ? b : a);
  return best[0] as CSVImportConfig['delimiter'];
}

/** Auto-detect if file has a header row */
export function detectHasHeader(text: string): boolean {
  const firstLine = text.split('\n')[0] ?? '';
  // Header usually contains alphabetic column names
  const hasText = /[A-Za-z]{2,}/.test(firstLine);
  return hasText;
}
