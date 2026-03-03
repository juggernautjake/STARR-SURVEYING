// lib/cad/import/csv-parser.ts
import type { ParsedImportRow, CSVImportConfig } from './types';

export function parseCSV(text: string, config: CSVImportConfig): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

  let startRow = config.hasHeader ? 1 : 0;
  startRow += config.skipRows;

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
      rows.push({ lineNumber: i + 1, rawLine: line, error: 'Insufficient columns', data: null });
      continue;
    }

    const ptNum = parseInt(cols[config.columns.pointNumber]);
    const rawN = parseFloat(cols[config.columns.northing]);
    const rawE = parseFloat(cols[config.columns.easting]);
    const z = config.columns.elevation >= 0 ? parseFloat(cols[config.columns.elevation]) : null;
    const desc = cols[config.columns.description]?.trim() ?? '';

    if (isNaN(ptNum) || isNaN(rawN) || isNaN(rawE)) {
      rows.push({ lineNumber: i + 1, rawLine: line, error: 'Invalid numeric value', data: null });
      continue;
    }

    const northing = config.coordinateOrder === 'NE' ? rawN : rawE;
    const easting = config.coordinateOrder === 'NE' ? rawE : rawN;

    const { code, remainder } = extractCode(desc, config);
    const pointName = cols[config.columns.pointNumber].trim();

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
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += char; }
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
